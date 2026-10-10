// Who is looking at the Tax tab, what leads it, and which rows it carries.
// Pure (type-only imports) so lib/__tests__/taxPersona.test.ts runs without a
// built shared package. Rules: docs/tax-tab-oct2026/SPEC.md sections 2, 3, 4.

import type { TaxOverview } from "@mileclear/shared";

export type Persona = "personal" | "company" | "employee" | "both" | "gig";

/** First match wins: personal mode, company driver, employee, both, gig. */
export function resolvePersona(args: {
  isPersonal: boolean;
  isCompanyDriver: boolean;
  workType: string | null | undefined;
}): Persona {
  if (args.isPersonal) return "personal";
  // A company-car driver is one through a team, or one who said so in Settings
  // ("You drive for: A company car"). The second never unlocks anything paid.
  if (args.isCompanyDriver || args.workType === "company") return "company";
  if (args.workType === "employee") return "employee";
  if (args.workType === "both") return "both";
  return "gig";
}

export const isSelfEmployedPersona = (p: Persona) => p === "gig" || p === "both";

/**
 * Which card leads for gig and both. 6 April to 31 January the return leads;
 * 1 February to 5 April "this tax year so far" leads. The server sends this
 * as `lead`; this mirror is for tests and for a tab painted before any
 * response (month is 1 to 12, UK date).
 */
export function leadForDate(month: number, day: number): "return" | "this_year" {
  if (month === 2 || month === 3) return "this_year";
  if (month === 4 && day < 6) return "this_year";
  return "return";
}

