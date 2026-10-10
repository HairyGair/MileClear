// One shared copy of GET /tax/overview for the Tax tab and the Home tax line.
//
// - A module-level cache, so both screens read the same response.
// - The last good response is also saved in SQLite (tracking_state key
//   tax_overview_v1) so the tab paints at once and works offline.
// - refresh() is skipped if the last fetch was under 30 seconds ago, unless
//   { fresh: true } (pull to refresh).

import { useCallback, useEffect, useState } from "react";
import type { TaxOverview } from "@mileclear/shared";
import { fetchTaxOverview } from "../api/tax";
import { getDatabase } from "../db";
import { useAuth } from "../auth/context";

const CACHE_KEY = "tax_overview_v1";
const MIN_REFETCH_MS = 30_000;

interface State {
  data: TaxOverview | null;
  /** True while there is no data yet and a request is running. */
  loading: boolean;
  /** The last request failed (data may still hold the previous good response). */
  error: boolean;
  /** Epoch ms of the last good response (from cache or network). */
  updatedAt: number | null;
}

let state: State = { data: null, loading: false, error: false, updatedAt: null };
let lastFetchAt = 0;
let inflight: Promise<void> | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = ?",
      [CACHE_KEY],
    );
    if (!row) return;
    const parsed = JSON.parse(row.value) as { data?: TaxOverview; updatedAt?: number };
    // Do not overwrite a response that arrived while we were reading.
    if (parsed.data && !state.data) set({ data: parsed.data, updatedAt: parsed.updatedAt ?? null });
  } catch {
    // No cache is fine.
  }
}

async function persist(data: TaxOverview, updatedAt: number) {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      CACHE_KEY,
      JSON.stringify({ data, updatedAt }),
    ]);
  } catch {
    // Not fatal.
  }
}

async function load(opts: { fresh?: boolean }) {
  if (inflight) return inflight;
  lastFetchAt = Date.now();
  if (!state.data) set({ loading: true });
  inflight = (async () => {
    try {
      const res = await fetchTaxOverview({ fresh: opts.fresh });
      const updatedAt = Date.now();
      set({ data: res.data, loading: false, error: false, updatedAt });
      void persist(res.data, updatedAt);
    } catch {
      set({ loading: false, error: true });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Forget everything (sign out). */
export function clearTaxOverviewCache() {
  state = { data: null, loading: false, error: false, updatedAt: null };
  lastFetchAt = 0;
  hydrated = false;
  listeners.forEach((l) => l());
  void (async () => {
    try {
      const db = await getDatabase();
      await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [CACHE_KEY]);
    } catch {
      // ignore
    }
  })();
}

export interface UseTaxOverview extends State {
  /** Skipped if the last fetch was under 30 s ago, unless fresh. */
  refresh: (opts?: { fresh?: boolean }) => Promise<void>;
}

export function useTaxOverview(): UseTaxOverview {
  const { isAuthenticated } = useAuth();
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      if (state.data || hydrated) clearTaxOverviewCache();
      return;
    }
    void hydrate();
  }, [isAuthenticated]);

  const refresh = useCallback(async (opts: { fresh?: boolean } = {}) => {
    if (!opts.fresh && Date.now() - lastFetchAt < MIN_REFETCH_MS) return;
    await load(opts);
  }, []);

  return { ...state, refresh };
}
