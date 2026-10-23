// New Zealand 90-day logbook, PDF and CSV (23 Oct 2026). IRD's rules and the
// sums are in shared (packages/shared/src/tax/logbook.ts); this loads one
// vehicle's trips for the period and draws them. No HMRC wording anywhere:
// km, NZ dollars, New Zealand dates.
//
// Odometer readings: IRD asks for the reading on the first and last day. The
// app's odometer readings are stored and typed as miles, so a reading a New
// Zealand driver typed may really be km; rather than print a figure that could
// be in the wrong unit, both lines are left for the driver to write in from
// the car.
import PDFDocument from "pdfkit";
import {
  NZ_LOGBOOK_REUSE_CHANGE_PERCENT,
  NZ_LOGBOOK_REUSE_YEARS,
  NZ_LOGBOOK_TIME_ZONE,
  NZ_NO_LOGBOOK_CAP_PERCENT,
  NZ_REGIME,
  addLogbookDays,
  formatMoney,
  logbookRow,
  logbookTotals,
  nzDate,
  zonedMidnight,
  type LogbookRow,
  type LogbookTotals,
  type LogbookTripInput,
  type RegimeVehicleSummary,
} from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";
import { defaultVehicleIdForUser } from "./vehicleDefaults.js";
import { loadRegimeSummary } from "./regimeSummary.js";
import { collectPdfBuffer, escapeCsvField } from "./export.js";

export const LOGBOOK_FOOTER = "Prepared by MileClear from your recorded trips. Check it before you use it.";

export interface LogbookVehicle {
  id: string;
  make: string;
  model: string;
  registrationPlate: string | null;
}

export interface NzLogbook {
  vehicle: LogbookVehicle;
  from: string;
  to: string;
  days: number;
  rows: LogbookRow[];
  totals: LogbookTotals;
  /** This vehicle's claim for the tax year the period ends in, if one can be worked out. */
  taxYear: string;
  claim: RegimeVehicleSummary | null;
}

function startOfNzDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return zonedMidnight(y, m, d, NZ_LOGBOOK_TIME_ZONE);
}

export function vehicleName(v: LogbookVehicle): string {
  const name = `${v.make} ${v.model}`.trim() || "Vehicle";
  return v.registrationPlate ? `${name} (${v.registrationPlate})` : name;
}

/**
 * The logbook for one of the driver's vehicles. null when the vehicle isn't
 * theirs. Trips with no vehicle count when this is the default vehicle, the
 * rule new trips are saved with.
 */
export async function loadNzLogbook(
  userId: string,
  vehicleId: string,
  period: { from: string; to: string; days: number }
): Promise<NzLogbook | null> {
  const vehicle = await prisma.vehicle.findFirst({
    where: { id: vehicleId, userId },
    select: { id: true, make: true, model: true, registrationPlate: true },
  });
  if (!vehicle) return null;

  const defaultId = await defaultVehicleIdForUser(userId);
  const vehicleFilter =
    defaultId === vehicle.id ? [{ vehicleId: vehicle.id }, { vehicleId: null }] : [{ vehicleId: vehicle.id }];
  const start = startOfNzDay(period.from);
  const endExclusive = startOfNzDay(addLogbookDays(period.to, 1));

  const trips: LogbookTripInput[] = await prisma.trip.findMany({
    where: {
      userId,
      isPhantomTrip: false,
      endedAt: { not: null },
      startedAt: { gte: start, lt: endExclusive },
      OR: vehicleFilter,
    },
    orderBy: { startedAt: "asc" },
    select: {
      startedAt: true,
      startAddress: true,
      endAddress: true,
      distanceMiles: true,
      classification: true,
      platformTag: true,
      projectLabel: true,
      notes: true,
    },
  });

  const taxYear = NZ_REGIME.taxYearOf(new Date(endExclusive.getTime() - 1));
  const summary = await loadRegimeSummary(userId, NZ_REGIME, taxYear);
  const claim = summary.vehicles.find((v) => v.vehicleId === vehicle.id) ?? null;

  return {
    vehicle,
    from: period.from,
    to: period.to,
    days: period.days,
    rows: trips.map(logbookRow),
    totals: logbookTotals(trips),
    taxYear,
    claim,
  };
}