/** "113 days left" / "Due today" / "4 days late". */
export function daysText(days: number): string {
  if (days === 0) return "Due today";
  if (days < 0) {
    const n = Math.abs(days);
    return `${n} ${n === 1 ? "day" : "days"} late`;
  }
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

export type DaysTone = "calm" | "soon" | "urgent";

/** More than 90 days calm; 31 to 90 amber; 30 or fewer, due today or late red. */
export function daysTone(days: number): DaysTone {
  if (days > 90) return "calm";
  if (days > 30) return "soon";
  return "urgent";
}

/** "2027-01-31" -> 2027. */
export function deadlineYear(deadline: string): number {
  return parseInt(deadline.slice(0, 4), 10);
}

export function returnHeadlineTodo(n: number, year: number): string {
  return `${n} ${n === 1 ? "thing" : "things"} to sort before 31 January ${year}`;
}

/** "2026-27" -> 2026. */
export function startYearOf(taxYear: string): number {
  return parseInt(taxYear.slice(0, 4), 10);
}

type ReturnSection = NonNullable<TaxOverview["return"]>;

export type ReturnCardMode =
  | "hidden"
  | "ask" // nothing recorded for the return year and no start year given
  | "todo"
  | "done";

/**
 * What the return card does. In the lead slot (return lead) it always shows
 * when the server sent a return. In the second slot (this_year lead) it shows
 * only while things remain, with the overdue copy.
 */
export function returnCardMode(
  lead: "return" | "this_year",
  ret: ReturnSection | null,
  firstSelfEmployedTaxYear: string | null | undefined,
): ReturnCardMode {
  if (!ret) return "hidden";
  const nothingRecorded = ret.businessMiles === 0 && ret.earningsPence === 0;
  if (lead === "this_year") return ret.attentionCount > 0 ? "todo" : "hidden";
  if (!firstSelfEmployedTaxYear && nothingRecorded) return "ask";
  return ret.attentionCount > 0 ? "todo" : "done";
}

/** The deadline has passed and things are still open. */
export function isOverdue(ret: ReturnSection): boolean {
  return ret.daysToDeadline < 0 && ret.attentionCount > 0;
}

/** Show the "Home shows a X claim" line. */
export function showsDiffersLine(
  claimPence: number | null | undefined,
  returnMileagePence: number | null | undefined,
): boolean {
  if (claimPence == null || returnMileagePence == null) return false;
  return claimPence !== returnMileagePence;
}

/**
 * Whether the differs line may show at all: only for a driver who actually
 * has an employer rate, i.e. employee or both with an employer rate set. Its
 * text explains the gap as the employer's rate, so gig-only drivers (and
 * anyone without a rate) never see it; for them a gap (a stale stored
 * summary) would get the wrong explanation. Approved 10 Oct 2026, replacing
 * SPEC 3.2's "both, or gig with an employer rate".
 */
export function differsLineApplies(persona: Persona, employerRatePence: number | null | undefined): boolean {
  return (persona === "employee" || persona === "both") && employerRatePence != null;
}

/**
 * The overview was built for a different work type or team status than the
 * phone now has (the driver just changed it in Your tax details, and the
 * 30 second caches still hold the old answer). The caller refetches fresh.
 * Unknown on either side counts as matching.
 */
export function overviewOutOfStep(
  overview: Pick<TaxOverview, "workType" | "isCompanyDriver"> | null,
  user: { workType: string | null | undefined; isCompanyDriver: boolean } | null,
): boolean {
  if (!overview || !user) return false;
  // The server files a company car under the employee persona.
  const wt =
    user.workType === "employee" || user.workType === "company"
      ? "employee"
      : user.workType === "both"
        ? "both"
        : "gig";
  return overview.workType !== wt || overview.isCompanyDriver !== user.isCompanyDriver;
}

/** Whether to draw PRO on Downloads. The caller counts team and partner Pro as Pro. */
export function showProBadge(args: { userLoading: boolean; isPremium: boolean }): boolean {
  return !args.userLoading && !args.isPremium;
}

export function certificateHint(isPremium: boolean): string {
  return isPremium
    ? "A summary of your miles you can share"
    : "Free to preview, share with Pro";
}

// ── Rows ────────────────────────────────────────────────────────────

export type TaxRowId =
  | "wizard"
  | "reconciliation"
  | "guide"
  | "downloads"
  | "certificate"
  | "accountant"
  | "relief"
  | "employee_sa"
  | "tax_details"
  | "switch_work";

export interface TaxRowDef {
  id: TaxRowId;
  icon: string;
  label: string;
  hint: string;
  route?: string;
  /** Carries the PRO badge for free drivers. */
  pro?: boolean;
}

export interface TaxRowGroup {
  title?: string;
  rows: TaxRowDef[];
}

const R = {
  wizard: {
    id: "wizard", icon: "calculator-outline", label: "Box by box",
    hint: "Your figures for each box of the return", route: "/self-assessment",
  },
  reconciliation: {
    id: "reconciliation", icon: "git-compare-outline", label: "Check your platform figures",
    hint: "Compare with what gig apps report", route: "/hmrc-reconciliation",
  },
  guide: {
    id: "guide", icon: "book-outline", label: "New to Self Assessment?",
    hint: "A plain guide to your first return", route: "/first-tax-return",
  },
  accountant: {
    id: "accountant", icon: "people-outline", label: "Your accountant",
    hint: "Name, contact and fee", route: "/accountant",
  },
  taxDetails: {
    id: "tax_details", icon: "briefcase-outline", label: "Your tax details",
    hint: "You drive for, rates, other income", route: "/settings/work-tax",
  },
} satisfies Record<string, TaxRowDef>;

function downloads(hint: string): TaxRowDef {
  return { id: "downloads", icon: "download-outline", label: "Downloads", hint, route: "/exports", pro: true };
}

function certificate(isPremium: boolean): TaxRowDef {
  return {
    id: "certificate", icon: "ribbon-outline", label: "Mileage certificate",
    hint: certificateHint(isPremium), route: "/mileage-certificate",
  };
}

function reliefRow(reliefPence: number, formatPence: (pence: number) => string): TaxRowDef {
  return {
    id: "relief", icon: "trending-down-outline", label: "Mileage Allowance Relief",
    hint: reliefPence > 0 ? `${formatPence(reliefPence)} to claim` : "Tax back when your employer pays less",
    route: "/mileage-relief",
  };
}

/** Row groups for each persona (SPEC 3.7). Rows never depend on a card loading. */
export function rowGroups(
  persona: Persona,
  opts: { isPremium: boolean; reliefPence: number; formatPence: (pence: number) => string },
): TaxRowGroup[] {
  const { isPremium, reliefPence, formatPence } = opts;
  switch (persona) {
    case "gig":
    case "both": {
      const groups: TaxRowGroup[] = [
        { title: "YOUR RETURN", rows: [R.wizard, R.reconciliation, R.guide] },
        {
          title: "RECORDS",
          rows: [downloads("Trip log, CSV and Self Assessment PDF"), certificate(isPremium), R.accountant],
        },
      ];
      if (persona === "both") groups.push({ title: "CLAIMS", rows: [reliefRow(reliefPence, formatPence)] });
      groups.push({ title: "SETTINGS", rows: [R.taxDetails] });
      return groups;
    }
    case "employee":
      return [
        {
          title: "RECORDS",
          rows: [downloads("Trip log for your employer"), certificate(isPremium), R.accountant],
        },
        {
          title: "SELF-EMPLOYED TOO?",
          rows: [{
            id: "employee_sa", icon: "calendar-outline", label: "Self Assessment and payment plan",
            hint: "Pick Gig work and an employer under You drive for", route: "/settings/work-tax",
          }],
        },
        { title: "SETTINGS", rows: [R.taxDetails] },
      ];
    case "company": {
      const groups: TaxRowGroup[] = [
        {
          title: "RECORDS",
          // Team drivers have Pro through the team; a driver who only said
          // "A company car" does not, so the hint follows their plan.
          rows: [downloads("Trip log, CSV and PDF"), certificate(isPremium)],
        },
      ];
      if (reliefPence > 0) groups.push({ title: "CLAIMS", rows: [reliefRow(reliefPence, formatPence)] });
      groups.push({ title: "SETTINGS", rows: [R.taxDetails] });
      return groups;
    }
    case "personal":
      return [
        {
          rows: [
            downloads("Your trips as CSV or PDF"),
            {
              id: "switch_work", icon: "briefcase-outline", label: "Drive for work?",
              hint: "Switch to Work mode",
            },
          ],
        },
      ];
  }
}

// ── Home line (SPEC 4) ──────────────────────────────────────────────

/**
 * The one line on Home, or null when nothing should show. `reliefPence` is the
 * shared useMarRelief total (null until known).
 */
export function homeLineText(
  persona: Persona,
  overview: TaxOverview | null,
  reliefPence: number | null,
  formatPence: (pence: number) => string,
): string | null {
  if (!overview || !overview.hasTrips) return null;
  if (persona === "employee") {
    return reliefPence != null && reliefPence > 0
      ? `Mileage Allowance Relief: ${formatPence(reliefPence)} to claim`
      : null;
  }
  if (!isSelfEmployedPersona(persona)) return null;

  if (overview.lead === "return") {
    const ret = overview.return;
    if (!ret) return thisYearLine(overview, formatPence);
    const days = daysText(ret.daysToDeadline);
    // The Tax tab asks first when nothing is recorded for the return year and
    // no start year is saved; Home must not list "things to sort" meanwhile.
    if (returnCardMode("return", ret, overview.plan?.firstSelfEmployedTaxYear) === "ask") {
      return `Do you need a ${ret.taxYear} return? · ${days}`;
    }
    return ret.attentionCount > 0
      ? `${ret.taxYear} return: ${ret.attentionCount} ${ret.attentionCount === 1 ? "thing" : "things"} to sort · ${days}`
      : `${ret.taxYear} return: ready to file · ${days}`;
  }
  return thisYearLine(overview, formatPence);
}

function thisYearLine(overview: TaxOverview, formatPence: (pence: number) => string): string | null {
  const weekly = overview.plan?.weeklySetAsidePence;
  if (weekly != null && weekly > 0) return `Put by ${formatPence(weekly)} a week for your next tax payment`;
  const tax = overview.thisYear?.estimatedTaxPence ?? 0;
  if (tax > 0) return `Tax so far this year: ${formatPence(tax)}`;
  return null;
}
