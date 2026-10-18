import PDFDocument from "pdfkit";
import {
  calculateMileageDeduction,
  resolveMileageRates,
  getTaxYear,
} from "@mileclear/shared";
import type { TeamApprovalStatus, TeamDrivingDay, TeamMonthDriver, TeamMonthSummary } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { claimableWhere } from "../lib/claimableTrips.js";
import { DRIVING_TIMES_LABEL, formatSpan, loadTeamDrivingDays } from "./drivingTimes.js";

// Milesheet Phase 2 (24 Aug 2026).
//
// This file holds two things that both need to agree on the same numbers:
//   1. The LIVE month computation (computeTeamMonthSummary) - what the
//      manager sees in the portal and what an approval snapshots.
//   2. The consolidated export (CSV/PDF) built from APPROVED snapshots -
//      the document that leaves the building and goes to payroll.
// Keeping both in one service means the export can never quietly drift
// from the number a manager actually approved.

// ── UK month boundaries ─────────────────────────────────────────────────
//
// trips.startedAt is a true UTC instant. Bounding a month on UTC midnight
// would drop or duplicate trips at every month edge whenever London is on
// BST (late Mar - late Oct, UTC+1) - e.g. 1 July 00:00 London is 30 June
// 23:00 UTC, so a naive UTC boundary would hand the last hour of June's
// trips to July. The double-conversion trick below asks Intl what wall
// clock a UTC guess displays in London, measures the drift, and corrects
// for it - this is DST-correct without pulling in a timezone library.

export const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function zonedWallTimeToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(guess));
  const p = (t: string) => Number(parts.find((x) => x.type === t)?.value ?? 0);
  const shownAsUtc = Date.UTC(p("year"), p("month") - 1, p("day"), p("hour"), p("minute"), p("second"));
  const driftMs = shownAsUtc - guess;
  return new Date(guess - driftMs);
}

