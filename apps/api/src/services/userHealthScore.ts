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
  /**
   * @deprecated Read but no longer scored, 22 Sep 2026.
   *
   * It is `TaskManager.isTaskRegisteredAsync(DETECTION_TASK_NAME)` from the
   * heartbeat: the OLD JavaScript detection task. Every current build runs
   * the native engine instead, so it is false for the entire fleet (400 of
   * 400 users checked, 37 Android and 345 iOS, not one true). Scoring it
   * took a flat 15 points off everybody, which meant nobody could score
   * above 85 and any healthy driver missing two real factors fell into
   * "warning". Marie MOG, a paying subscriber with 173 trips in her first
   * month, every permission granted and an empty sync queue, scored 80 and
   * showed "Tracking task: not running" as a fault.
   *
   * Kept in the interface so callers need not change; ignored in the score.
   * The same column also nearly shipped a dead watchdog check the day before.
   */
  trackingTaskActive?: boolean | null;
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

  // 2. Tracking task active — REMOVED 22 Sep 2026, see HealthScoreInput.
  // It scored 0 for every user alive, so it was a flat 15-point penalty on
  // the whole fleet and nothing else.

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

  // Every factor above is read from the LAST heartbeat. A heartbeat more
  // than a week old says nothing about the phone today - the permission
  // may have been revoked since, or granted since (Rakesh Patel, 18 Aug
  // 2026, would have scored "good" on a 17-day-old "granted"). So a stale
  // heartbeat caps the band at "unknown" however the points add up; the
  // score is still returned so the list can sort on it.
  const heartbeatAgeMs = input.lastHeartbeatAt
    ? Date.now() - input.lastHeartbeatAt.getTime()
    : null;
  const heartbeatTooOld = heartbeatAgeMs !== null && heartbeatAgeMs >= 7 * DAY_MS;

  // Score out of what is actually scoreable, not out of a fixed 100. The
  // weights above keep their meaning relative to each other, and dropping a
  // factor cannot quietly become a penalty on the whole fleet again: the
  // denominator is whatever was really measured (22 Sep 2026).
  const maxTotal = factors.reduce((sum, f) => sum + f.max, 0);
  const score = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;

  let band: HealthScoreResult["band"];
  if (input.lastHeartbeatAt === null || heartbeatTooOld) {
    band = "unknown";
  } else if (input.bgLocationPermission === "denied") {
    // A phone that has refused background location cannot record a drive
    // the driver does not start by hand, whatever else is healthy. Without
    // this, denied + fetch denied + failed syncs scored 53 and read
    // "warning" (Anthony, 23 Sep 2026: that case is critical).
    band = "critical";
  } else if (score >= 75) {
    band = "good";
  } else if (score >= 50) {
    band = "warning";
  } else {
    band = "critical";
  }

  return { score, factors, band };
}
