// Phantom-trip detection. Auto-detected trips with walking-speed
// signature (short distance, long duration, low average speed) are
// almost certainly the mobile detection layer mistaking GPS-drift
// reacquisitions for driving. The real fix is the calc-speed gate in
// apps/mobile/lib/tracking/detection.ts (build 60+); this server-side
// guard is belt-and-braces that protects every user on every build.
//
// The trip is still created on the server with isPhantomTrip=true,
// preserved for diagnostics, but excluded from all user-facing reads
// and analytics aggregates.

const PHANTOM_MIN_DURATION_SEC = 5 * 60;   // 5 min
const PHANTOM_MAX_DISTANCE_MILES = 1.0;    // 1 mile
const PHANTOM_MAX_AVG_MPH = 5;             // 5 mph (walking)

export interface PhantomCheckInput {
  distanceMiles: number;
  startedAt: Date | string;
  endedAt: Date | string | null | undefined;
  isManualEntry: boolean;
}

export function looksLikePhantomTrip(args: PhantomCheckInput): boolean {
  if (args.isManualEntry) return false;
  if (!args.endedAt) return false;

  const startMs = new Date(args.startedAt).getTime();
  const endMs = new Date(args.endedAt).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;

  const durationSec = (endMs - startMs) / 1000;
  if (durationSec < PHANTOM_MIN_DURATION_SEC) return false;
  if (args.distanceMiles >= PHANTOM_MAX_DISTANCE_MILES) return false;

  const hours = durationSec / 3600;
  if (hours <= 0) return false;
  const avgMph = args.distanceMiles / hours;
  return avgMph < PHANTOM_MAX_AVG_MPH;
}
