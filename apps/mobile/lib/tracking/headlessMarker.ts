// When the Android headless task last handled an event, in memory. Its own
// file with no imports so the headless entry can load it without pulling in
// the database (recordingOpen.ts reads it to say how a recording was opened).

let lastHeadlessEventAt = 0;

/** Called by the headless task at the top of each event. */
export function noteHeadlessEvent(): void {
  lastHeadlessEventAt = Date.now();
}

export function msSinceHeadlessEvent(now: number): number {
  return lastHeadlessEventAt > 0 ? now - lastHeadlessEventAt : Number.POSITIVE_INFINITY;
}
