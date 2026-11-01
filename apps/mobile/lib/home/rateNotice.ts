// Autumn Budget 2026 notice on Home: from 6 April 2027 the approved mileage rate
// for business miles over 10,000 in a tax year goes from 25p to 35p (cars and
// vans). It shows to drivers who claim mileage, can be dismissed, comes back on
// the first day of the next calendar month (UK time), and is gone for good from
// 6 April 2027, when the rate is simply in force and the app already applies it.
//
// Pure and unit-tested (lib/home/__tests__/rateNotice.test.ts).

/** First day the new rate applies. The notice never shows on or after it. */
export const RATE_CHANGE_DATE = "2027-04-06";

export const RATE_NOTICE_URL = "https://mileclear.com/updates/autumn-budget-2026-drivers";

export const RATE_NOTICE_TITLE = "Mileage rate change from 6 April 2027";
export const RATE_NOTICE_LINE =
  "Announced in the Autumn Budget: business miles over 10,000 a tax year go from 25p to 35p. The first 10,000 stay 55p.";

/** UK calendar date, "YYYY-MM-DD", for a timestamp. */
export function ukDate(ms: number): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const out = `${get("year")}-${get("month")}-${get("day")}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch {
    // fall through to the phone's own date
  }
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** UK calendar month, "YYYY-MM". This is what a dismissal is stored as. */
export function ukMonth(ms: number): string {
  return ukDate(ms).slice(0, 7);
}

/** Drivers whose mileage is claimed at the approved rates. Not personal or company-car drivers. */
export function claimsMileage(persona: string): boolean {
  return persona === "gig" || persona === "employee" || persona === "both";
}

export function shouldShowRateNotice(args: {
  persona: string;
  /** The month ("YYYY-MM", UK) the driver last dismissed it, or null. */
  dismissedMonth: string | null;
  now: number;
}): boolean {
  if (!claimsMileage(args.persona)) return false;
  if (ukDate(args.now) >= RATE_CHANGE_DATE) return false;
  return args.dismissedMonth !== ukMonth(args.now);
}
