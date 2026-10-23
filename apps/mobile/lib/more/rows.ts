// Which rows the More tab shows, in which groups, for each driver (Oct 2026
// More redesign, direction A). Pure and tested, so every driver type's page is
// proven without a phone. The sentences come from ./sentences.ts.
//
// Order is the same for everyone: car, work, money (or records), progress,
// tools, help and settings. A row only shows when it applies to the driver.

import type { CountryFeatures, DriveFor } from "@mileclear/shared";

export type MoreRowId =
  | "cars"
  | "fuel"
  | "odometer"
  | "places"
  | "road"
  | "chargers"
  | "shifts"
  | "work_hours"
  | "manager"
  | "earnings"
  | "expenses"
  | "invoices"
  | "bank"
  | "records"
  | "downloads"
  | "drive_for_work"
  | "insights"
  | "badges"
  | "ticket"
  | "emsee"
  | "settings"
  | "help"
  | "feedback"
  | "invite"
  | "admin";

export interface MoreGroup {
  title: string;
  rows: MoreRowId[];
}

export interface MoreDriver {
  /** The driver's answer to "You drive for". */
  driveFor: DriveFor;
  /** Company-car driver, in a team or by their own answer (seesCompanyDriverApp). */
  companyApp: boolean;
  isWork: boolean;
  /** The main car is electric. */
  electric: boolean;
  /** Has at least one past shift (keeps Shifts for drivers it isn't usually for). */
  hasShifts: boolean;
  /** Has earnings or invoices or a linked bank (keeps those rows for employees). */
  hasEarnings: boolean;
  hasInvoices: boolean;
  bankLinked: boolean;
  /** The server offers EmSee. */
  assistant: boolean;
  isAdmin: boolean;
  /** What the driver's country gets (featuresFor). Missing is the UK. */
  features?: CountryFeatures;
}

/** "Just me" drivers who are not company drivers. */
function isJustMe(d: MoreDriver): boolean {
  return !d.companyApp && d.driveFor === "personal";
}

export function moreGroups(d: MoreDriver): MoreGroup[] {
  const groups = ukGroups(d);
  const f = d.features;
  if (!f) return groups;
  // Outside the UK (23 Oct 2026): drop the UK-only rows. The Tax tab is
  // hidden there too, so the trip downloads get a row of their own.
  const drop = new Set<MoreRowId>();
  if (!f.roadAlerts) drop.add("road");
  if (!f.openBanking) drop.add("bank");
  if (!f.cleanAirZones) drop.add("ticket");
  if (!f.ukTax) {
    drop.add("manager");
    drop.add("drive_for_work");
    drop.add("records");
    // No Tax tab, so Work mode has Insights in the tab bar.
    drop.add("insights");
  }
  const out = groups
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !drop.has(r)) }))
    .filter((g) => g.rows.length > 0);
  if (!f.ukTax) {
    const money = out.find((g) => g.title === "Your money");
    if (money) money.rows.push("downloads");
    else {
      const at = out.findIndex((g) => g.title === "Your progress");
      out.splice(at < 0 ? out.length : at, 0, { title: "Your records", rows: ["downloads"] });
    }
  }
  return out;
}

function ukGroups(d: MoreDriver): MoreGroup[] {
  const groups: MoreGroup[] = [];
  const company = d.companyApp;
  const justMe = isJustMe(d);
  const gigLike = !company && !justMe && (d.driveFor === "gig" || d.driveFor === "both");
  const employeeLike = !company && !justMe && (d.driveFor === "employee" || d.driveFor === "both");

  const car: MoreRowId[] = ["cars", "fuel", "odometer", "places", "road"];
  if (d.electric) car.push("chargers");
  groups.push({ title: "Your car", rows: car });

  const work: MoreRowId[] = [];
  if (!justMe && (gigLike || d.hasShifts)) work.push("shifts");
  if (!justMe) work.push("work_hours");
  if (employeeLike && d.isWork) work.push("manager");
  // Company drivers have no money group; their one money row sits with work.
  if (company) work.push("expenses");
  if (work.length > 0) groups.push({ title: "Your work", rows: work });

  if (!company && !justMe) {
    const money: MoreRowId[] = [];
    if (gigLike || d.hasEarnings) money.push("earnings");
    money.push("expenses");
    if (gigLike || d.hasInvoices) money.push("invoices");
    if (gigLike || d.bankLinked) money.push("bank");
    groups.push({ title: "Your money", rows: money });
  }

  if (justMe) {
    const records: MoreRowId[] = [];
    // In Work mode the Tax tab is in the tab bar and holds Records.
    if (!d.isWork) records.push("records");
    records.push("drive_for_work");
    groups.push({ title: "Your records", rows: records });
  }

  const progress: MoreRowId[] = [];
  // Personal mode has Insights as a tab.
  if (d.isWork) progress.push("insights");
  progress.push("badges");
  groups.push({ title: "Your progress", rows: progress });

  const tools: MoreRowId[] = ["ticket"];
  if (d.assistant && !company) tools.push("emsee");
  groups.push({ title: "Tools", rows: tools });

  groups.push({ title: "Help and settings", rows: ["settings", "help", "feedback", "invite"] });

  if (d.isAdmin) groups.push({ title: "Admin", rows: ["admin"] });

  return groups;
}

/** Rows that are Pro as a whole: the "Pro" chip shows on these for free drivers. */
export const PRO_ROWS: readonly MoreRowId[] = ["ticket", "emsee"];
