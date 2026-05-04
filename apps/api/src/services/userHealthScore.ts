// Per-user health score — single 0-100 number composed from heartbeat
// telemetry. Lets admin sort/filter the user list to find users whose
// app is silently broken (permission revoked, sync queue stuck, JS
// runtime suspended, etc.) before they email support.
//
// Audit follow-up #2 of the aggregate health-dashboard upgrades. Built
// 4 May 2026 after James Taylor's case showed the existing telemetry
// has the signal but no aggregation surface.
//
// Intentionally simple — sum of factor scores. Returns the breakdown
// alongside the total so admin UI can show WHY a user is low.

export interface HealthScoreInput {
  bgLocationPermission: string | null;
  trackingTaskActive: boolean | null;
  backgroundFetchStatus: string | null;
  lastHeartbeatAt: Date | null;
  lastPendingSyncCount: number | null;
  lastSyncQueuePermFailed: number | null;
  lastDrivingSpeedAt: Date | null;
  secondsSinceLastTripPost: number | null;
}

export interface HealthScoreResult {
  /** 0–100 total. */
  score: number;
  /** Per-factor breakdown for the admin tooltip. */
  factors: Array<{
    key: string;
    label: string;
    points: number;
    max: number;
    /** Raw value that fed in. Helps admin decide if intervention is needed. */
    detail: string;
  }>;
  /** Coarse band for at-a-glance UI styling. */
  band: "good" | "warning" | "critical" | "unknown";
}

