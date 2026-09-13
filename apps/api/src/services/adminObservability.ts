// Pure helpers behind the Sep 2026 admin observability endpoints
// (routes/admin/observability.ts). Everything here takes rows the route has
// already fetched and returns plain data, so it can be unit-tested without a
// database.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ── Support queue ──────────────────────────────────────────────────────────

/** Feedback statuses that mean nobody is waiting on us any more. */
const CLOSED_FEEDBACK_STATUSES = new Set(["done", "closed", "declined", "wont_fix", "shipped", "duplicate"]);

export function feedbackIsOpen(status: string | null | undefined): boolean {
  if (!status) return true;
  return !CLOSED_FEEDBACK_STATUSES.has(status.toLowerCase());
}

export interface ReplyLike {
  createdAt: Date;
  isAdmin: boolean;
}

/** Who spoke last on a thread: the person waiting is the other side. */
export function lastReplyBy(replies: ReplyLike[]): "admin" | "user" | null {
  if (replies.length === 0) return null;
  const last = [...replies].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return last.isAdmin ? "admin" : "user";
}

export function ageHours(now: number, at: Date): number {
  return Math.max(0, Math.round(((now - at.getTime()) / HOUR_MS) * 10) / 10);
}

/**
 * A missing-trip report is answered when a support reply or an admin-added
 * trip for that user follows it. Anything else is still waiting.
 */
export function missingTripAnswered(
  reportedAt: Date,
  followUps: Array<{ type: string; createdAt: Date }>
): boolean {
  return followUps.some(
    (f) =>
      (f.type === "support.reply_sent" || f.type === "admin.trip_created") &&
      f.createdAt.getTime() >= reportedAt.getTime()
  );
}

/**
 * Report ids an admin has explicitly marked handled from the support queue.
 * Keyed on the REPORT's event id rather than the user, so a report whose
 * account has since been deleted (userId nulled, its reply event gone with it)
 * can still be cleared. Mario Kyprianou, 12 Sep 2026: his report came back to
 * the queue as "(anonymous)" after he deleted, and nothing could ever answer it.
 */
export function handledReportIds(events: Array<{ metadata: unknown }>): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    const id = (e.metadata as { reportEventId?: unknown } | null | undefined)?.reportEventId;
    if (typeof id === "string" && id.length > 0) out.add(id);
  }
  return out;
}

// ── Android testers ────────────────────────────────────────────────────────

export type AndroidVerdict = "capturing" | "stub_fixes" | "silent" | "new" | "no_permission" | "gone";

export interface AndroidTesterFacts {
  createdAt: Date;
  lastHeartbeatAt: Date | null;
  bgLocationPermission: string | null;
  autoTrips7d: number;
  stubTrips7d: number;
  now: number;
}

/**
 * One word per tester. "stub_fixes" is the Class 34 signature: auto trips
 * exist but most have three or fewer points, so the engine woke for a fix and
 * never tracked. "silent" is an old enough install, granted permission, and
 * no auto trip in a week.
 */
export function classifyAndroidTester(f: AndroidTesterFacts): AndroidVerdict {
  const ageDays = (f.now - f.createdAt.getTime()) / DAY_MS;
  const heartbeatAgeDays = f.lastHeartbeatAt ? (f.now - f.lastHeartbeatAt.getTime()) / DAY_MS : Infinity;
  if (heartbeatAgeDays > 14) return "gone";
  if (f.bgLocationPermission && f.bgLocationPermission !== "granted") return "no_permission";
  if (f.autoTrips7d > 0) {
    return f.stubTrips7d >= Math.max(2, Math.ceil(f.autoTrips7d / 2)) ? "stub_fixes" : "capturing";
  }
  if (ageDays < 2) return "new";
  return "silent";
}

// ── Live Activity health ───────────────────────────────────────────────────

export interface LiveActivityEventLike {
  type: string;
  buildNumber: string | null;
  metadata: unknown;
}

export interface LiveActivityRollup {
  pushStarts: { ok: number; noToken: number; suppressedByPref: number; other: number };
  presence: { checks: number; present: number; rate: number | null };
  foregroundHeals: number;
  progressUpdates: { found: number; notFound: number };
  byBuild: Array<{ buildNumber: string; checks: number; present: number }>;
}

export function liveActivityRollup(events: LiveActivityEventLike[]): LiveActivityRollup {
  const out: LiveActivityRollup = {
    pushStarts: { ok: 0, noToken: 0, suppressedByPref: 0, other: 0 },
    presence: { checks: 0, present: 0, rate: null },
    foregroundHeals: 0,
    progressUpdates: { found: 0, notFound: 0 },
    byBuild: [],
  };
  const builds = new Map<string, { checks: number; present: number }>();
  for (const e of events) {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    switch (e.type) {
      case "la.push_start": {
        if (m.ok === true) out.pushStarts.ok++;
        else if (m.reason === "no_token") out.pushStarts.noToken++;
        else if (m.reason === "suppressed_by_pref" || m.reason === "pref_disabled") out.pushStarts.suppressedByPref++;
        else out.pushStarts.other++;
        break;
      }
      case "la.presence_check": {
        out.presence.checks++;
        const present = m.present === true;
        if (present) out.presence.present++;
        const b = e.buildNumber ?? "?";
        const row = builds.get(b) ?? { checks: 0, present: 0 };
        row.checks++;
        if (present) row.present++;
        builds.set(b, row);
        break;
      }
      case "la.foreground_heal":
        out.foregroundHeals++;
        break;
      case "la.progress_update": {
        if (m.found === false) out.progressUpdates.notFound++;
        else out.progressUpdates.found++;
        break;
      }
      default:
        break;
    }
  }
  out.presence.rate = out.presence.checks > 0 ? Math.round((out.presence.present / out.presence.checks) * 1000) / 10 : null;
  out.byBuild = [...builds.entries()]
    .map(([buildNumber, v]) => ({ buildNumber, ...v }))
    .sort((a, b) => b.checks - a.checks);
  return out;
}

