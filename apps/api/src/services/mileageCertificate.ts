// Mileage record certificates (Pro, 4 Oct 2026).
//
// A driver picks a period (a tax year or their own dates) and optionally one
// vehicle, and gets a PDF summary of the miles recorded in MileClear for it,
// with a code and a link (mileclear.com/verify/<code>) anyone can use to check
// the figures. The figures are frozen into `snapshot` when the certificate is
// made, so later trip edits never change an issued certificate.
//
// Counting matches the community numbers (services/communityMonthly.ts):
// phantom trips and the newer copy of a flagged possible double-count are
// left out. No routes, addresses or coordinates are read or stored.

import crypto from "crypto";
import PDFDocument from "pdfkit";
import {
  CERTIFICATE_CODE_ALPHABET,
  CERTIFICATE_CODE_LENGTH,
  CERTIFICATE_STATEMENT,
  certificatePurposeLine,
  computeCertificateFigures,
  formatCertificateCode,
  formatCertificateDate,
  formatCertificateMonth,
  getTaxYear,
  parseTaxYear,
  toCertificateDate,
  type CertificatePurpose,
  type CertificateVehicle,
  type MileageCertificatePreview,
  type MileageCertificateSnapshot,
} from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";

export const WEB_BASE_URL = process.env.WEB_BASE_URL || "https://mileclear.com";

export function certificateVerifyUrl(code: string): string {
  return `${WEB_BASE_URL}/verify/${code}`;
}

/** 20 characters of RFC 4648 base32 = 100 random bits. 256 is a multiple of
 *  32, so masking each byte to 5 bits keeps every character equally likely. */
export function generateCertificateCode(): string {
  const bytes = crypto.randomBytes(CERTIFICATE_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CERTIFICATE_CODE_LENGTH; i++) out += CERTIFICATE_CODE_ALPHABET[bytes[i] & 31];
  return out;
}

/** Whole tax year, when the period is exactly one ("2025-26"), else null. */
export function taxYearForPeriod(periodStart: string, periodEnd: string): string | null {
  const [y, m, d] = periodStart.split("-").map(Number);
  const startDate = new Date(y, m - 1, d, 12);
  const ty = getTaxYear(startDate);
  const { start, end } = parseTaxYear(ty);
  return toCertificateDate(start) === periodStart && toCertificateDate(end) === periodEnd ? ty : null;
}

export class CertificateInputError extends Error {}

/**
 * The figures for a period, as a certificate made now would carry them.
 * Throws CertificateInputError when the vehicle is not the driver's.
 */
export async function buildCertificateFigures(
  userId: string,
  period: { start: Date; end: Date; periodStart: string; periodEnd: string },
  vehicleId: string | null
): Promise<MileageCertificatePreview> {
  const [user, vehicles] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, displayName: true, createdAt: true },
    }),
    prisma.vehicle.findMany({
      where: { userId },
      select: { id: true, make: true, model: true, year: true, registrationPlate: true },
      take: 100,
    }),
  ]);
  if (!user) throw new CertificateInputError("Account not found.");

  let vehicleWhere: Record<string, unknown> = {};
  if (vehicleId) {
    if (!vehicles.some((v) => v.id === vehicleId)) {
      throw new CertificateInputError("That vehicle isn't on your account.");
    }
    // A driver with one vehicle often has trips with no vehicle set; those
    // can only have been in that vehicle, so they count for it. With two or
    // more vehicles only trips set to the chosen one count.
    vehicleWhere =
      vehicles.length === 1 ? { OR: [{ vehicleId }, { vehicleId: null }] } : { vehicleId };
  }

  const trips = await prisma.trip.findMany({
    where: {
      userId,
      isPhantomTrip: false,
      possibleDuplicateOfId: null,
      startedAt: { gte: period.start, lte: period.end },
      ...vehicleWhere,
    },
    select: {
      startedAt: true,
      distanceMiles: true,
      classification: true,
      isManualEntry: true,
      vehicleId: true,
    },
    take: 50_000,
  });

  const figures = computeCertificateFigures(trips, period.periodStart, period.periodEnd);

  const toCertVehicle = (v: (typeof vehicles)[number]): CertificateVehicle => ({
    make: v.make,
    model: v.model,
    year: v.year ?? null,
    registration: v.registrationPlate ?? null,
  });
  let listed: CertificateVehicle[];
  if (vehicleId) {
    listed = vehicles.filter((v) => v.id === vehicleId).map(toCertVehicle);
  } else {
    // All vehicles: list the ones these trips were in. A single-vehicle
    // account with untagged trips lists that vehicle.
    const used = new Set(trips.map((t) => t.vehicleId).filter((id): id is string => !!id));
    if (used.size === 0 && vehicles.length === 1 && trips.length > 0) used.add(vehicles[0].id);
    listed = vehicles.filter((v) => used.has(v.id)).map(toCertVehicle);
  }

  return {
    ...figures,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    taxYear: taxYearForPeriod(period.periodStart, period.periodEnd),
    driverName: user.fullName?.trim() || user.displayName?.trim() || "MileClear driver",
    vehicles: listed,
    singleVehicle: !!vehicleId,
    accountCreatedAt: user.createdAt.toISOString(),
  };
}

