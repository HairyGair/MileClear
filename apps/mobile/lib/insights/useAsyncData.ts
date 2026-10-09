// Tiny fetch hook shared by the Insights work cards. Each card loads on its
// own (a slow card never blocks the others) and swapping a data source later
// is a one-line change in the card's own hook.

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncData<T> {
  data: T | null;
  loading: boolean;
  failed: boolean;
  reload: () => void;
}

/**
 * Runs `load` on mount, whenever `key` or `refreshToken` changes, and on
 * reload(). When `enabled` is false nothing is fetched and loading is false.
 */
export function useAsyncData<T>(
  load: () => Promise<T>,
  key: string,
  refreshToken = 0,
  enabled = true
): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadRef
      .current()
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, refreshToken, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, failed, reload };
}