/** Current month in London local terms, as "YYYY-MM". */
export function currentLondonMonth(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

/** The month before `month` ("YYYY-MM"), for "last month just ended" jobs. */
export function previousMonth(month: string): string {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const year = Number(match[1]);
  const mon = Number(match[2]);
  const prevMon = mon === 1 ? 12 : mon - 1;
  const prevYear = mon === 1 ? year - 1 : year;
  return `${prevYear}-${String(prevMon).padStart(2, "0")}`;
}

/** True once `month` has ended in London. A month can only be approved
 *  after it finishes: an approval snapshots the miles, so approving
 *  mid-month leaves the rest of the month's trips out of payroll
 *  (Denton approved October on 4 Oct 2026). "YYYY-MM" compares as text. */
export function isMonthFinished(month: string, current: string = currentLondonMonth()): boolean {
  return month < current;
}

/** "October 2026" -> the first day after it, as "1 November". */
export function monthEndsLabel(month: string): { name: string; reopens: string } {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const year = Number(match[1]);
  const mon = Number(match[2]);
  const fmt = (y: number, m: number) =>
    new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return { name: fmt(year, mon), reopens: `1 ${fmt(mon === 12 ? year + 1 : year, mon === 12 ? 1 : mon + 1)}` };
}

/** [start, end) UTC instants bounding a UK-local month, plus the tax year that month falls in. */
export function londonMonthBounds(month: string): { start: Date; end: Date; taxYear: string } {
  const match = MONTH_RE.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const year = Number(match[1]);
  const mon = Number(match[2]);
  const start = zonedWallTimeToUtc(year, mon, 1, "Europe/London");
  const nextMon = mon === 12 ? 1 : mon + 1;
  const nextYear = mon === 12 ? year + 1 : year;
  const end = zonedWallTimeToUtc(nextYear, nextMon, 1, "Europe/London");
  // getTaxYear reads local calendar fields off the Date - fine here since we
  // only need "which tax year is this month mostly in", and the one month
  // that straddles the 6 April boundary (April itself) is a known, accepted
  // simplification: see the report for this task.
  const taxYear = getTaxYear(start);
  return { start, end, taxYear };
}

// ── Tax-year segments within a month ────────────────────────────────────
//
// The HMRC 10,000-mile threshold resets on 6 April, which falls INSIDE a
// calendar month. Treating April as belonging wholly to one tax year is not
// a rounding nicety: it would charge the whole month against last year's
// running total, so a driver who had already passed 10,000 miles would be
// paid 25p for the whole of April when the allowance had in fact reset and
// most of the month is due 55p. Only April ever splits; every other month
// returns a single segment and the arithmetic below reduces to the simple
// case.
type TaxYearSegment = { segStart: Date; segEnd: Date; taxYear: string; tyStart: Date };

function taxYearStarting(startYear: number): { taxYear: string; tyStart: Date } {
  return {
    taxYear: `${startYear}-${String(startYear + 1).slice(2)}`,
    tyStart: zonedWallTimeToUtc(startYear, 4, 6, "Europe/London"),
  };
}

export function taxYearSegmentsForMonth(month: string): TaxYearSegment[] {
  const { start, end } = londonMonthBounds(month);
  const mon = Number(MONTH_RE.exec(month)![2]);
  const year = Number(MONTH_RE.exec(month)![1]);

  if (mon === 4) {
    const boundary = zonedWallTimeToUtc(year, 4, 6, "Europe/London");
    const before = taxYearStarting(year - 1);
    const after = taxYearStarting(year);
    return [
      { segStart: start, segEnd: boundary, ...before },
      { segStart: boundary, segEnd: end, ...after },
    ];
  }
  // Jan-Mar belong to the tax year that began the PREVIOUS April.
  const { taxYear, tyStart } = taxYearStarting(mon <= 3 ? year - 1 : year);
  return [{ segStart: start, segEnd: end, taxYear, tyStart }];
}

function monthLabel(month: string): string {
  const match = MONTH_RE.exec(month);
  if (!match) return month;
  const year = Number(match[1]);
  const mon = Number(match[2]);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Rate resolution ──────────────────────────────────────────────────────
//
// Precedence: the driver's own employerMileageRatePence (User table) wins,
// then the org's defaultRatePence, then HMRC AMAP for the month's tax
// year. resolveMileageRates() only returns a custom rate when workType is
// "employee"/"both" - that gate is about a driver's PERSONAL export, not
// about Teams reimbursement, so it is forced to "employee" here: an org
// that is paying a driver per mile pays that rate regardless of how the
// driver's own tax situation is configured.
function resolveDriverRate(
  user: { employerMileageRatePence: number | null; employerMileageRatePenceAfter10k: number | null } | undefined,
  org: { defaultRatePence: number | null }
): { rateOptions: ReturnType<typeof resolveMileageRates>; usesOwnRate: boolean } {
  const ownFirst = user?.employerMileageRatePence ?? null;
  const usesOwnRate = ownFirst != null;
  const effectiveFirst = ownFirst ?? org.defaultRatePence ?? null;
  // The org default is a single flat rate (no two-tier concept at org
  // level); a driver's own configured rate keeps its own after-10k tier.
  const effectiveAfter = usesOwnRate ? (user?.employerMileageRatePenceAfter10k ?? null) : (org.defaultRatePence ?? null);

  const rateOptions = resolveMileageRates({
    workType: "employee",
    employerMileageRatePence: effectiveFirst,
    employerMileageRatePenceAfter10k: effectiveAfter,
  });
  return { rateOptions, usesOwnRate };
}

// ── Live month computation ───────────────────────────────────────────────

export async function computeTeamMonthSummary(orgId: string, month: string): Promise<TeamMonthSummary> {
  const { start, end } = londonMonthBounds(month);

  const org = await prisma.organisation.findUniqueOrThrow({
    where: { id: orgId },
    select: { id: true, name: true, defaultRatePence: true },
  });

  const memberships = await prisma.orgMembership.findMany({
    where: { orgId, role: "driver", status: "active", userId: { not: null } },
    select: { id: true, userId: true },
  });
  const driverUserIds = memberships.map((m) => m.userId!).filter(Boolean);

  const empty: TeamMonthSummary = {
    orgId: org.id,
    orgName: org.name,
    month,
    drivers: [],
    totalMiles: 0,
    totalAmountPence: 0,
    approvedCount: 0,
    pendingCount: 0,
    queriedCount: 0,
  };
  if (driverUserIds.length === 0) return empty;

  const [users, tripGroups, approvals] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: driverUserIds } },
      select: {
        id: true,
        displayName: true,
        email: true,
        employerMileageRatePence: true,
        employerMileageRatePenceAfter10k: true,
      },
    }),
    // One groupBy for the whole member set, not one query per driver.
    prisma.trip.groupBy({
      by: ["userId", "classification"],
      where: { userId: { in: driverUserIds }, startedAt: { gte: start, lt: end } },
      _sum: { distanceMiles: true },
      _count: { _all: true },
    }),
    prisma.teamApproval.findMany({ where: { orgId, userId: { in: driverUserIds }, month } }),
  ]);

  // Per tax-year segment: the miles inside it, and the miles already run up
  // earlier in that same tax year (which decide whether the driver is still
  // on the first-10k rate).
  // The amount leaves out vans someone else pays for (no mileage to
  // reimburse); the miles column still shows every business trip.
  const segments = taxYearSegmentsForMonth(month);
  const segmentData = await Promise.all(
    segments.map(async (seg) => {
      const [inSeg, prior] = await Promise.all([
        prisma.trip.groupBy({
          by: ["userId"],
          where: claimableWhere({
            userId: { in: driverUserIds },
            classification: "business",
            startedAt: { gte: seg.segStart, lt: seg.segEnd },
          }),
          _sum: { distanceMiles: true },
        }),
        prisma.trip.groupBy({
          by: ["userId"],
          where: claimableWhere({
            userId: { in: driverUserIds },
            classification: "business",
            startedAt: { gte: seg.tyStart, lt: seg.segStart },
          }),
          _sum: { distanceMiles: true },
        }),
      ]);
      return {
        seg,
        miles: new Map(inSeg.map((g) => [g.userId, g._sum.distanceMiles ?? 0])),
        prior: new Map(prior.map((g) => [g.userId, g._sum.distanceMiles ?? 0])),
      };
    })
  );

  const usersById = new Map(users.map((u) => [u.id, u]));
  const approvalByUser = new Map(approvals.map((a) => [a.userId, a]));

  const businessByUser = new Map<string, { miles: number; count: number }>();
  const unclassifiedByUser = new Map<string, number>();
  for (const g of tripGroups) {
    const uid = g.userId;
    if (g.classification === "business") {
      businessByUser.set(uid, { miles: g._sum.distanceMiles ?? 0, count: g._count._all });
    } else if (g.classification === "unclassified" || !g.classification) {
      unclassifiedByUser.set(uid, (unclassifiedByUser.get(uid) ?? 0) + g._count._all);
    }
  }

  const approverIds = [...new Set(approvals.map((a) => a.approvedByUserId).filter((x): x is string => !!x))];
  const approvers = approverIds.length
    ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, displayName: true } })
    : [];
  const approverNameById = new Map(approvers.map((a) => [a.id, a.displayName]));

  const drivers: TeamMonthDriver[] = memberships.map((m) => {
    const uid = m.userId!;
    const user = usersById.get(uid);
    const biz = businessByUser.get(uid) ?? { miles: 0, count: 0 };
    const businessMiles = Math.round(biz.miles * 10) / 10;

    const { rateOptions, usesOwnRate } = resolveDriverRate(user, org);
    // The HMRC tier is cumulative across the tax year, so this month is worth
    // the DIFFERENCE between the year-to-date total including it and the
    // total without it. A driver already past 10,000 miles is therefore
    // reimbursed at the after-10k rate for the whole of this month, which is
    // what HMRC actually requires. (A flat employer rate has identical tiers,
    // so this reduces to rate x miles and costs nothing.)
    let amountPence = 0;
    let headlineRate = 0;
    for (const sd of segmentData) {
      const segMiles = sd.miles.get(uid) ?? 0;
      const priorMiles = sd.prior.get(uid) ?? 0;
      const opts = { ...rateOptions, taxYear: sd.seg.taxYear };
      const calc = calculateMileageDeduction("car", priorMiles + segMiles, opts);
      const priorCalc = calculateMileageDeduction("car", priorMiles, opts);
      amountPence += Math.max(0, calc.deductionPence - priorCalc.deductionPence);
      headlineRate = calc.rateFirst10kPence;
    }
    // Show the rate this month's miles were actually paid at. It equals the
    // headline rate in the ordinary case, and lands between the two tiers in
    // the single month where a driver crosses 10,000 miles.
    const effectiveRatePence =
      businessMiles > 0 ? Math.round(amountPence / businessMiles) : headlineRate;

    const approval = approvalByUser.get(uid);
    const status = (approval?.status as TeamApprovalStatus) ?? "pending";

    let driftMiles: number | null = null;
    if (status === "approved" && approval?.milesAtApproval != null) {
      const rawDrift = businessMiles - approval.milesAtApproval;
      driftMiles = Math.abs(rawDrift) >= 0.05 ? Math.round(rawDrift * 10) / 10 : null;
    }

    return {
      membershipId: m.id,
      userId: uid,
      displayName: user?.displayName ?? null,
      email: user?.email ?? "",
      businessTrips: biz.count,
      businessMiles,
      amountPence,
      ratePence: effectiveRatePence,
      usesOwnRate,
      status,
      note: approval?.note ?? null,
      approvedAt: approval?.approvedAt?.toISOString() ?? null,
      approvedByName: approval?.approvedByUserId ? (approverNameById.get(approval.approvedByUserId) ?? null) : null,
      driftMiles,
      unclassifiedTrips: unclassifiedByUser.get(uid) ?? 0,
    };
  });

  const totalMiles = Math.round(drivers.reduce((s, d) => s + d.businessMiles, 0) * 10) / 10;
  const totalAmountPence = drivers.reduce((s, d) => s + d.amountPence, 0);
  const approvedCount = drivers.filter((d) => d.status === "approved").length;
  const queriedCount = drivers.filter((d) => d.status === "queried").length;
  const pendingCount = drivers.length - approvedCount - queriedCount;

  return {
    orgId: org.id,
    orgName: org.name,
    month,
    drivers,
    totalMiles,
    totalAmountPence,
    approvedCount,
    pendingCount,
    queriedCount,
  };
}

