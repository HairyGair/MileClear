// A small in-memory cache for Home's slow-moving requests (road alerts,
// cheapest fuel). Opening Home many times a day should not fetch them each
// time; pull to refresh passes force to go to the server. Failures are not kept.

export const HOME_CACHE_MS = 10 * 60 * 1000;

export function createTtlCache(ttlMs: number = HOME_CACHE_MS, now: () => number = () => Date.now()) {
  const entries = new Map<string, { at: number; value: unknown }>();
  return {
    async get<T>(key: string, load: () => Promise<T>, force = false): Promise<T> {
      const hit = entries.get(key);
      if (!force && hit && now() - hit.at < ttlMs) return hit.value as T;
      const value = await load();
      entries.set(key, { at: now(), value });
      return value;
    },
    clear() {
      entries.clear();
    },
  };
}
