// Date range presets and tax year lists. Pure, so they can be tested without a browser.

export type PeriodPreset = "thisWeek" | "thisMonth" | "lastMonth" | "thisTaxYear" | "lastTaxYear";

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  thisWeek: "This week",
  thisMonth: "This month",
  lastMonth: "Last month",
  thisTaxYear: "This tax year",
  lastTaxYear: "Last tax year",
};

/** Same boundary as getTaxYear in @mileclear/shared (6 April), kept local so this file stays dependency free. */
function getTaxYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const start = month < 3 || (month === 3 && day < 6) ? year - 1 : year;
  return `${start}-${String(start + 1).slice(2)}`;
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start year of a "2026-27" style tax year. */
export function taxYearStartYear(taxYear: string): number {
  return parseInt(taxYear.slice(0, 4), 10);
}

export function taxYearLabel(startYear: number): string {
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

/** Inclusive date range (YYYY-MM-DD) for a tax year: 6 April to 5 April. */
export function taxYearRange(taxYear: string): { from: string; to: string } {
  const y = taxYearStartYear(taxYear);
  return { from: `${y}-04-06`, to: `${y + 1}-04-05` };
}

/** Current tax year and the `previous` before it, newest first. */
export function recentTaxYears(now: Date = new Date(), previous = 3): string[] {
  const start = taxYearStartYear(getTaxYear(now));
  return Array.from({ length: previous + 1 }, (_, i) => taxYearLabel(start - i));
}

/** Range for a preset. The week starts on Monday. */
export function presetRange(preset: PeriodPreset, now: Date = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "thisWeek": {
      const dow = (today.getDay() + 6) % 7;
      const start = new Date(today);
      start.setDate(today.getDate() - dow);
      return { from: iso(start), to: iso(today) };
    }
    case "thisMonth":
      return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
    case "lastMonth":
      return {
        from: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: iso(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case "thisTaxYear": {
      const r = taxYearRange(getTaxYear(now));
      return { from: r.from, to: iso(today) };
    }
    case "lastTaxYear":
      return taxYearRange(taxYearLabel(taxYearStartYear(getTaxYear(now)) - 1));
  }
}