// ── Consolidated export (approved drivers only) ─────────────────────────

export interface TeamExportRow {
  driverName: string;
  businessMiles: number;
  ratePence: number;
  amountPence: number;
  approvedAt: Date;
  approvedByName: string;
}

/** One approved driver's daily driving times for the export. `told` false
 *  means the driver has not been told yet: no days, and the file says so. */
export interface TeamExportDriverDays {
  driverName: string;
  told: boolean;
  days: TeamDrivingDay[];
}

export interface TeamExportData {
  orgName: string;
  month: string;
  rows: TeamExportRow[];
  totalMiles: number;
  totalAmountPence: number;
  /** Daily driving times per approved driver, in the same order as rows.
   *  Optional so an export without it renders exactly as before. */
  drivingTimes?: TeamExportDriverDays[];
}

/**
 * Loads only APPROVED drivers for the month, from the TeamApproval
 * snapshot (never re-derived from live trips) - once a manager signs a
 * figure off, the export must keep showing exactly that figure even if a
 * trip is edited afterwards (that's what driftMiles is for elsewhere).
 */
export async function loadTeamMonthExportData(orgId: string, month: string): Promise<TeamExportData> {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } });

  const approvals = await prisma.teamApproval.findMany({
    where: { orgId, month, status: "approved" },
    select: {
      milesAtApproval: true,
      amountPenceAtApproval: true,
      approvedAt: true,
      approvedByUserId: true,
      userId: true,
      user: { select: { displayName: true, email: true } },
    },
    orderBy: { approvedAt: "asc" },
  });

  const approverIds = [...new Set(approvals.map((a) => a.approvedByUserId).filter((x): x is string => !!x))];
  const approvers = approverIds.length
    ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, displayName: true } })
    : [];
  const approverNameById = new Map(approvers.map((a) => [a.id, a.displayName ?? "-"]));

  const rows: TeamExportRow[] = approvals.map((a) => {
    const miles = a.milesAtApproval ?? 0;
    const amount = a.amountPenceAtApproval ?? 0;
    return {
      driverName: a.user.displayName ?? a.user.email,
      businessMiles: miles,
      // The schema snapshots miles + amount, not the rate itself, so the
      // rate shown here is derived from those two numbers - it always
      // reconciles exactly with the amount column, including for a driver
      // whose month crossed the 10,000-mile tiered threshold.
      ratePence: miles > 0 ? Math.round(amount / miles) : 0,
      amountPence: amount,
      approvedAt: a.approvedAt ?? new Date(),
      approvedByName: a.approvedByUserId ? (approverNameById.get(a.approvedByUserId) ?? "-") : "-",
    };
  });

  const totalMiles = Math.round(rows.reduce((s, r) => s + r.businessMiles, 0) * 10) / 10;
  const totalAmountPence = rows.reduce((s, r) => s + r.amountPence, 0);

  // Driving times are live (the day's trips as they stand now), not part
  // of the approval snapshot: they are a record of when, not of how much.
  // loadTeamDrivingDays re-checks membership and the notice gate itself.
  const dayData = approvals.length
    ? await loadTeamDrivingDays(orgId, month, approvals.map((a) => a.userId))
    : { month, drivers: [] };
  const daysByUser = new Map(dayData.drivers.map((d) => [d.userId, d]));
  const drivingTimes: TeamExportDriverDays[] = approvals.flatMap((a) => {
    const d = daysByUser.get(a.userId);
    if (!d) return [];
    return [{ driverName: a.user.displayName ?? a.user.email, told: d.told, days: d.days }];
  });

  return { orgName: org.name, month, rows, totalMiles, totalAmountPence, drivingTimes };
}