const FACTORS = {
  bgLocation: 20,        // The single biggest reliability factor.
  trackingTask: 15,      // Background task running = recordings can fire.
  backgroundFetch: 10,   // Allows finalize-on-launch to fire reliably.
  recentHeartbeat: 15,   // Have we heard from the device recently?
  pendingSync: 10,       // Queue should be empty most of the time.
  permFailedSync: 10,    // PermFailed > 0 means data lost without intervention.
  recentDriving: 10,     // Active driver = signal that the app actually works.
  recentTripPost: 10,    // Last trip reached the server <24h ago = sync healthy.
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function calculateUserHealthScore(input: HealthScoreInput): HealthScoreResult {
  const factors: HealthScoreResult["factors"] = [];
  let total = 0;

  // 1. Background location permission
  if (input.bgLocationPermission === "granted") {
    factors.push({ key: "bgLocation", label: "Background location: granted", points: FACTORS.bgLocation, max: FACTORS.bgLocation, detail: "granted" });
    total += FACTORS.bgLocation;
  } else if (input.bgLocationPermission === null) {
    factors.push({ key: "bgLocation", label: "Background location: unknown", points: 0, max: FACTORS.bgLocation, detail: "no heartbeat data" });
  } else {
    factors.push({ key: "bgLocation", label: `Background location: ${input.bgLocationPermission}`, points: 0, max: FACTORS.bgLocation, detail: input.bgLocationPermission });
  }

  // 2. Tracking task active
  if (input.trackingTaskActive === true) {
    factors.push({ key: "trackingTask", label: "Tracking task: active", points: FACTORS.trackingTask, max: FACTORS.trackingTask, detail: "true" });
    total += FACTORS.trackingTask;
  } else if (input.trackingTaskActive === false) {
    factors.push({ key: "trackingTask", label: "Tracking task: not running", points: 0, max: FACTORS.trackingTask, detail: "false" });
  } else {
    factors.push({ key: "trackingTask", label: "Tracking task: unknown", points: 0, max: FACTORS.trackingTask, detail: "no heartbeat data" });
  }

  // 3. Background fetch status
  if (input.backgroundFetchStatus === "available" || input.backgroundFetchStatus === "granted") {
    factors.push({ key: "backgroundFetch", label: "Background fetch: available", points: FACTORS.backgroundFetch, max: FACTORS.backgroundFetch, detail: input.backgroundFetchStatus });
    total += FACTORS.backgroundFetch;
  } else if (input.backgroundFetchStatus === null) {
    // Older builds don't report this — partial credit so they don't tank.
    factors.push({ key: "backgroundFetch", label: "Background fetch: unknown", points: Math.round(FACTORS.backgroundFetch / 2), max: FACTORS.backgroundFetch, detail: "no heartbeat data" });
    total += Math.round(FACTORS.backgroundFetch / 2);
  } else {
    factors.push({ key: "backgroundFetch", label: `Background fetch: ${input.backgroundFetchStatus}`, points: 0, max: FACTORS.backgroundFetch, detail: input.backgroundFetchStatus });
  }

  // 4. Recent heartbeat (proxy for "is the user actively using the app")
  if (input.lastHeartbeatAt) {
    const heartbeatAgeMs = Date.now() - input.lastHeartbeatAt.getTime();
    if (heartbeatAgeMs < 26 * HOUR_MS) {
      factors.push({ key: "recentHeartbeat", label: "Heartbeat fresh", points: FACTORS.recentHeartbeat, max: FACTORS.recentHeartbeat, detail: `${Math.round(heartbeatAgeMs / HOUR_MS)}h ago` });
      total += FACTORS.recentHeartbeat;
    } else if (heartbeatAgeMs < 7 * DAY_MS) {
      const partial = Math.round(FACTORS.recentHeartbeat / 2);
      factors.push({ key: "recentHeartbeat", label: "Heartbeat stale", points: partial, max: FACTORS.recentHeartbeat, detail: `${Math.round(heartbeatAgeMs / DAY_MS)}d ago` });
      total += partial;
    } else {
      factors.push({ key: "recentHeartbeat", label: "Heartbeat very stale", points: 0, max: FACTORS.recentHeartbeat, detail: `${Math.round(heartbeatAgeMs / DAY_MS)}d ago` });
    }
  } else {
    factors.push({ key: "recentHeartbeat", label: "Never sent a heartbeat", points: 0, max: FACTORS.recentHeartbeat, detail: "null" });
  }

  // 5. Pending sync queue depth
  if (input.lastPendingSyncCount === 0) {
    factors.push({ key: "pendingSync", label: "Sync queue: empty", points: FACTORS.pendingSync, max: FACTORS.pendingSync, detail: "0" });
    total += FACTORS.pendingSync;
  } else if (input.lastPendingSyncCount === null) {
    // Older builds — partial credit.
    factors.push({ key: "pendingSync", label: "Sync queue: unknown", points: Math.round(FACTORS.pendingSync / 2), max: FACTORS.pendingSync, detail: "no heartbeat data" });
    total += Math.round(FACTORS.pendingSync / 2);
  } else if (input.lastPendingSyncCount < 5) {
    factors.push({ key: "pendingSync", label: "Sync queue: small backlog", points: Math.round(FACTORS.pendingSync / 2), max: FACTORS.pendingSync, detail: `${input.lastPendingSyncCount} pending` });
    total += Math.round(FACTORS.pendingSync / 2);
  } else {
    factors.push({ key: "pendingSync", label: "Sync queue: large backlog", points: 0, max: FACTORS.pendingSync, detail: `${input.lastPendingSyncCount} pending` });
  }

  // 6. Permanently failed sync items
  if (input.lastSyncQueuePermFailed === 0 || input.lastSyncQueuePermFailed === null) {
    factors.push({ key: "permFailedSync", label: "Perm-failed sync: none", points: FACTORS.permFailedSync, max: FACTORS.permFailedSync, detail: input.lastSyncQueuePermFailed === null ? "no heartbeat data" : "0" });
    total += FACTORS.permFailedSync;
  } else {
    factors.push({ key: "permFailedSync", label: "Perm-failed sync items present", points: 0, max: FACTORS.permFailedSync, detail: `${input.lastSyncQueuePermFailed} stuck` });
  }

  // 7. Recent driving signal
  if (input.lastDrivingSpeedAt) {
    const drivingAgeMs = Date.now() - input.lastDrivingSpeedAt.getTime();
    if (drivingAgeMs < 7 * DAY_MS) {
      factors.push({ key: "recentDriving", label: "Driving detected within 7 days", points: FACTORS.recentDriving, max: FACTORS.recentDriving, detail: `${Math.round(drivingAgeMs / DAY_MS)}d ago` });
      total += FACTORS.recentDriving;
    } else if (drivingAgeMs < 30 * DAY_MS) {
      const partial = Math.round(FACTORS.recentDriving / 2);
      factors.push({ key: "recentDriving", label: "Driving detected 7-30 days ago", points: partial, max: FACTORS.recentDriving, detail: `${Math.round(drivingAgeMs / DAY_MS)}d ago` });
      total += partial;
    } else {
      factors.push({ key: "recentDriving", label: "No recent driving detected", points: 0, max: FACTORS.recentDriving, detail: `${Math.round(drivingAgeMs / DAY_MS)}d ago` });
    }
  } else {
    // Older builds don't report — partial credit so they don't tank.
    factors.push({ key: "recentDriving", label: "Driving telemetry not reported", points: Math.round(FACTORS.recentDriving / 2), max: FACTORS.recentDriving, detail: "no heartbeat data" });
    total += Math.round(FACTORS.recentDriving / 2);
  }

  // 8. Recent trip POST (proxy for sync flow actually working)
  if (input.secondsSinceLastTripPost !== null) {
    if (input.secondsSinceLastTripPost < 24 * 60 * 60) {
      factors.push({ key: "recentTripPost", label: "Last trip reached server <24h ago", points: FACTORS.recentTripPost, max: FACTORS.recentTripPost, detail: `${Math.round(input.secondsSinceLastTripPost / 60)}m ago` });
      total += FACTORS.recentTripPost;
    } else if (input.secondsSinceLastTripPost < 7 * 24 * 60 * 60) {
      const partial = Math.round(FACTORS.recentTripPost / 2);
      factors.push({ key: "recentTripPost", label: "Last trip reached server 1-7 days ago", points: partial, max: FACTORS.recentTripPost, detail: `${Math.round(input.secondsSinceLastTripPost / 3600)}h ago` });
      total += partial;
    } else {
      factors.push({ key: "recentTripPost", label: "Last trip reached server >7 days ago", points: 0, max: FACTORS.recentTripPost, detail: `${Math.round(input.secondsSinceLastTripPost / (3600 * 24))}d ago` });
    }
  } else {
    factors.push({ key: "recentTripPost", label: "Trip-post telemetry not reported", points: Math.round(FACTORS.recentTripPost / 2), max: FACTORS.recentTripPost, detail: "no heartbeat data" });
    total += Math.round(FACTORS.recentTripPost / 2);
  }

  let band: HealthScoreResult["band"];
  if (input.lastHeartbeatAt === null) {
    band = "unknown";
  } else if (total >= 75) {
    band = "good";
  } else if (total >= 50) {
    band = "warning";
  } else {
    band = "critical";
  }

  return { score: total, factors, band };
}