// ── Watchdog liveness corroboration ────────────────────────────────────────

/**
 * Did this device demonstrably talk to the server AFTER the heartbeat the
 * watchdog is reasoning about?
 *
 * Why this exists (12 Sep 2026). The recording watchdog's pending-sync check
 * treats "heartbeat older than 30 minutes" as "the JS runtime is dead, so 30+
 * periodicTicks should have drained the queue by now". That inference is
 * invalid: `lastHeartbeatAt` and `lastPendingSyncCount` are written ONLY by
 * POST /user/heartbeat, and the mobile client rate-limits that to once per 24
 * hours (apps/mobile/lib/heartbeat, HEARTBEAT_INTERVAL_MS). A perfectly
 * healthy phone therefore has a 30-minutes-plus-stale heartbeat for roughly 23
 * of every 24 hours, and its pending-sync count is a snapshot up to a day old.
 * Three users hit the 4-attempts cap on production that day; all three were on
 * iOS with valid push tokens and were saving trips while the watchdog declared
 * their push delivery "structurally broken" — one had a heartbeat frozen at
 * 07:29 and created trips at 16:28 and 16:46.
 *
 * The server already holds the disproof: a Trip row or a device-originated
 * AppEvent row created after that heartbeat is proof the app reached us since
 * the snapshot, so the snapshot is simply out of date rather than evidence of a
 * dead runtime. Callers must pass only DEVICE-ORIGINATED activity: server-side
 * families (notification.*, watchdog.*, billing.* …) are logged against a
 * userId while the device is dark, so counting them would suppress the pushes
 * that genuinely-stuck users need.
 *
 * Strictly-newer comparison: the heartbeat request itself can write rows in the
 * same instant, and those prove nothing beyond the heartbeat we already have.
 *
 * A null heartbeat returns false: there is no snapshot to be stale, so there is
 * nothing for activity to disprove, and with no reference point a months-old
 * trip would otherwise read as "alive". The watchdog's own selection query
 * already requires a non-null heartbeat.
 */
export function deviceProvedAliveSince(
  lastHeartbeatAt: Date | null | undefined,
  latestActivityAt: Date | null | undefined
): boolean {
  if (!lastHeartbeatAt || !latestActivityAt) return false;
  return latestActivityAt.getTime() > lastHeartbeatAt.getTime();
}

// ── Trip quality ───────────────────────────────────────────────────────────

export interface TripQualityRow {
  isManualEntry: boolean;
  isPhantomTrip: boolean;
  coordinateCount: number;
  platform: string | null;
}

export interface TripQualityRollup {
  autoTrips: number;
  manualTrips: number;
  stubTrips: number;
  stubRate: number | null;
  phantomFlagged: number;
  avgCoords: number | null;
  byPlatform: Array<{ platform: string; autoTrips: number; stubTrips: number; stubRate: number | null }>;
}

/** A captured trip with three or fewer points never really tracked. */
export const STUB_COORD_MAX = 3;

export function tripQualityRollup(rows: TripQualityRow[]): TripQualityRollup {
  let autoTrips = 0;
  let manualTrips = 0;
  let stubTrips = 0;
  let phantomFlagged = 0;
  let coordSum = 0;
  const platforms = new Map<string, { autoTrips: number; stubTrips: number }>();
  for (const r of rows) {
    if (r.isManualEntry) {
      manualTrips++;
      continue;
    }
    autoTrips++;
    coordSum += r.coordinateCount;
    if (r.isPhantomTrip) phantomFlagged++;
    const stub = r.coordinateCount <= STUB_COORD_MAX;
    if (stub) stubTrips++;
    const key = r.platform ?? "unknown";
    const p = platforms.get(key) ?? { autoTrips: 0, stubTrips: 0 };
    p.autoTrips++;
    if (stub) p.stubTrips++;
    platforms.set(key, p);
  }
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  return {
    autoTrips,
    manualTrips,
    stubTrips,
    stubRate: pct(stubTrips, autoTrips),
    phantomFlagged,
    avgCoords: autoTrips > 0 ? Math.round(coordSum / autoTrips) : null,
    byPlatform: [...platforms.entries()]
      .map(([platform, v]) => ({ platform, ...v, stubRate: pct(v.stubTrips, v.autoTrips) }))
      .sort((a, b) => b.autoTrips - a.autoTrips),
  };
}
