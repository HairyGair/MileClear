"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isApiError } from "../api";

export interface DataState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

// In-flight requests are shared by key, so two cards asking for the same
// endpoint on one page make one request.
const inflight = new Map<string, Promise<unknown>>();

/**
 * Load one thing. Each card calls this for its own data, so a slow or failing
 * endpoint only affects that card. Pass `null` as the key to skip loading.
 *
 *   const { data, error, loading, reload } = useData("tax-snapshot", () => api.get(...));
 *
 * Keep showing old data while reloading. `revalidateOnFocus` refetches when the
 * tab regains focus.
 */
export function useData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts: { revalidateOnFocus?: boolean } = {}
): DataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState<boolean>(key !== null);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const lastKey = useRef(key);

  useEffect(() => {
    if (lastKey.current !== key) {
      // A different thing is being loaded: don't show the old one meanwhile.
      lastKey.current = key;
      setData(null);
    }
    if (key === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const flightKey = `${key}#${nonce}`;
    let p = inflight.get(flightKey) as Promise<T> | undefined;
    if (!p) {
      p = fetcherRef.current();
      inflight.set(flightKey, p);
      const clear = () => inflight.delete(flightKey);
      p.then(clear, clear);
    }
    p.then((res) => {
      if (!cancelled) setData(res);
    })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e : new Error("Request failed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  const revalidate = opts.revalidateOnFocus ?? false;
  useEffect(() => {
    if (!revalidate || key === null) return;
    const onFocus = () => setNonce((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [revalidate, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/** True when a failed request means "this needs Pro" (a 403 from a Pro route). */
export function isProRequired(error: Error | null): boolean {
  return !!error && isApiError(error) && error.statusCode === 403;
}