export function buildTeamExportFilename(orgName: string, month: string): string {
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "team";
  const match = MONTH_RE.exec(month);
  const label = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
        .toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })
        .toLowerCase()
    : month;
  const year = match ? match[1] : "";
  return `${slug}-${label}-${year}-mileage`;
}

function formatPenceGbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDateUk(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── CSV ──────────────────────────────────────────────────────────────────
//
// Mirrors services/export.ts's escapeCsvField (formula-injection guard +
// comma/quote/newline quoting). That file is out of this task's scope, so
// the small helper is duplicated here rather than imported.
function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateTeamMonthCsv(data: TeamExportData): string {
  const headers = ["Driver", "Business Miles", "Rate (p/mi)", "Amount", "Approved On", "Approved By"];
  const rows = data.rows.map((r) =>
    [r.driverName, r.businessMiles, r.ratePence, formatPenceGbp(r.amountPence), formatDateUk(r.approvedAt), r.approvedByName]
      .map(escapeCsvField)
      .join(",")
  );
  const total = ["TOTAL", data.totalMiles, "", formatPenceGbp(data.totalAmountPence), "", ""].map(escapeCsvField).join(",");
  // The first section above is unchanged, so an existing payroll import that
  // reads the header, driver rows and TOTAL keeps working. Driving times
  // follow after one blank line as a second section.
  return [headers.join(","), ...rows, total, ...drivingTimesCsvLines(data.drivingTimes)].join("\r\n") + "\r\n";
}

/** "2026-10-01" -> "01/10/2026" (UK spreadsheets read this as a date). */
function csvDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

function drivingTimesCsvLines(drivers: TeamExportDriverDays[] | undefined): string[] {
  if (!drivers || drivers.length === 0) return [];
  const lines: string[] = ["", escapeCsvField(DRIVING_TIMES_LABEL)];
  lines.push(["Driver", "Date", "First drive", "Last drive", "Span", "Trips", "Times from"].join(","));
  for (const d of drivers) {
    if (!d.told) continue;
    for (const day of d.days) {
      lines.push(
        [
          d.driverName,
          csvDate(day.date),
          day.startLocal,
          day.endsNextDay ? `${day.endLocal} (next day)` : day.endLocal,
          formatSpan(day.spanMinutes),
          day.trips,
          day.source === "shift" ? "Shift" : "Trips",
        ]
          .map(escapeCsvField)
          .join(",")
      );
    }
  }
  for (const d of drivers) {
    if (!d.told) lines.push(escapeCsvField(`Times appear once ${d.driverName} has been told`));
  }
  return lines;
}

// ── PDF (portrait A4 - consolidated monthly summary) ────────────────────

const NAVY = "#030712";
const AMBER = "#f5a623";
const WHITE = "#ffffff";
const GREY_100 = "#f3f4f6";
const GREY_200 = "#e5e7eb";
const GREY_600 = "#4b5563";

/** "2026-10-01" -> "Thu 1 Oct 2026". */
function pdfDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function generateTeamMonthPdf(data: TeamExportData): Promise<Buffer> {
  const pageWidth = 595.28; // A4 portrait
  const pageHeight = 841.89;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const doc = new PDFDocument({ size: "A4", margin, bufferPages: true });
  const bufferPromise = collectPdfBuffer(doc);

  // Header
  doc.rect(0, 0, pageWidth, 90).fill(NAVY);
  doc.font("Helvetica-Bold").fontSize(18).fillColor(WHITE);
  doc.text(data.orgName, margin, 26, { width: contentWidth });
  doc.font("Helvetica").fontSize(11).fillColor(AMBER);
  doc.text(`Mileage report, ${monthLabel(data.month)}`, margin, 50, { width: contentWidth });
  doc.font("Helvetica").fontSize(8).fillColor("#c0c8d4");
  doc.text("Consolidated from approved driver months - Milesheet", margin, 68, { width: contentWidth });

  doc.y = 112;

  // Summary boxes
  const boxY = doc.y;
  const boxGap = 12;
  const boxW = (contentWidth - boxGap) / 2;
  function drawBox(x: number, label: string, value: string) {
    doc.rect(x, boxY, boxW, 46).fill(GREY_100);
    doc.font("Helvetica").fontSize(8).fillColor(GREY_600).text(label, x + 10, boxY + 8);
    doc.font("Helvetica-Bold").fontSize(15).fillColor(NAVY).text(value, x + 10, boxY + 21);
  }
  drawBox(margin, "Total business miles", `${data.totalMiles.toFixed(1)} mi`);
  drawBox(margin + boxW + boxGap, "Total amount", formatPenceGbp(data.totalAmountPence));
  doc.y = boxY + 62;

  // Table
  const cols = [
    { header: "Driver", width: 165 },
    { header: "Business Miles", width: 85 },
    { header: "Rate", width: 55 },
    { header: "Amount", width: 75 },
    { header: "Approved", width: 70 },
    { header: "Approved By", width: 65 },
  ];
  const rowHeight = 18;
  const tableWidth = cols.reduce((s, c) => s + c.width, 0);
  const startX = margin;

  function drawTableHeader(y: number): number {
    doc.rect(startX, y - 2, tableWidth, rowHeight + 2).fill(NAVY);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
    let x = startX;
    for (const col of cols) {
      doc.text(col.header, x + 4, y + 2, { width: col.width - 8, lineBreak: false });
      x += col.width;
    }
    return y + rowHeight + 2;
  }

  let y = drawTableHeader(doc.y);

  for (let i = 0; i < data.rows.length; i++) {
    if (y > pageHeight - 90) {
      doc.addPage();
      doc.y = margin;
      y = drawTableHeader(doc.y);
    }
    const r = data.rows[i];
    if (i % 2 === 0) doc.rect(startX, y - 1, tableWidth, rowHeight).fill(GREY_100);

    doc.font("Helvetica").fontSize(8).fillColor(NAVY);
    const values = [
      r.driverName,
      r.businessMiles.toFixed(1),
      `${r.ratePence}p`,
      formatPenceGbp(r.amountPence),
      formatDateUk(r.approvedAt),
      r.approvedByName,
    ];
    let x = startX;
    for (let j = 0; j < cols.length; j++) {
      doc.text(values[j], x + 4, y + 2, { width: cols[j].width - 8, lineBreak: false });
      x += cols[j].width;
    }
    y += rowHeight;
  }

  // Total row
  doc.rect(startX, y - 1, tableWidth, rowHeight).fill(NAVY);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
  doc.text("TOTAL", startX + 4, y + 2, { width: cols[0].width - 8, lineBreak: false });
  doc.text(data.totalMiles.toFixed(1), startX + cols[0].width + 4, y + 2, { width: cols[1].width - 8, lineBreak: false });
  doc.text(
    formatPenceGbp(data.totalAmountPence),
    startX + cols[0].width + cols[1].width + cols[2].width + 4,
    y + 2,
    { width: cols[3].width - 8, lineBreak: false }
  );
  y += rowHeight;

  doc.moveTo(startX, y).lineTo(startX + tableWidth, y).lineWidth(0.5).strokeColor(GREY_200).stroke();

  // ── Daily driving times, one table per driver ─────────────────────────
  const timed = data.drivingTimes ?? [];
  if (timed.length > 0) {
    const dayCols = [
      { header: "Date", width: 120 },
      { header: "First drive", width: 80 },
      { header: "Last drive", width: 110 },
      { header: "Span", width: 70 },
      { header: "Trips", width: 50 },
      { header: "Times from", width: 85 },
    ];
    const dayTableWidth = dayCols.reduce((s, c) => s + c.width, 0);
    const bottom = pageHeight - 70;

    const drawDayHeader = (atY: number): number => {
      doc.rect(startX, atY - 2, dayTableWidth, rowHeight + 2).fill(NAVY);
      doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
      let x = startX;
      for (const col of dayCols) {
        doc.text(col.header, x + 4, atY + 2, { width: col.width - 8, lineBreak: false });
        x += col.width;
      }
      return atY + rowHeight + 2;
    };

    y += 24;
    if (y > bottom - 60) {
      doc.addPage();
      y = margin;
    }
    doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text("Daily driving times", startX, y, { width: contentWidth });
    y += 16;
    doc.font("Helvetica").fontSize(8).fillColor(GREY_600).text(DRIVING_TIMES_LABEL, startX, y, { width: contentWidth });
    y += 18;

    for (const d of timed) {
      // Keep a driver's heading with at least its table header and one row.
      if (y > bottom - rowHeight * 3) {
        doc.addPage();
        y = margin;
      }
      doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text(d.driverName, startX, y, { width: contentWidth, lineBreak: false });
      y += 14;
      if (!d.told) {
        doc.font("Helvetica").fontSize(8).fillColor(GREY_600)
          .text(`Times appear once ${d.driverName} has been told.`, startX, y, { width: contentWidth });
        y += 20;
        continue;
      }
      if (d.days.length === 0) {
        doc.font("Helvetica").fontSize(8).fillColor(GREY_600)
          .text(`No business drives in ${monthLabel(data.month)}.`, startX, y, { width: contentWidth });
        y += 20;
        continue;
      }
      y = drawDayHeader(y);
      for (let i = 0; i < d.days.length; i++) {
        if (y > bottom) {
          doc.addPage();
          y = drawDayHeader(margin);
        }
        const day = d.days[i];
        if (i % 2 === 0) doc.rect(startX, y - 1, dayTableWidth, rowHeight).fill(GREY_100);
        doc.font("Helvetica").fontSize(8).fillColor(NAVY);
        const values = [
          pdfDayLabel(day.date),
          day.startLocal,
          day.endsNextDay ? `${day.endLocal} (next day)` : day.endLocal,
          formatSpan(day.spanMinutes),
          String(day.trips),
          day.source === "shift" ? "Shift" : "Trips",
        ];
        let x = startX;
        for (let j = 0; j < dayCols.length; j++) {
          doc.text(values[j], x + 4, y + 2, { width: dayCols[j].width - 8, lineBreak: false });
          x += dayCols[j].width;
        }
        y += rowHeight;
      }
      y += 14;
    }
  }

  doc.font("Helvetica").fontSize(7).fillColor(GREY_600);
  // The footer sits inside the bottom margin, where PDFKit would otherwise
  // start a new page just to hold it (a blank last page with one line).
  doc.page.margins.bottom = 0;
  doc.text(`Generated ${formatDateUk(new Date())} by Milesheet`, margin, pageHeight - 40, { width: contentWidth, lineBreak: false });

  doc.end();
  return bufferPromise;
}
