// Small pure helpers and words for the end-of-year tax return screens.
// Kept here so they can be tested without React Native.

import { getTaxYear } from "@mileclear/shared";

/** Tax years a driver can pick: the last one that ended, then the current one. */
export function taxReturnYearOptions(now: Date = new Date()): string[] {
  const current = getTaxYear(now);
  const startYear = parseInt(current.slice(0, 4), 10);
  const previous = `${startYear - 1}-${String(startYear % 100).padStart(2, "0")}`;
  return [previous, current];
}

/** "2025-26" -> "6 April 2025 to 5 April 2026". */
export function taxYearRangeLabel(taxYear: string): string {
  const start = parseInt(taxYear.slice(0, 4), 10);
  return `6 April ${start} to 5 April ${start + 1}`;
}

/** "2025-26" -> "5 April 2026". */
export function taxYearEndLabel(taxYear: string): string {
  return `5 April ${parseInt(taxYear.slice(0, 4), 10) + 1}`;
}

/** Pounds (HMRC sends pounds) to "£1,234.56". Undefined shows as a dash. */
export function formatPounds(v: number | undefined | null): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return "-";
  const abs = Math.abs(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < 0 ? `-£${abs}` : `£${abs}`;
}

/** HMRC's total can be negative, which means a refund. */
export function totalDueLine(total: number | undefined | null): { label: string; amount: string } {
  if (total !== undefined && total !== null && total < 0) {
    return { label: "Refund due to you", amount: formatPounds(-total) };
  }
  return { label: "Income Tax and National Insurance due", amount: formatPounds(total ?? undefined) };
}

/** "2025-04-06" -> "6 Apr 2025". */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** A picked date (local time) as YYYY-MM-DD. */
export function toIsoDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Plain words for an accounting period answer. */
export function periodAnswerLabel(
  answer: { choice: "tax_year" | "to_31_march" | "custom" | "none"; startDate?: string; endDate?: string },
  taxYear: string
): string {
  const y = parseInt(taxYear.slice(0, 4), 10);
  switch (answer.choice) {
    case "tax_year":
      return `6 April ${y} to 5 April ${y + 1}, the tax year`;
    case "to_31_march":
      return `1 April ${y} to 31 March ${y + 1}`;
    case "none":
      return "No accounting period ended in this tax year";
    case "custom":
      return answer.startDate && answer.endDate
        ? `${shortDate(answer.startDate)} to ${shortDate(answer.endDate)}`
        : "Your own dates";
  }
}

/** Plain words for HMRC's accounting type. */
export function accountingTypeLabel(t: "CASH" | "ACCRUAL"): string {
  return t === "CASH" ? "Cash basis" : "Traditional accounting";
}

/** "annualInvestmentAllowance" -> "Annual investment allowance". */
export function fieldLabel(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Flatten what HMRC already holds in the annual submission into readable
 * lines, e.g. "Annual investment allowance: £500.00". Arrays (building
 * allowances) are counted rather than expanded.
 */
export function heldAnnualLines(held: Record<string, unknown> | null): string[] {
  if (!held) return [];
  const lines: string[] = [];
  for (const block of Object.values(held)) {
    if (!block || typeof block !== "object" || Array.isArray(block)) continue;
    for (const [k, v] of Object.entries(block as Record<string, unknown>)) {
      if (typeof v === "number") lines.push(`${fieldLabel(k)}: ${formatPounds(v)}`);
      else if (typeof v === "string") lines.push(`${fieldLabel(k)}: ${v}`);
      else if (typeof v === "boolean") lines.push(`${fieldLabel(k)}: ${v ? "Yes" : "No"}`);
      else if (Array.isArray(v) && v.length > 0) lines.push(`${fieldLabel(k)}: ${v.length} item${v.length === 1 ? "" : "s"}`);
    }
  }
  return lines;
}
