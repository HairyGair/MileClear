// What a recording that has just opened remembers about itself, and what it
// tells the server when it ends without a trip. The pure part: no React
// Native, no SQLite, so it runs under vitest.
//
// Why (1 Nov 2026 Android finish report): 5.8% of Android recording opens end
// in trip.recording_dropped "no_coords" (iOS 0.5%), and about 1 open in 10 on
// both platforms ends with neither a trip within an hour nor a drop event.
// Neither could be explained from the server: a drop said how many fixes the
// buffer held but not what opened the recording, whether the fixes ever
// reached the JavaScript that saves them, or what the phone's location engine
// was doing. This module is the memory that makes those answerable.
//
// One small JSON value in tracking_state (`recording_open_ctx`) is written
// when a native recording opens and updated, cheaply and only for the first
// few fixes, as fixes arrive. Every `trip.recording_dropped` event then
// carries its id (`openId`), so the server can join signal_start, the drop and
// the saved trip (`gpsQuality.openId`). No coordinates anywhere in it.

/** tracking_state key holding the current open's JSON. */
export const OPEN_CTX_KEY = "recording_open_ctx";

/** Fixes counted per open. The question is "did any arrive", so counting
 *  stops here and the per-fix cost stops with it. */
export const FIX_COUNT_CAP = 25;

/** A trip may start this long before the open (the departure anchor and the
 *  wake-lag extension restore the first minutes) and still belong to it. */
export const TRIP_BEFORE_OPEN_SLACK_MS = 30 * 60 * 1000;
/** ...and this long after it, or it is some later recording's trip. */
export const TRIP_AFTER_OPEN_MAX_MS = 12 * 60 * 60 * 1000;

export type OpenVia = "live" | "headless";

/** What the phone's location engine and OS said, in a few primitives. Android
 *  only: iOS does not expose most of it and does not have the gap. */
export interface EngineSnapshot {
  /** SDK enabled. */
  en?: boolean;
  /** SDK isMoving. */
  mv?: boolean;
  /** SDK trackingMode (0 geofences only, 1 location tracking). */
  tm?: number;
  /** The SDK launched the process in the background (no UI). */
  bg?: boolean;
  /** Location permission: 0 undetermined, 1 restricted, 2 denied, 3 always, 4 while using. */
  perm?: number;
  /** accuracyAuthorization: 0 precise, 1 approximate. */
  prec?: number;
  /** GPS provider on. */
  gps?: boolean;
  /** Network provider on. */
  net?: boolean;
  /** Location services on at all. */
  loc?: boolean;
  /** Android power-save mode. */
  ps?: boolean;
  /** Battery percent. */
  bat?: number;
  /** Charging. */
  chg?: boolean;
  /** Phone maker. */
  mfr?: string;
}

export interface OpenContext {
  /** Joins signal_start, the drop events and the saved trip. */
  id: string;
  /** Epoch ms the recording was armed. */
  at: number;
  /** Which rule opened it: SDK motion change, or a fast fix. */
  reason: "motion" | "speed";
  /** Handled by the headless task (app not running) or the live app. */
  via: OpenVia;
  /** React Native AppState at the open; null when unreadable. */
  appState: string | null;
  /** Age of the fix that opened it, ms (now minus its timestamp). */
  seedAgeMs: number | null;
  /** Fixes that reached handleNativeLocation after the open. */
  seen: number;
  /** ...of which were written to the buffer. */
  buffered: number;
  /** Epoch ms of the first fix seen after the open. */
  firstSeenAt?: number;
  /** Last place a fix after the open was set aside instead of buffered. */
  gate?: string;
  /** Engine state when it opened. */
  snap?: EngineSnapshot;
  /** How it ended once it has (a drop reason, or "saved"). */
  done?: string;
}

