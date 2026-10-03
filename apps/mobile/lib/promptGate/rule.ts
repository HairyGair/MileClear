// One pop-up per app open (3 Oct 2026). A fresh sign-in put three asks on
// screen one after another: record automatically, "Who is Work mode for?" and
// save your places. Each one guarded only against itself, so nothing stopped
// them stacking. Every auto-shown ask now claims the single slot for this app
// open; the ones that lose wait for a later open without being marked as seen.
//
// No React Native imports here, so the rule runs under vitest.

export type PromptId = "location_primer" | "work_explainer" | "saved_places" | "rating";

// Highest first. Why this order:
// 1. location_primer: without Always location (or any location) automatic
//    trips do not record at all. Trip capture is priority 1, and every day
//    it waits is a day of lost mileage.
// 2. work_explainer: tells a new Work-mode driver what the mode is for. Worth
//    seeing early, but nothing is lost while it waits.
// 3. saved_places: names stops the driver already visits. Needs 10+ trips, so
//    it is never the first thing a new driver needs.
// 4. rating: asks for something for us, not the driver. Always last.
export const PROMPT_PRIORITY: readonly PromptId[] = [
  "location_primer",
  "work_explainer",
  "saved_places",
  "rating",
];

// Prompts decide asynchronously (a permission read, a DB read, a timer), so a
// lower one that asks first waits this long for a higher one to turn up.
// The top prompt never waits: nothing can outrank it.
export const PROMPT_SETTLE_MS = 3000;

// Coming back to the app after this long counts as a new app open, so an ask
// that lost is not held back for days on a phone that never cold starts.
export const NEW_SESSION_AFTER_BACKGROUND_MS = 30 * 60_000;

export function promptRank(id: PromptId): number {
  return PROMPT_PRIORITY.indexOf(id);
}

/** The highest-priority prompt among those waiting, or null if none are. */
export function pickWinner(waiting: Iterable<PromptId>): PromptId | null {
  let best: PromptId | null = null;
  for (const id of waiting) {
    if (best === null || promptRank(id) < promptRank(best)) best = id;
  }
  return best;
}

export function isNewSession(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt !== null && now - backgroundedAt >= NEW_SESSION_AFTER_BACKGROUND_MS;
}

type Timers = {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export function createPromptGate(timers: Timers) {
  let shown: PromptId | null = null;
  const waiting = new Map<PromptId, Array<(granted: boolean) => void>>();
  let settleTimer: unknown = null;

  function grant(id: PromptId): void {
    shown = id;
    if (settleTimer !== null) timers.clearTimer(settleTimer);
    settleTimer = null;
    for (const [waiter, resolvers] of waiting) {
      for (const resolve of resolvers) resolve(waiter === id);
    }
    waiting.clear();
  }

  return {
    /**
     * Resolves true if this prompt may show now. False means another prompt
     * has (or is about to have) this app open: show nothing and do not record
     * the prompt as seen. Asking again for the prompt that holds the slot
     * resolves true, so an effect that re-runs cannot lock itself out.
     */
    request(id: PromptId): Promise<boolean> {
      if (shown !== null) return Promise.resolve(shown === id);
      return new Promise<boolean>((resolve) => {
        const list = waiting.get(id) ?? [];
        list.push(resolve);
        waiting.set(id, list);
        if (promptRank(id) === 0) {
          grant(id);
          return;
        }
        if (settleTimer === null) {
          settleTimer = timers.setTimer(() => {
            settleTimer = null;
            const winner = pickWinner(waiting.keys());
            if (winner) grant(winner);
          }, PROMPT_SETTLE_MS);
        }
      });
    },

    /** A new app open: the slot is free again. */
    reset(): void {
      shown = null;
    },

    current(): PromptId | null {
      return shown;
    },
  };
}