// ── CSV ─────────────────────────────────────────────────────────────

export const NZ_LOGBOOK_CSV_HEADERS = ["Date", "Time", "From", "To", "Distance (km)", "Use", "Reason for journey"];

function km(n: number): string {
  return n.toLocaleString("en-NZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** The trips, then a short summary block under them. Formula-safe cells. */
export function nzLogbookCsv(book: NzLogbook): string {
  const lines: string[] = [NZ_LOGBOOK_CSV_HEADERS.join(",")];
  for (const r of book.rows) {
    lines.push([nzDate(r.date), r.time, r.from, r.to, r.km.toFixed(1), r.use, r.reason].map(escapeCsvField).join(","));
  }
  const t = book.totals;
  const summary: Array<[string, string]> = [
    ["Vehicle", vehicleName(book.vehicle)],
    ["Logbook period", `${nzDate(book.from)} to ${nzDate(book.to)} (${book.days} days)`],
    ["Odometer on first day", ""],
    ["Odometer on last day", ""],
    ["Total distance (km)", t.totalKm.toFixed(1)],
    ["Business distance (km)", t.businessKm.toFixed(1)],
    ["Business use", t.businessPercent === null ? "" : `${t.businessPercent.toFixed(1)}%`],
  ];
  if (t.notSortedTrips > 0) summary.push(["Trips not sorted", String(t.notSortedTrips)]);
  lines.push("");
  for (const [k, v] of summary) lines.push([k, v].map(escapeCsvField).join(","));
  lines.push(escapeCsvField(LOGBOOK_FOOTER));
  return lines.join("\r\n") + "\r\n";
}

// ── PDF ─────────────────────────────────────────────────────────────

const NAVY = "#030712";
const AMBER = "#f5a623";
const GREY_200 = "#e5e7eb";
const GREY_600 = "#4b5563";
const TEXT = "#111827";

export async function nzLogbookPdf(book: NzLogbook): Promise<Buffer> {
  const margin = 40;
  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin, bufferPages: true });
  const bufferPromise = collectPdfBuffer(doc);
  const width = doc.page.width - margin * 2;
  const t = book.totals;
  doc.info.Title = `Vehicle logbook: ${vehicleName(book.vehicle)}`;

  // Header
  doc.rect(0, 0, doc.page.width, 64).fill(NAVY);
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#ffffff").text("Vehicle logbook", margin, 18);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(AMBER)
    .text(`${vehicleName(book.vehicle)} · ${nzDate(book.from)} to ${nzDate(book.to)} (${book.days} days)`, margin, 42);
  doc.y = 84;
  doc.x = margin;

  // Summary
  const line = (label: string, value: string) => {
    const y = doc.y;
    doc.font("Helvetica").fontSize(10).fillColor(GREY_600).text(label, margin, y, { width: 220 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(TEXT).text(value, margin + 230, y, { width: width - 230 });
    doc.moveDown(0.35);
  };
  line("Start date", nzDate(book.from));
  line("Odometer on the start date", "____________ km  (write in from the car)");
  line("End date", nzDate(book.to));
  line("Odometer on the end date", "____________ km  (write in from the car)");
  line("Total distance", `${km(t.totalKm)} km over ${t.trips} ${t.trips === 1 ? "trip" : "trips"}`);
  line("Business distance", `${km(t.businessKm)} km`);
  line("Business use", t.businessPercent === null ? "No driving in this period" : `${t.businessPercent.toFixed(1)}%`);

  if (book.claim?.claim) {
    const c = book.claim.claim;
    const tiers = c.tiers.map((tier) => `${tier.label} ${km(tier.distance)} km`).join(", ");
    line(
      `Claim at IRD kilometre rates, ${book.taxYear} tax year so far`,
      `${formatMoney(c.amountMinor, c.currency)} (${tiers})${c.provisional ? `, using ${c.ratesYear} rates` : ""}`
    );
  }

  doc.moveDown(0.4);
  const notes = [
    `IRD asks for a logbook of at least 90 days in a row, with the odometer reading on the first and last day and the date, distance and reason for each business journey.`,
    `Keep this logbook. IRD lets you use this business percentage for up to ${NZ_LOGBOOK_REUSE_YEARS} years if your business use doesn't change by more than ${NZ_LOGBOOK_REUSE_CHANGE_PERCENT}%. Without a logbook, the claim is limited to ${NZ_NO_LOGBOOK_CAP_PERCENT}%.`,
  ];
  if (t.notSortedTrips > 0) {
    notes.push(
      `${t.notSortedTrips} ${t.notSortedTrips === 1 ? "trip isn't" : "trips aren't"} marked Business or Private yet, so the business percentage may be low. Sort them in MileClear and download this again.`
    );
  }
  if (t.businessWithoutReason > 0) {
    notes.push(
      `${t.businessWithoutReason} business ${t.businessWithoutReason === 1 ? "trip has" : "trips have"} no reason recorded. IRD asks for the reason for each business journey: add a note or client to ${t.businessWithoutReason === 1 ? "it" : "them"} in MileClear, or write it in here.`
    );
  }
  doc.font("Helvetica").fontSize(9).fillColor(GREY_600);
  for (const n of notes) {
    doc.text(n, margin, doc.y, { width });
    doc.moveDown(0.3);
  }
  doc.moveDown(0.6);

  // Trip table
  const cols = [
    { title: "Date", w: 62 },
    { title: "Time", w: 36 },
    { title: "From", w: 170 },
    { title: "To", w: 170 },
    { title: "km", w: 46, align: "right" as const },
    { title: "Use", w: 62 },
    { title: "Reason for journey", w: width - (62 + 36 + 170 + 170 + 46 + 62) },
  ];
  const drawHead = () => {
    const y = doc.y;
    doc.rect(margin, y, width, 18).fill(GREY_200);
    let x = margin;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(TEXT);
    for (const c of cols) {
      doc.text(c.title, x + 3, y + 5, { width: c.w - 6, align: c.align ?? "left" });
      x += c.w;
    }
    doc.y = y + 22;
  };
  drawHead();
  const bottom = doc.page.height - margin - 24;
  doc.font("Helvetica").fontSize(8).fillColor(TEXT);
  if (book.rows.length === 0) doc.text("No trips recorded for this vehicle in this period.", margin + 3, doc.y);
  for (const r of book.rows) {
    const cells = [nzDate(r.date), r.time, r.from || "—", r.to || "—", r.km.toFixed(1), r.use, r.reason || (r.use === "Business" ? "________________" : "")];
    doc.font("Helvetica").fontSize(8);
    const h = Math.max(...cells.map((text, i) => doc.heightOfString(text, { width: cols[i].w - 6 }))) + 6;
    if (doc.y + h > bottom) {
      doc.addPage();
      doc.y = margin;
      drawHead();
      doc.font("Helvetica").fontSize(8);
    }
    const y = doc.y;
    let x = margin;
    doc.fillColor(TEXT);
    cells.forEach((text, i) => {
      doc.text(text, x + 3, y + 3, { width: cols[i].w - 6, align: cols[i].align ?? "left" });
      x += cols[i].w;
    });
    doc.moveTo(margin, y + h).lineTo(margin + width, y + h).lineWidth(0.5).strokeColor(GREY_200).stroke();
    doc.y = y + h;
  }

  // Footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Writing below the bottom margin would make PDFKit add a page.
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(GREY_600)
      .text(`${LOGBOOK_FOOTER}   Page ${i - range.start + 1} of ${range.count}`, margin, doc.page.height - margin - 10, {
        width,
        align: "center",
        lineBreak: false,
      });
  }

  doc.end();
  return bufferPromise;
}
