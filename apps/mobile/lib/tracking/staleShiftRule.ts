/**
 * When a shift has been left running with nobody driving, end it.
 *
 * Why this exists (23 Sep 2026): a new Android driver tapped Start Shift two
 * minutes after signing up and the shift was still open 36 hours later. While
 * a shift is active, automatic detection stands aside for it, so their phone
 * logged `detection_skipped {reason:"active_shift"}` 187 times and the shift
 * itself produced no trips. A forgotten shift silently turned tracking off.
 *
 * "Driving" is judged only from what the SHIFT itself recorded, because the
 * question is whether the shift is doing its job:
 *   - a shift breadcrumb (shift_coordinates) reporting at least
 *     DRIVING_SPEED_MS, or two consecutive breadcrumbs whose distance over
 *     time implies that speed (the device speed field is often 0 or missing,
 *     so geometry is the fallback), and
 *   - the end time of a trip the phone already holds for this shift (or any
 *     tracked, non-manual trip) - a trip's end is the last moment of driving.
 * A shift whose recorder is dead therefore looks idle even while the engine
 * sees the driver moving, which is the case we want to end: the drive that
 * wakes the check is then recorded automatically instead of by nothing.
 *
 * Pure: no SQLite, no clock, no React Native. The caller gathers the inputs.
 */

/** A shift must have been open this long before it can end on its own. */
export const STALE_SHIFT_MIN_OPEN_MS = 3 * 60 * 60 * 1000;
/** ...and have recorded no driving for this long. */
export const STALE_SHIFT_NO_DRIVING_MS = 3 * 60 * 60 * 1000;
/** 4.5 m/s is about 10 mph: faster than any walk, slower than any real drive. */
export const DRIVING_SPEED_MS = 4.5;
/** Ignore fixes worse than this; a wandering indoor fix is not a drive. */
export const DRIVING_MAX_ACCURACY_M = 100;
/** Implied speed only counts across a real move, not jitter between two fixes. */
export const DRIVING_MIN_IMPLIED_DISTANCE_M = 100;
/** ...and across a short gap, so two fixes an hour apart can't fake a drive. */
export const DRIVING_MAX_IMPLIED_GAP_MS = 5 * 60 * 1000;

export interface ShiftFix {
  lat: number;
  lng: number;
  /** m/s as the phone reported it; null / negative = unknown */
  speed: number | null;
  /** metres; null = unknown */
  accuracy: number | null;
  recordedAtMs: number;
}

export type StaleShiftDecision =
  | { action: "end"; hoursOpen: number; hoursSinceDriving: number }
  | {
      action: "keep";
      reason: "no_start_time" | "clock_skew" | "too_young" | "recent_driving";
    };

function metresBetween(a: ShiftFix, b: ShiftFix): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function usable(f: ShiftFix): boolean {
  return (
    Number.isFinite(f.recordedAtMs) &&
    Number.isFinite(f.lat) &&
    Number.isFinite(f.lng) &&
    (f.accuracy == null || f.accuracy <= DRIVING_MAX_ACCURACY_M)
  );
}

/**
 * The time of the most recent shift breadcrumb that shows driving, or null.
 * Fixes may arrive in any order; they are sorted here.
 */
export function lastDrivingFixMs(fixes: ShiftFix[]): number | null {
  const sorted = fixes.filter(usable).sort((a, b) => a.recordedAtMs - b.recordedAtMs);
  let last: number | null = null;
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    let driving = f.speed != null && f.speed >= DRIVING_SPEED_MS;
    if (!driving && i > 0) {
      const prev = sorted[i - 1];
      const gap = f.recordedAtMs - prev.recordedAtMs;
      if (gap > 0 && gap <= DRIVING_MAX_IMPLIED_GAP_MS) {
        const d = metresBetween(prev, f);
        driving = d >= DRIVING_MIN_IMPLIED_DISTANCE_M && d / (gap / 1000) >= DRIVING_SPEED_MS;
      }
    }
    if (driving) last = f.recordedAtMs;
  }
  return last;
}

const round1 = (ms: number) => Math.round((ms / 3_600_000) * 10) / 10;

export function staleShiftDecision(input: {
  nowMs: number;
  /** when the shift started; null when the phone has no usable start time */
  shiftStartedMs: number | null;
  /** latest driving moment the shift recorded (fixes or trips); null = none */
  lastDrivingMs: number | null;
}): StaleShiftDecision {
  const { nowMs, shiftStartedMs } = input;
  if (shiftStartedMs == null || !Number.isFinite(shiftStartedMs)) {
    return { action: "keep", reason: "no_start_time" };
  }
  const openMs = nowMs - shiftStartedMs;
  if (openMs < 0) return { action: "keep", reason: "clock_skew" };
  if (openMs < STALE_SHIFT_MIN_OPEN_MS) return { action: "keep", reason: "too_young" };

  // Driving from before the shift started (a stale trip row) says nothing
  // about this shift, and driving "in the future" is a clock problem: in both
  // cases fall back to the shift's own start as the last known activity.
  let lastDriving = input.lastDrivingMs;
  if (lastDriving == null || !Number.isFinite(lastDriving) || lastDriving < shiftStartedMs) {
    lastDriving = shiftStartedMs;
  }
  if (lastDriving > nowMs) return { action: "keep", reason: "recent_driving" };
  const sinceDrivingMs = nowMs - lastDriving;
  if (sinceDrivingMs < STALE_SHIFT_NO_DRIVING_MS) return { action: "keep", reason: "recent_driving" };

  return { action: "end", hoursOpen: round1(openMs), hoursSinceDriving: round1(sinceDrivingMs) };
}
