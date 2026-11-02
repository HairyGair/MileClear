// Data behind the Tax tab's Quarterly updates card.
//
// 1. GET /hmrc/summary (reads what we already hold; no call to HMRC).
// 2. Only when the driver isn't connected: the same "do I need to send
//    quarterly updates?" check the quarterly updates screen uses
//    (checkMtdScope), from the self-employment income MileClear holds.
//
// Both are remembered per account for the life of the app, so coming back to
// the tab paints at once; the summary is fetched again on every focus (cheap)
// and the scope answer at most once an hour (it moves with income, not days).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkMtdScope,
  MTD_SCOPE_TAX_YEARS,
  type MtdScopeAnswer,
} from "@mileclear/shared";
import { fetchHmrcSummary } from "../api/hmrcSummary";
import { fetchSelfAssessmentSummary } from "../api/selfAssessment";
import { scopeForCard, type QuarterlySummary } from "./quarterlyCard";

interface Scope {
  answer: MtdScopeAnswer | null;
  startsLabel: string | null;
  at: number;
}

const SCOPE_TTL_MS = 60 * 60 * 1000;
const MIN_REFETCH_MS = 15_000;

let cache: { userId: string; summary: QuarterlySummary | null; scope: Scope | null; summaryAt: number } | null = null;

/** Tax years that have started (a year still to come has no income to look up). */
function startedTaxYears(today: Date): string[] {
  return MTD_SCOPE_TAX_YEARS.filter(
    (ty) => today.getTime() >= new Date(parseInt(ty.slice(0, 4), 10), 3, 6).getTime(),
  );
}

async function loadScope(): Promise<Scope> {
  const today = new Date();
  const pairs = await Promise.all(
    startedTaxYears(today).map((ty) =>
      fetchSelfAssessmentSummary(ty)
        .then((r) => [ty, r.data.totalEarningsPence] as const)
        .catch(() => [ty, null] as const),
    ),
  );
  const byYear: Record<string, number | null> = {};
  // Nothing logged for a year reads as "not held", not as £0 of income.
  for (const [ty, pence] of pairs) byYear[ty] = pence && pence > 0 ? pence : null;
  const r = checkMtdScope({ selfEmploymentPenceByTaxYear: byYear, today });
  // answer null = MileClear can't tell (no income held for a finished year).
  return { answer: scopeForCard(r), startsLabel: r.phase?.startsLabel ?? null, at: Date.now() };
}

export function useQuarterlyCard(args: { userId: string | undefined; enabled: boolean }) {
  const { userId, enabled } = args;
  const mine = cache && cache.userId === userId ? cache : null;
  const [summary, setSummary] = useState<QuarterlySummary | null>(mine?.summary ?? null);
  const [scope, setScope] = useState<Scope | null>(mine?.scope ?? null);
  const [settled, setSettled] = useState(!!mine?.summary);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return;
    const c = cache && cache.userId === userId ? cache : { userId, summary: null, scope: null, summaryAt: 0 };
    cache = c;
    if (c.summary && Date.now() - c.summaryAt < MIN_REFETCH_MS) return;
    c.summaryAt = Date.now();
    let s: QuarterlySummary | null = c.summary;
    try {
      s = (await fetchHmrcSummary()).data;
      c.summary = s;
    } catch {
      // Keep the last good answer; with none, the card shows its neutral wording.
    }
    if (alive.current) {
      setSummary(s);
      setSettled(true);
    }
    if (s && !s.connected && (!c.scope || Date.now() - c.scope.at > SCOPE_TTL_MS)) {
      try {
        c.scope = await loadScope();
        if (alive.current) setScope(c.scope);
      } catch {
        // Unknown scope reads as the neutral card, never as "not needed".
      }
    } else if (alive.current && c.scope) {
      setScope(c.scope);
    }
  }, [enabled, userId]);

  return { summary, scope, settled, refresh };
}

/** Forget everything (sign out or switch account). */
export function clearQuarterlyCardCache() {
  cache = null;
}