export function snapshotFromPreview(
  preview: MileageCertificatePreview,
  code: string,
  purpose: CertificatePurpose | null,
  issuedAt: Date
): MileageCertificateSnapshot {
  return {
    version: 1,
    code,
    issuedAt: issuedAt.toISOString(),
    driverName: preview.driverName,
    purpose,
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
    taxYear: preview.taxYear,
    singleVehicle: preview.singleVehicle,
    vehicles: preview.vehicles,
    accountCreatedAt: preview.accountCreatedAt,
    totalMiles: preview.totalMiles,
    businessMiles: preview.businessMiles,
    personalMiles: preview.personalMiles,
    unclassifiedMiles: preview.unclassifiedMiles,
    trips: preview.trips,
    gpsTrips: preview.gpsTrips,
    gpsMiles: preview.gpsMiles,
    manualTrips: preview.manualTrips,
    manualMiles: preview.manualMiles,
    gpsMilesPercent: preview.gpsMilesPercent,
    firstTripAt: preview.firstTripAt,
    lastTripAt: preview.lastTripAt,
    months: preview.months,
  };
}

// ── PDF ─────────────────────────────────────────────────────────────────

const NAVY = "#030712";
const AMBER = "#f5a623";
const WHITE = "#ffffff";
const GREY_100 = "#f3f4f6";
const GREY_200 = "#e5e7eb";
const GREY_400 = "#9ca3af";
const GREY_600 = "#4b5563";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
const miles = (n: number) => `${n.toLocaleString("en-GB", { maximumFractionDigits: 1 })} mi`;
const isoDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
const isoMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" });

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function vehicleLines(s: MileageCertificateSnapshot): string[] {
  if (s.vehicles.length === 0) return ["No vehicle set on these trips"];
  return s.vehicles.map((v) => {
    const name = [v.year, v.make, v.model].filter(Boolean).join(" ");
    return v.registration ? `${name}, registration ${v.registration.toUpperCase()}` : name;
  });
}