/** A short id: time in base 36 plus random, ~12 characters. */
export function newOpenId(now: number, rand: () => number = Math.random): string {
  const t = Math.max(0, Math.floor(now)).toString(36);
  const r = Math.floor(rand() * 36 ** 4)
    .toString(36)
    .padStart(4, "0");
  return `o${t}${r}`;
}

export function startOpenContext(input: {
  id: string;
  now: number;
  reason: "motion" | "speed";
  via: OpenVia;
  appState: string | null;
  seedTimestampMs: number | null;
}): OpenContext {
  const age = input.seedTimestampMs != null ? input.now - input.seedTimestampMs : null;
  return {
    id: input.id,
    at: input.now,
    reason: input.reason,
    via: input.via,
    appState: input.appState,
    seedAgeMs: age != null && Number.isFinite(age) ? Math.max(0, Math.round(age)) : null,
    seen: 0,
    buffered: 0,
  };
}

/** Read the stored JSON; anything unreadable is "no open". */
export function parseOpenContext(raw: string | null | undefined): OpenContext | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<OpenContext> | null;
    if (!v || typeof v !== "object") return null;
    if (typeof v.id !== "string" || !v.id) return null;
    if (typeof v.at !== "number" || !Number.isFinite(v.at)) return null;
    return {
      id: v.id,
      at: v.at,
      reason: v.reason === "speed" ? "speed" : "motion",
      via: v.via === "headless" ? "headless" : "live",
      appState: typeof v.appState === "string" ? v.appState : null,
      seedAgeMs: typeof v.seedAgeMs === "number" ? v.seedAgeMs : null,
      seen: typeof v.seen === "number" ? v.seen : 0,
      buffered: typeof v.buffered === "number" ? v.buffered : 0,
      ...(typeof v.firstSeenAt === "number" ? { firstSeenAt: v.firstSeenAt } : {}),
      ...(typeof v.gate === "string" ? { gate: v.gate } : {}),
      ...(v.snap && typeof v.snap === "object" ? { snap: v.snap } : {}),
      ...(typeof v.done === "string" ? { done: v.done } : {}),
    };
  } catch {
    return null;
  }
}

export type OpenFixEvent = { kind: "seen" } | { kind: "buffered" } | { kind: "gate"; gate: string };

/**
 * Apply one fix event. Returns the new context, or null when nothing changed
 * (the cap is reached or the open already has its outcome), so the caller
 * skips the write.
 */
export function applyOpenFix(ctx: OpenContext, ev: OpenFixEvent, now: number): OpenContext | null {
  if (ctx.done) return null;
  if (ev.kind === "seen") {
    if (ctx.seen >= FIX_COUNT_CAP) return null;
    return { ...ctx, seen: ctx.seen + 1, firstSeenAt: ctx.firstSeenAt ?? now };
  }
  if (ev.kind === "buffered") {
    if (ctx.buffered >= FIX_COUNT_CAP) return null;
    return { ...ctx, buffered: ctx.buffered + 1 };
  }
  // A gate only matters while the open is young: it explains a recording that
  // got no fixes, not one that has been going for an hour.
  if (ctx.seen >= FIX_COUNT_CAP || ctx.gate === ev.gate) return null;
  return { ...ctx, gate: ev.gate.slice(0, 30) };
}

/** Drop reasons that are not the end of the recording: the fixes are kept and
 *  tried again, or only part of the route was cut. */
const NOT_FINAL: ReadonlySet<string> = new Set(["flight", "error"]);

/** Does a drop with this reason close the open's accounting? */
export function reasonClosesOpen(reason: string): boolean {
  return !NOT_FINAL.has(reason);
}

/** Should a stored context be quoted on this event? An old context belongs to
 *  an earlier recording (an orphan sweep days later), so the event says how
 *  old it is and the reader can ignore it. We always attach; this only caps
 *  the age we trust for the trip join. */
