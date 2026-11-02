// Loading "Your tax so far". Kept apart from the hook so it can be tested
// without React: give it the two HMRC reads, get back what to show.

import type { HmrcCalculationListItem, HmrcCalculationSummary } from "../api/hmrc";
import { explainEstimate } from "./mtdEstimate";
import { inYearCalculationsNewestFirst, MAX_CALCULATIONS_TO_TRY } from "./mtdTaxSoFar";
import {
  peekTaxSoFarCache,
  readTaxSoFarCache,
  writeTaxSoFarCache,
  TAX_SO_FAR_SHORT_CACHE_MS,
} from "./mtdHubCache";

export interface TaxSoFarResult {
  summary: HmrcCalculationSummary;
  /** When HMRC ran it, from HMRC's list. */
  calculationTimestamp: string;
  /** True when this is an older calculation because HMRC hasn't finished the newest one. */
  newestPending: boolean;
}

export interface TaxSoFarApi {
  list: (taxYear: string) => Promise<HmrcCalculationListItem[]>;
  get: (calculationId: string, taxYear: string) => Promise<HmrcCalculationSummary>;
}

/** A calculation worth showing: HMRC has finished it and sent a headline figure. */
export function isUsableCalculation(s: HmrcCalculationSummary): boolean {
  return s.ready && explainEstimate(s).total !== undefined;
}

/**
 * HMRC's newest usable in-year calculation for the year, or null for none.
 * Undefined means the load was cancelled and nothing should change.
 *
 * - Newest usable: cached for 15 minutes.
 * - Newest not finished (or finished with no figure): the one before it is
 *   shown with `newestPending`, cached for 2 minutes. After that, if HMRC's
 *   newest is still the same one, only the newest is asked about again; the
 *   older figure is reused rather than fetched a second time.
 * - None: cached for 2 minutes.
 * - A failed read throws and caches nothing.
 * - `forced` (pull to refresh) skips the fresh-cache check.
 */
export async function loadTaxSoFar(args: {
  userId: string | null;
  taxYear: string;
  forced: boolean;
  isCancelled: () => boolean;
  api: TaxSoFarApi;
  now?: () => number;
}): Promise<TaxSoFarResult | null | undefined> {
  const { userId, taxYear, forced, isCancelled, api } = args;
  const now = args.now ?? Date.now;

  if (!forced) {
    const fresh = readTaxSoFarCache<TaxSoFarResult | null>(userId, taxYear, now());
    if (fresh) return fresh.value;
  }
  const previous = peekTaxSoFarCache<TaxSoFarResult | null>(userId, taxYear);

  if (isCancelled()) return undefined;
  const list = await api.list(taxYear);
  const candidates = inYearCalculationsNewestFirst(list).slice(0, MAX_CALCULATIONS_TO_TRY);
  const newestId = candidates[0]?.calculationId ?? null;
  const short = { ttl: TAX_SO_FAR_SHORT_CACHE_MS, newestId };

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    // The newest is still the one that wasn't usable last time: keep the
    // older figure we already have instead of asking for it again.
    if (i > 0 && previous?.value?.newestPending && previous.newestId === newestId
        && previous.value.summary.calculationId === c.calculationId) {
      writeTaxSoFarCache(userId, taxYear, previous.value, short, now());
      return previous.value;
    }
    if (isCancelled()) return undefined;
    const summary = await api.get(c.calculationId, taxYear);
    if (isCancelled()) return undefined;
    if (!isUsableCalculation(summary)) continue;
    const found: TaxSoFarResult = { summary, calculationTimestamp: c.calculationTimestamp, newestPending: i > 0 };
    writeTaxSoFarCache(userId, taxYear, found, i === 0 ? { newestId } : short, now());
    return found;
  }

  writeTaxSoFarCache<TaxSoFarResult | null>(userId, taxYear, null, short, now());
  return null;
}
