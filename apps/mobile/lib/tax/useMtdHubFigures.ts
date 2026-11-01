import { useEffect, useState } from "react";
import { fetchTripSummary } from "../api/trips";
import { previewPeriodSubmission } from "../api/hmrc";
import type { NextUpFigures } from "../../components/mtd/NextUpCard";
import { taxYearOfDate } from "./mtdQuarters";

/**
 * Year-to-date figures for the quarter to send: earnings and business miles
 * from the same preview the Review screen uses (the preview adds up from 6
 * April), and how many trips in that stretch are still unsorted. Each figure
 * fails on its own, so one slow call never blanks the card. Read-only.
 */
export function useMtdHubFigures(
  businessId: string | null | undefined,
  quarter: { start: string; end: string } | null,
  refreshKey: number,
): NextUpFigures | null {
  const [figures, setFigures] = useState<NextUpFigures | null>(null);
  const start = quarter?.start ?? null;
  const end = quarter?.end ?? null;

  useEffect(() => {
    if (!start || !end || !businessId) {
      setFigures(null);
      return;
    }
    let cancelled = false;
    const taxYear = taxYearOfDate(start);
    const yearStart = `${taxYear.slice(0, 4)}-04-06`;

    (async () => {
      const [preview, sort] = await Promise.allSettled([
        previewPeriodSubmission({ businessId, taxYear, from: start, to: end }),
        fetchTripSummary({ classification: "unclassified", from: yearStart, to: `${end}T23:59:59` }),
      ]);
      if (cancelled) return;
      const p = preview.status === "fulfilled" ? preview.value.data : null;
      const s = sort.status === "fulfilled" ? sort.value.data : null;
      setFigures({
        earningsPence: p ? p.breakdown.income.turnoverPence : null,
        businessMiles: p ? p.breakdown.mileage.businessMilesThisPeriod : null,
        tripsToSort: s ? s.totalTrips : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [businessId, start, end, refreshKey]);

  return figures;
}
