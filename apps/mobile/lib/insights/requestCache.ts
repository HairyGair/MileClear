// One shared request cache for the Insights screen. Every card asks for its
// figures through here, so two cards that need the same endpoint (stats, the
// recap, vehicles) share one request, and coming back to the screen inside
// the freshness window sends nothing at all.
//
//  - In flight: a second caller for the same key gets the same promise.
//  - Fresh: a finished answer is reused for `freshMs` (default 60 s).
//  - Pull to refresh: `invalidate()` drops finished answers (requests still in
//    flight are current, so they stay shared).
//  - Failures are never cached.
//
// Pure TypeScript with an injectable clock, so it is tested without a phone.

export const DEFAULT_FRESH_MS = 60_000;

interface Entry {
  promise: Promise<unknown>;
  /** Set once the request has finished successfully. */
  at: number | null;
}

export class RequestCache {
  private entries = new Map<string, Entry>();
  private inflight = 0;
  private listeners = new Set<() => void>();
  private scope: string | null = null;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly freshMs: number = DEFAULT_FRESH_MS
  ) {}

  /** Answers belong to one driver: a different driver starts empty. */
  setScope(scope: string | null): void {
    if (scope === this.scope) return;
    this.scope = scope;
    this.entries.clear();
  }

  get<T>(key: string, load: () => Promise<T>, freshMs: number = this.freshMs): Promise<T> {
    const hit = this.entries.get(key);
    if (hit) {
      if (hit.at === null) return hit.promise as Promise<T>;
      if (this.now() - hit.at < freshMs) return hit.promise as Promise<T>;
    }

    this.inflight++;
    const entry: Entry = { promise: Promise.resolve(null), at: null };
    entry.promise = load().then(
      (value) => {
        // Only mark fresh if this entry is still the live one (not invalidated).
        if (this.entries.get(key) === entry) entry.at = this.now();
        this.done();
        return value;
      },
      (error) => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
        this.done();
        throw error;
      }
    );
    this.entries.set(key, entry);
    return entry.promise as Promise<T>;
  }

  /** Forget finished answers so the next ask goes to the server. */
  invalidate(): void {
    for (const [key, entry] of this.entries) {
      if (entry.at !== null) this.entries.delete(key);
    }
  }

  /** Number of requests currently on the wire. */
  pending(): number {
    return this.inflight;
  }

  /** Calls `cb` once, when nothing is on the wire. Returns a cancel function. */
  whenIdle(cb: () => void): () => void {
    if (this.inflight === 0) {
      cb();
      return () => {};
    }
    const listener = () => {
      if (this.inflight === 0) {
        this.listeners.delete(listener);
        cb();
      }
    };
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private done(): void {
    this.inflight = Math.max(0, this.inflight - 1);
    for (const l of [...this.listeners]) l();
  }
}

/** The screen's own cache. */
export const insightsCache = new RequestCache();
