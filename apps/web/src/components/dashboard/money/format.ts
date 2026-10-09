import { GIG_PLATFORMS } from "@mileclear/shared";
import { formatDay } from "@/lib/dashboard/dates";

export const platformLabel = (v: string): string => GIG_PLATFORMS.find((p) => p.value === v)?.label ?? v;

export const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  csv: "CSV",
  open_banking: "Bank",
  ocr: "Statement",
};

/** YYYY-MM-DD for an ISO timestamp (the API stores dates at midnight UTC). */
export const isoDay = (iso: string): string => iso.slice(0, 10);

export const todayIso = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "Thu 9 Oct" from a stored ISO date, read as a calendar day so no timezone shifts it. */
export function dayLabel(iso: string): string {
  const [y, m, d] = isoDay(iso).split("-").map(Number);
  return formatDay(new Date(y, m - 1, d));
}

export function periodLabel(startIso: string, endIso: string): string {
  return isoDay(startIso) === isoDay(endIso) ? dayLabel(startIso) : `${dayLabel(startIso)} to ${dayLabel(endIso)}`;
}

/** Month heading for grouping, "October 2026". */
export function monthKey(iso: string): string {
  return isoDay(iso).slice(0, 7);
}
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
