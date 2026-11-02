import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchCalculations, fetchCalculation } from "../api/hmrc";
import { readTaxSoFarCache } from "./mtdHubCache";
import { loadTaxSoFar, type TaxSoFarApi, type TaxSoFarResult } from "./mtdTaxSoFarLoad";

export type { TaxSoFarResult } from "./mtdTaxSoFarLoad";

const api: TaxSoFarApi = {
  list: async (taxYear) => (await fetchCalculations(taxYear)).data.calculations,
  get: async (id, taxYear) => (await fetchCalculation(id, taxYear)).data,
};

/**
 * HMRC's newest usable in-year calculation for the tax year (see
 * loadTaxSoFar for the caching rules). Read-only: it never asks HMRC to run a
 * new calculation; the sent screen does that. Runs on every focus, because
 * the hub stays mounted under Review. A change of `refreshKey` (pull to
 * refresh) asks HMRC again. Any failure hides the section.
 */
export function useMtdTaxSoFar(
  userId: string | null,
  taxYear: string | null,
  enabled: boolean,
  refreshKey: number,
): TaxSoFarResult | null {
  const [result, setResult] = useState<TaxSoFarResult | null>(() =>
    enabled && taxYear ? readTaxSoFarCache<TaxSoFarResult | null>(userId, taxYear)?.value ?? null : null,
  );
  const lastKey = useRef(refreshKey);

  const run = useCallback(() => {
    if (!enabled || !taxYear) {
      setResult(null);
      return;
    }
    const forced = lastKey.current !== refreshKey;
    lastKey.current = refreshKey;
    let cancelled = false;
    loadTaxSoFar({ userId, taxYear, forced, isCancelled: () => cancelled, api })
      .then((r) => {
        if (!cancelled && r !== undefined) setResult(r);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, taxYear, enabled, refreshKey]);
  useFocusEffect(run);

  return result;
}
