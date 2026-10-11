// Let late trips land first (add-trip PROPOSALS 0.4, part 1).
//
// A drive that has not finished saving looks exactly like a lost one at the
// moment the driver looks, and the app-open finalize is often what saves it.
// Archie Cooper's trip arrived 17 seconds after he reported it missing;
// Dempsey Chimwara's 4.5 minutes after. So before the "Missing a trip?" sheet
// sends, and quietly while the add-trip form is open, this finishes any drive
// still saving and uploads the queue.
//
// It runs the same finalize the app runs on every return to the foreground,
// so nothing about how trips are recorded changes. Every step is best-effort
// and time-boxed: a failure here must never block the driver.

/** Finish any drive still saving and upload the queue, within `timeoutMs`. */
export async function settleTrips(timeoutMs = 8000): Promise<void> {
  const work = (async () => {
    try {
      const { finalizeStaleAutoRecordings } = await import("../tracking/detection");
      await finalizeStaleAutoRecordings();
    } catch {
      // Nothing recording, or the finalize threw: carry on.
    }
    try {
      const { processSyncQueue } = await import("../sync/index");
      await processSyncQueue();
    } catch {
      // Offline. The queue drains later.
    }
  })();
  await Promise.race([work, new Promise((r) => setTimeout(r, timeoutMs))]);
}
