import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchCalculations, fetchCalculation, type HmrcCalculationSummary } from "../api/hmrc";
import { inYearCalculationsNewestFirst, MAX_CALCULATIONS_TO_TRY } from "./mtdTaxSoFar";
import { readTaxSoFarCache, writeTaxSoFarCache } from "./mtdHubCache";

export interface TaxSoFarResult {
  summary: HmrcCalculationSummary;
  /** When HMRC ran it, from HMRC's list. */
  calculationTimestamp: string;
}

/**
 * HMRC's newest finished in-year calculation for the tax year. Read-only: it
 * never asks HMRC to run a new calculation (the sent screen does that). If the
 * newest one is still running, the one before it is shown and nothing is
 * cached, so the next visit asks again. Any failure hides the section.
 *
 * Cached for 15 minutes per driver and tax year; a send clears it
 * (invalidateHubCache) and the next focus asks again. A change of `refreshKey` (pull to refresh) asks again.
 */
export function useMtdTaxSoFar(
  userId: string | null,
  taxYear: string,
  enabled: boolean,
  refreshKey: number,
): TaxSoFarResult | null {
  const [result, setResult] = useState<TaxSoFarResult | null>(() =>
    enabled ? readTaxSoFarCache<TaxSoFarResult>(userId, taxYear) : null,
  );
  const lastKey = useRef(refreshKey);

  // On focus too, not only on mount: the hub stays mounted under Review, and
  // coming back after a send must not keep showing the old figure.
  const run = useCallback(() => {
    if (!enabled) {
      setResult(null);
      return;
    }
    const forced = lastKey.current !== refreshKey;
    lastKey.current = refreshKey;
    if (!forced) {
      const cached = readTaxSoFarCache<TaxSoFarResult>(userId, taxYear);
      if (cached) {
        setResult(cached);
        return;
      }
    }

    let cancelled = false;
    (async () => {
      try {
        const list = await fetchCalculations(taxYear);
        const candidates = inYearCalculationsNewestFirst(list.data.calculations).slice(0, MAX_CALCULATIONS_TO_TRY);
        for (let i = 0; i < candidates.length; i++) {
          const c = candidates[i];
          const { data } = await fetchCalculation(c.calculationId, taxYear);
          if (cancelled) return;
          if (!data.ready) continue;
          const found: TaxSoFarResult = { summary: data, calculationTimestamp: c.calculationTimestamp };
          if (i === 0) writeTaxSoFarCache(userId, taxYear, found);
          setResult(found);
          return;
        }
        if (!cancelled) setResult(null);
      } catch {
        if (!cancelled) setResult(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, taxYear, enabled, refreshKey]);
  useFocusEffect(run);

  return result;
}
