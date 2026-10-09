// Run work for the same key one at a time, in arrival order.
//
// POST /trips checks for a duplicate and then creates the trip. Two uploads
// of the same drive arriving together both pass the check before either has
// saved: Katy's two copies were created 8 ms apart (6 Oct 2026) and one of
// Shoaib Khan's drives was saved four times in the same second (3 Oct). Taking
// a per-driver lock around the handler makes the second upload see the first.
//
// In-process only. The API runs as a single pm2 fork; if it is ever clustered
// this needs a database lock instead.

const tails = new Map<string, Promise<unknown>>();

export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  // The tail never rejects, so one failure does not poison the queue.
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  tails.set(key, tail);
  tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