export function openIdForTrip(ctx: OpenContext | null, tripStartMs: number): string | null {
  if (!ctx || !Number.isFinite(tripStartMs)) return null;
  if (tripStartMs < ctx.at - TRIP_BEFORE_OPEN_SLACK_MS) return null;
  if (tripStartMs > ctx.at + TRIP_AFTER_OPEN_MAX_MS) return null;
  return ctx.id;
}

/**
 * The previous open never reported an outcome, and a new one is opening. The
 * previous recording ended some other way that said nothing (the drive saved
 * by a path that does not mark it, an app reinstall in between, a clear that
 * did not report). Say so, against the OLD id, so the server can count it.
 * Null when it was accounted for or is not a recording the phone armed.
 */
export function unaccountedDrop(
  prev: OpenContext | null,
  now: number
): { reason: "superseded"; detail: string; source: string } | null {
  if (!prev || prev.done) return null;
  // Under a minute old: the same open written twice, not an earlier recording.
  if (now - prev.at < 60 * 1000) return null;
  return {
    reason: "superseded",
    detail: prev.seen === 0 ? "no_fixes_seen" : "no_outcome",
    source: "next_open",
  };
}

// ── The fields a drop event carries ────────────────────────────────────────

export interface OpenFields {
  openId: string;
  openAgeSec: number;
  openReason: "motion" | "speed";
  via: OpenVia;
  appState?: string;
  seedAgeSec?: number;
  fixesSeen: number;
  fixesBuffered: number;
  firstFixSec?: number;
  gate?: string;
  /** Engine state when it opened (Android). */
  engineAtOpen?: EngineSnapshot;
}

/** The part of a drop event that comes from the stored context. */
export function openFields(ctx: OpenContext, now: number): OpenFields {
  const f: OpenFields = {
    openId: ctx.id,
    openAgeSec: Math.max(0, Math.round((now - ctx.at) / 1000)),
    openReason: ctx.reason,
    via: ctx.via,
    fixesSeen: ctx.seen,
    fixesBuffered: ctx.buffered,
  };
  if (ctx.appState) f.appState = ctx.appState.slice(0, 20);
  if (ctx.seedAgeMs != null) f.seedAgeSec = Math.round(ctx.seedAgeMs / 1000);
  if (ctx.firstSeenAt != null) f.firstFixSec = Math.max(0, Math.round((ctx.firstSeenAt - ctx.at) / 1000));
  if (ctx.gate) f.gate = ctx.gate;
  if (ctx.snap && Object.keys(ctx.snap).length > 0) f.engineAtOpen = ctx.snap;
  return f;
}

/** Raw answers from the SDK and OS, any of which may be missing. */
export interface RawEngineReads {
  state?: Record<string, unknown> | null;
  provider?: Record<string, unknown> | null;
  powerSave?: unknown;
  battery?: { level: number | null; charging: boolean | null } | null;
  manufacturer?: string | null;
}

/** Fold the raw reads into the compact snapshot. Unknowns are left out. */
export function buildEngineSnapshot(raw: RawEngineReads): EngineSnapshot {
  const out: EngineSnapshot = {};
  const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
  const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const s = raw.state ?? {};
  const p = raw.provider ?? {};
  const set = <K extends keyof EngineSnapshot>(k: K, v: EngineSnapshot[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  set("en", bool(s.enabled));
  set("mv", bool(s.isMoving));
  set("tm", num(s.trackingMode));
  set("bg", bool(s.didLaunchInBackground));
  set("perm", num(p.status));
  set("prec", num(p.accuracyAuthorization));
  set("gps", bool(p.gps));
  set("net", bool(p.network));
  set("loc", bool(p.enabled));
  set("ps", bool(raw.powerSave));
  if (raw.battery && raw.battery.level != null) set("bat", Math.round(raw.battery.level * 100));
  if (raw.battery && raw.battery.charging != null) set("chg", raw.battery.charging);
  const mfr = (raw.manufacturer ?? "").trim();
  if (mfr) out.mfr = mfr.slice(0, 20);
  return out;
}
