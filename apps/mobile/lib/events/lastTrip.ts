// Simple module-level store for passing last-saved trip data from trip-form → dashboard.
// No persistence needed — only lives for the current app session.

export interface LastSavedTrip {
  distanceMiles: number;
  startAddress: string | null;
  endAddress: string | null;
  savedAt: number; // Date.now()
}

let _lastSaved: LastSavedTrip | null = null;

export function setLastSavedTrip(trip: LastSavedTrip): void {
  _lastSaved = trip;
}

/** Returns and clears the last saved trip (consume-once pattern). */
export function consumeLastSavedTrip(): LastSavedTrip | null {
  const trip = _lastSaved;
  _lastSaved = null;
  return trip;
}
