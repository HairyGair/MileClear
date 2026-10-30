import type { HmrcBalance } from "../api/hmrc";

/** HMRC's page for paying a Self Assessment bill. */
export const GOVUK_PAY_SELF_ASSESSMENT = "https://www.gov.uk/pay-self-assessment-tax-bill";

export interface BalanceRow {
  label: string;
  pence: number;
  /** "since 31 Jul 2026" / "by 31 Jan 2027", or null when HMRC gave no date. */
  when: string | null;
  tone: "overdue" | "due" | "upcoming";
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

/** The lines to show, most urgent first. Empty when nothing is owed. */
export function balanceRows(b: HmrcBalance): BalanceRow[] {
  const rows: BalanceRow[] = [];
  if (b.overduePence > 0) {
    rows.push({ label: "Overdue", pence: b.overduePence, when: b.overdueSince ? `due ${shortDate(b.overdueSince)}` : null, tone: "overdue" });
  }
  if (b.dueNowPence > 0) {
    rows.push({ label: "To pay", pence: b.dueNowPence, when: b.dueNowDate ? `by ${shortDate(b.dueNowDate)}` : null, tone: "due" });
  }
  if (b.comingUpPence > 0) {
    rows.push({ label: "Coming up", pence: b.comingUpPence, when: b.comingUpDate ? `due ${shortDate(b.comingUpDate)}` : null, tone: "upcoming" });
  }
  return rows;
}
