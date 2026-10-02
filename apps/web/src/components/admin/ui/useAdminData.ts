"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface AdminData<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Fetch again (keeps showing the old data while it loads). */
  reload: () => void;
}

/**
 * Load one admin endpoint. Each panel calls this for its own data, so a slow
 * or failing endpoint only affects the panel that needs it.
 *
 * Most admin endpoints answer `{ data: T }`; pass `unwrap: false` for the few
 * that return the body directly. Pass `path: null` to skip loading.
 */
export function useAdminData<T>(path: string | null, opts: { unwrap?: boolean } = {}): AdminData<T> {
  const unwrap = opts.unwrap ?? true;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<unknown>(path)
      .then((res) => {
        if (cancelled) return;
        const body = unwrap ? (res as { data: T }).data : (res as T);
        setData(body);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, unwrap, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
