// Pure rules for the Miles / Kilometres choice (23 Oct 2026). No React, no
// database, so they test in node.
import { distanceUnitOf, type DistanceUnit } from "@mileclear/shared";

export const DISTANCE_UNIT_KEY = "distance_unit";
/** Set while a choice made on this phone hasn't reached the server yet. */
export const DISTANCE_UNIT_PENDING_KEY = "distance_unit_pending";

export interface CachedDistanceUnit {
  unit: DistanceUnit;
  pending: boolean;
}

/** Stored text to the cached choice. Anything unreadable is miles, not pending. */
export function parseCachedDistanceUnit(unit: string | null | undefined, pending: string | null | undefined): CachedDistanceUnit {
  return { unit: distanceUnitOf(unit), pending: pending === "1" };
}

export type ServerDistanceUnitStep =
  /** Show and cache what the server says. */
  | { kind: "adopt"; unit: DistanceUnit }
  /** The phone's choice hasn't been saved yet: keep it and send it again. */
  | { kind: "resend"; unit: DistanceUnit }
  /** Nothing to do (an old server that doesn't know the setting). */
  | { kind: "keep" };

/**
 * A profile arrived. A choice made on this phone while offline wins until
 * the server has it; otherwise the server's value is the truth (so a choice
 * made on another phone or the website reaches this one).
 */
export function onServerDistanceUnit(serverRaw: unknown, cached: CachedDistanceUnit): ServerDistanceUnitStep {
  if (cached.pending) {
    if (serverRaw === cached.unit) return { kind: "adopt", unit: cached.unit };
    return { kind: "resend", unit: cached.unit };
  }
  // An older server omits the field: leave the phone as it is.
  if (serverRaw === undefined) return { kind: "keep" };
  return { kind: "adopt", unit: distanceUnitOf(serverRaw) };
}