export async function generateCertificatePdf(s: MileageCertificateSnapshot): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 48,
    info: {
      Title: `MileClear mileage record ${formatCertificateCode(s.code)}`,
      Author: "MileClear",
      Subject: "Mileage record",
    },
  });
  const done = collect(doc);
  const W = doc.page.width;
  const M = 48;
  const CW = W - M * 2;

  // Header bar
  doc.rect(0, 0, W, 70).fill(NAVY);
  doc.font("Helvetica-Bold").fontSize(20);
  doc.fillColor(WHITE).text("Mile", M, 24, { continued: true });
  doc.fillColor(AMBER).text("Clear");
  doc.font("Helvetica-Bold").fontSize(14).fillColor(WHITE).text("Mileage record", M, 22, { width: CW, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(GREY_400).text(`Issued ${isoDay(s.issuedAt)}`, M, 42, { width: CW, align: "right" });

  let y = 92;
  const purpose = certificatePurposeLine(s.purpose);
  if (purpose) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(GREY_600).text(purpose.toUpperCase(), M, y, { characterSpacing: 0.6 });
    y += 18;
  }

  // Who, what, when
  const rows: Array<[string, string]> = [
    ["Driver", s.driverName],
    [s.vehicles.length > 1 ? "Vehicles" : "Vehicle", vehicleLines(s).join("\n")],
    [
      "Period",
      `${formatCertificateDate(s.periodStart)} to ${formatCertificateDate(s.periodEnd)}${s.taxYear ? ` (tax year ${s.taxYear})` : ""}`,
    ],
    ["Covers", s.singleVehicle ? "Trips in this vehicle only" : "All trips on the account"],
    ["MileClear account since", isoMonth(s.accountCreatedAt)],
  ];
  for (const [label, value] of rows) {
    doc.font("Helvetica").fontSize(9).fillColor(GREY_600).text(label, M, y, { width: 150 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text(value, M + 155, y, { width: CW - 155 });
    y = Math.max(doc.y, y + 14) + 6;
  }

  // Stat boxes
  y += 6;
  const boxW = (CW - 20) / 3;
  const boxes: Array<[string, string, boolean]> = [
    ["Total miles recorded", miles(s.totalMiles), true],
    ["Trips", s.trips.toLocaleString("en-GB"), false],
    ["Miles recorded by GPS", `${s.gpsMilesPercent}%`, false],
  ];
  boxes.forEach(([label, value, accent], i) => {
    const x = M + i * (boxW + 10);
    doc.roundedRect(x, y, boxW, 56, 6).fill(accent ? AMBER : GREY_100);
    doc.font("Helvetica").fontSize(8).fillColor(accent ? NAVY : GREY_600).text(label, x + 10, y + 10, { width: boxW - 20 });
    doc.font("Helvetica-Bold").fontSize(17).fillColor(NAVY).text(value, x + 10, y + 27, { width: boxW - 20 });
  });
  y += 72;

  // Breakdown
  const section = (title: string) => {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY).text(title, M, y);
    y = doc.y + 6;
    doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.5).strokeColor(GREY_200).stroke();
    y += 6;
  };
  const line = (label: string, value: string) => {
    doc.font("Helvetica").fontSize(9.5).fillColor(GREY_600).text(label, M, y, { width: CW - 160 });
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY).text(value, M + CW - 160, y, { width: 160, align: "right" });
    y += 16;
  };

  section("How the miles were used");
  line("Business", miles(s.businessMiles));
  line("Personal", miles(s.personalMiles));
  line("Not yet marked business or personal", miles(s.unclassifiedMiles));
  y += 6;

  section("How the trips were recorded");
  line("Recorded automatically by the phone's GPS", `${plural(s.gpsTrips, "trip", "trips")}, ${miles(s.gpsMiles)}`);
  line("Added by hand by the driver", `${plural(s.manualTrips, "trip", "trips")}, ${miles(s.manualMiles)}`);
  line("First trip in the period", s.firstTripAt ? isoDay(s.firstTripAt) : "None");
  line("Last trip in the period", s.lastTripAt ? isoDay(s.lastTripAt) : "None");
  y += 6;

  // Months: two columns, three for long periods, so up to 3 years fits one page.
  section("Miles by month");
  const cols = s.months.length > 18 ? 3 : 2;
  const gap = 20;
  const colW = (CW - gap * (cols - 1)) / cols;
  const valueW = cols === 3 ? 95 : 120;
  const perCol = Math.ceil(s.months.length / cols);
  const rowH = cols === 3 ? 11 : 14;
  const fs = cols === 3 ? 7.5 : 9;
  s.months.forEach((m, i) => {
    const col = Math.floor(i / perCol);
    const ry = y + (i % perCol) * rowH;
    const x = M + col * (colW + gap);
    doc.font("Helvetica").fontSize(fs).fillColor(GREY_600).text(formatCertificateMonth(m.month), x, ry, { width: colW - valueW });
    doc.font("Helvetica-Bold").fontSize(fs).fillColor(NAVY).text(`${miles(m.miles)} (${plural(m.trips, "trip", "trips")})`, x + colW - valueW, ry, { width: valueW, align: "right" });
  });
  y += perCol * rowH + 14;

  // Verification + statement, pinned to the bottom of the page when there is room.
  const boxH = 92;
  const bottom = doc.page.height - M - boxH - 40;
  if (y > bottom + 30) {
    doc.addPage();
    y = M;
  } else {
    y = Math.max(y, bottom);
  }
  const link = `${WEB_BASE_URL.replace(/^https?:\/\//, "")}/verify/${s.code}`;
  doc.roundedRect(M, y, CW, boxH, 6).lineWidth(1).strokeColor(AMBER).stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY).text("Check this record", M + 14, y + 12);
  doc.font("Helvetica").fontSize(9).fillColor(GREY_600)
    .text("Anyone can check these figures, as issued, at:", M + 14, y + 28, { width: CW - 28 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY)
    .text(link, M + 14, y + 42, { width: CW - 28, link: certificateVerifyUrl(s.code), underline: false });
  doc.font("Helvetica").fontSize(9).fillColor(GREY_600)
    .text(`Certificate code ${formatCertificateCode(s.code)}`, M + 14, y + 60, { width: CW - 28 });
  doc.text("If the owner withdraws it, the page says so.", M + 14, y + 73, { width: CW - 28 });
  y += boxH + 10;

  doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(GREY_600).text(CERTIFICATE_STATEMENT, M, y, { width: CW });

  doc.end();
  return done;
}
