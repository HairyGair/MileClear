import PDFDocument from "pdfkit";
import crypto from "crypto";
import {
  formatPence,
  formatInvoiceNumber,
  HMRC_RATES,
  HMRC_THRESHOLD_MILES,
  parseTaxYear,
} from "@mileclear/shared";
import type { ExportTripRow } from "@mileclear/shared";
import { fetchExportTrips, fetchExportSummary } from "./export-data.js";
import { prisma } from "../lib/prisma.js";
import { decryptIfEncrypted } from "../lib/encryption.js";
import { ensureInvoiceNumber } from "./invoices.js";

interface ExportOpts {
  taxYear?: string;
  from?: Date;
  to?: Date;
  classification?: "business" | "personal";
}

// ── Brand colours ─────────────────────────────────────────────────
const NAVY = "#030712";
const NAVY_LIGHT = "#0f172a";
const AMBER = "#f5a623";
const AMBER_DARK = "#ca8a04";
const WHITE = "#ffffff";
const GREY_100 = "#f3f4f6";
const GREY_200 = "#e5e7eb";
const GREY_400 = "#9ca3af";
const GREY_600 = "#4b5563";
const GREEN = "#10b981";

// ── Helpers ───────────────────────────────────────────────────────

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function generateReportRef(userId: string, taxYear: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${userId}:${taxYear}:${Date.now()}`)
    .digest("hex")
    .slice(0, 6)
    .toUpperCase();
  return `MC-${taxYear}-${hash}`;
}

function calcDataCompleteness(trips: ExportTripRow[]): number {
  if (trips.length === 0) return 100;
  let complete = 0;
  for (const t of trips) {
    if (t.startAddress && t.endAddress && t.classification !== "unclassified") {
      complete++;
    }
  }
  return Math.round((complete / trips.length) * 100);
}

// ── HMRC attestation cover page (Self Assessment PDF page 1) ───────
//
// Drawn before the analytical content so the user has a single page they
// can sign and present to HMRC if a return is queried. The phrasing borrows
// from how Driversnote frames their export - HMRC inspectors recognise the
// language ("contemporaneous record", "wholly and exclusively"). UTR is
// left blank because we don't store it; user writes it in by hand before
// signing or printing.
function drawAttestationCoverPage(
  doc: PDFKit.PDFDocument,
  userName: string,
  taxYear: string,
  reportRef: string,
  pageWidth: number,
  pageHeight: number,
  margin: number
) {
  const contentWidth = pageWidth - margin * 2;
  const { start, end } = parseTaxYear(taxYear);
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const periodText = `${fmtDate(start)} to ${fmtDate(end)}`;

  drawHeader(
    doc,
    "Mileage Records for Self Assessment",
    `Tax Year ${taxYear}`,
    reportRef,
    pageWidth,
    margin
  );

  // Generous vertical breathing room - this page is supposed to feel formal,
  // not crammed.
  doc.y = 130;

  // ── "Prepared for" block ──
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(GREY_600)
    .text("PREPARED FOR", margin, doc.y, { characterSpacing: 1 });
  doc.moveDown(0.4);

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(NAVY)
    .text(userName, margin, doc.y);
  doc.moveDown(0.3);

  doc.font("Helvetica").fontSize(11).fillColor(GREY_600);

  // UTR line - blank for the user to write in by hand.
  const labelGap = 6;
  const labelW = 180;
  let metaY = doc.y;
  doc.text("Unique Taxpayer Reference (UTR):", margin, metaY, {
    width: labelW,
    lineBreak: false,
  });
  doc
    .moveTo(margin + labelW + labelGap, metaY + 11)
    .lineTo(margin + labelW + labelGap + 200, metaY + 11)
    .strokeColor(GREY_400)
    .lineWidth(0.6)
    .stroke();
  doc.y = metaY + 22;

  metaY = doc.y;
  doc.text("Tax Year Period:", margin, metaY, { width: labelW, lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .fillColor(NAVY)
    .text(periodText, margin + labelW + labelGap, metaY);
  doc.font("Helvetica").fillColor(GREY_600);
  doc.moveDown(0.6);

  metaY = doc.y;
  doc.text("Report Reference:", margin, metaY, { width: labelW, lineBreak: false });
  doc
    .font("Helvetica")
    .fillColor(NAVY)
    .text(reportRef, margin + labelW + labelGap, metaY);
  doc.moveDown(2);

  // ── Attestation paragraph ──
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(GREY_600)
    .text("DECLARATION", margin, doc.y, { characterSpacing: 1 });
  doc.moveDown(0.4);

  // Subtle box around the declaration text to mark it as the formal section.
  const declTop = doc.y;
  const declText =
    "I confirm that the mileage records contained in this report were maintained " +
    "contemporaneously throughout the tax year shown above. The journeys recorded " +
    "as business mileage were undertaken wholly and exclusively for the purposes " +
    "of my self-employed trade. The distances were measured by GPS using the " +
    "MileClear application and have not been adjusted or estimated retrospectively. " +
    "I understand that these records form part of my Self Assessment return and that " +
    "HMRC may request inspection of the underlying journey log on which they are based.";

  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(NAVY)
    .text(declText, margin + 14, declTop + 12, {
      width: contentWidth - 28,
      lineGap: 3,
      align: "left",
    });

  const declBottom = doc.y + 12;
  doc
    .roundedRect(margin, declTop, contentWidth, declBottom - declTop, 4)
    .lineWidth(0.7)
    .strokeColor(GREY_200)
    .stroke();

  doc.y = declBottom + 26;

  // ── Signature + Date lines ──
  const sigY = doc.y;
  const colW = (contentWidth - 30) / 2;
  const sigLineY = sigY + 36;

  // Signed
  doc.font("Helvetica").fontSize(10).fillColor(GREY_600);
  doc.text("Signed", margin, sigY);
  doc
    .moveTo(margin, sigLineY)
    .lineTo(margin + colW, sigLineY)
    .strokeColor(GREY_600)
    .lineWidth(0.8)
    .stroke();
  doc
    .fontSize(8)
    .fillColor(GREY_400)
    .text(userName, margin, sigLineY + 4, { width: colW });

  // Date
  const dateX = margin + colW + 30;
  doc.fontSize(10).fillColor(GREY_600).text("Date", dateX, sigY);
  doc
    .moveTo(dateX, sigLineY)
    .lineTo(dateX + colW, sigLineY)
    .strokeColor(GREY_600)
    .lineWidth(0.8)
    .stroke();
  doc
    .fontSize(8)
    .fillColor(GREY_400)
    .text("DD / MM / YYYY", dateX, sigLineY + 4, { width: colW });

  // ── Footer note at bottom of cover page ──
  const noteY = pageHeight - 90;
  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor(GREY_600)
    .text(
      "MileClear is a digital mileage tracker, not a tax adviser or accountant. " +
        "This declaration accompanies the trip records on the following pages. " +
        "Please verify all figures before submitting your Self Assessment.",
      margin,
      noteY,
      { width: contentWidth, align: "center", lineGap: 2 }
    );
}

// ── Branded header bar (shared between both PDFs) ─────────────────

function drawHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  subtitle: string,
  reportRef: string,
  pageWidth: number,
  margin: number,
  _isLandscape = false
) {
  const headerHeight = 60;
  const contentWidth = pageWidth - margin * 2;

  // Navy header bar
  doc.rect(0, 0, pageWidth, headerHeight).fill(NAVY);

  // "Mile" in white + "Clear" in amber
  doc.font("Helvetica-Bold").fontSize(18);
  doc.fillColor(WHITE).text("Mile", margin, 14, { continued: true });
  doc.fillColor(AMBER).text("Clear", { continued: false });

  // Title — centered
  doc.fillColor(WHITE).fontSize(14).font("Helvetica-Bold");
  doc.text(title, margin, 20, { width: contentWidth, align: "center" });

  // Subtitle — centered below title
  doc.fillColor(GREY_400).fontSize(9).font("Helvetica");
  doc.text(subtitle, margin, 40, { width: contentWidth, align: "center" });

  // HMRC Compliant badge — top right
  const badgeText = "HMRC COMPLIANT";
  doc.font("Helvetica-Bold").fontSize(7);
  const badgeW = doc.widthOfString(badgeText) + 14;
  const badgeH = 18;
  const badgeX = pageWidth - margin - badgeW;
  const badgeY = 12;

  doc
    .roundedRect(badgeX, badgeY, badgeW, badgeH, 3)
    .lineWidth(1)
    .strokeColor(GREEN)
    .fillAndStroke("rgba(16, 185, 129, 0.1)", GREEN);

  doc.fillColor(GREEN).text(badgeText, badgeX + 7, badgeY + 5);

  // Report ref — below badge
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(GREY_400)
    .text(reportRef, badgeX - 20, badgeY + badgeH + 4, {
      width: badgeW + 20,
      align: "right",
    });

  // Reset position
  doc.fillColor(NAVY);
  doc.y = headerHeight + 16;
}

// ── Page footer ───────────────────────────────────────────────────

function drawFooter(
  doc: PDFKit.PDFDocument,
  pageNum: number,
  totalPages: number | null,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  reportRef: string
) {
  const y = pageHeight - 30;

  // Temporarily disable the page's bottom margin so footer text drawn
  // below the margin line does not trigger PDFKit's auto-pagination.
  // Without this, each doc.text() call in the footer adds a new blank
  // page because the text would otherwise exceed the bottom margin.
  const origBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  // Thin line
  doc
    .moveTo(margin, y)
    .lineTo(pageWidth - margin, y)
    .lineWidth(0.5)
    .strokeColor(GREY_200)
    .stroke();

  doc.font("Helvetica").fontSize(7).fillColor(GREY_400);
  doc.text(reportRef, margin, y + 6, { lineBreak: false });

  const genDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(`Generated ${genDate}`, margin, y + 6, {
    width: pageWidth - margin * 2,
    align: "center",
    lineBreak: false,
  });

  const pageText = totalPages
    ? `Page ${pageNum} of ${totalPages}`
    : `Page ${pageNum}`;
  doc.text(pageText, margin, y + 6, {
    width: pageWidth - margin * 2,
    align: "right",
    lineBreak: false,
  });

  doc.page.margins.bottom = origBottom;
}

// ── Summary stat box ──────────────────────────────────────────────

function drawStatBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  accent = false
) {
  const height = 52;
  const bg = accent ? AMBER : GREY_100;
  const textColor = accent ? NAVY : GREY_600;
  const valueColor = accent ? NAVY : NAVY_LIGHT;

  doc.roundedRect(x, y, width, height, 6).fill(bg);

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(textColor)
    .text(label, x + 10, y + 10, { width: width - 20 });

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(valueColor)
    .text(value, x + 10, y + 26, { width: width - 20 });

  return height;
}

// === CSV (unchanged) =============================================

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

function tripsToCsv(trips: ExportTripRow[]): string {
  const headers = [
    "Date",
    "Start Time",
    "End Time",
    "From",
    "To",
    "Distance (miles)",
    "Classification",
    "Platform",
    "Business Purpose",
    "Vehicle Type",
    "Vehicle",
    "HMRC Rate (p/mi)",
    "Deduction",
  ];

  const rows = trips.map((t) =>
    [
      t.date,
      t.startTime,
      t.endTime,
      t.startAddress,
      t.endAddress,
      t.distanceMiles,
      t.classification,
      t.platform,
      t.businessPurpose,
      t.vehicleType,
      t.vehicleName,
      t.hmrcRatePence,
      formatPence(t.deductionPence),
    ]
      .map(escapeCsvField)
      .join(",")
  );

  return [headers.join(","), ...rows].join("\r\n") + "\r\n";
}

export async function generateTripsCsv(
  userId: string,
  opts: ExportOpts
): Promise<string> {
  const trips = await fetchExportTrips({
    userId,
    taxYear: opts.taxYear,
    from: opts.from,
    to: opts.to,
    classification: opts.classification,
  });
  return tripsToCsv(trips);
}

// === PDF Trip Report (Landscape A4 — Professional) ================

export async function generateTripsPdf(
  userId: string,
  opts: ExportOpts
): Promise<Buffer> {
  const trips = await fetchExportTrips({
    userId,
    taxYear: opts.taxYear,
    from: opts.from,
    to: opts.to,
    classification: opts.classification,
  });

  const pageWidth = 841.89; // A4 landscape
  const pageHeight = 595.28;
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const doc = new PDFDocument({
    layout: "landscape",
    size: "A4",
    margin,
    bufferPages: true,
  });
  const bufferPromise = collectPdfBuffer(doc);

  const label = opts.taxYear
    ? `Tax Year ${opts.taxYear}`
    : `${opts.from!.toLocaleDateString("en-GB")} — ${opts.to!.toLocaleDateString("en-GB")}`;

  const reportRef = generateReportRef(userId, opts.taxYear || "custom");

  // ── Header ──
  drawHeader(doc, "Trip Report", label, reportRef, pageWidth, margin, true);

  // ── Summary stat boxes ──
  const totalMiles = trips.reduce((sum, t) => sum + t.distanceMiles, 0);
  const totalDeduction = trips.reduce((sum, t) => sum + t.deductionPence, 0);
  const businessTrips = trips.filter(
    (t) => t.classification === "business"
  ).length;
  const completeness = calcDataCompleteness(trips);

  const boxY = doc.y;
  const boxGap = 12;
  const boxW = (contentWidth - boxGap * 3) / 4;

  drawStatBox(doc, margin, boxY, boxW, "Total Trips", String(trips.length));
  drawStatBox(
    doc,
    margin + boxW + boxGap,
    boxY,
    boxW,
    "Total Miles",
    `${totalMiles.toFixed(1)} mi`
  );
  drawStatBox(
    doc,
    margin + (boxW + boxGap) * 2,
    boxY,
    boxW,
    "Business Trips",
    String(businessTrips)
  );
  drawStatBox(
    doc,
    margin + (boxW + boxGap) * 3,
    boxY,
    boxW,
    "HMRC Deduction",
    formatPence(totalDeduction),
    true
  );

  // Data completeness line
  doc.y = boxY + 62;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(completeness >= 90 ? GREEN : GREY_400)
    .text(
      `Data completeness: ${completeness}% of trips have full address and classification records`,
      margin,
      doc.y,
      { align: "right", width: contentWidth }
    );

  doc.y += 14;

  // ── Trip Table ──
  const cols = [
    { header: "Date", width: 65 },
    { header: "Time", width: 62 },
    { header: "From", width: 105 },
    { header: "To", width: 105 },
    { header: "Miles", width: 45 },
    { header: "Type", width: 55 },
    { header: "Platform", width: 62 },
    { header: "Purpose", width: 62 },
    { header: "Vehicle", width: 85 },
    { header: "Rate", width: 38 },
    { header: "Deduction", width: 62 },
  ];

  const rowHeight = 16;
  const tableWidth = cols.reduce((s, c) => s + c.width, 0);
  const startX = margin;
  let pageNum = 1;

  function drawTableHeader(y: number) {
    // Header row background
    doc.rect(startX, y - 2, tableWidth, rowHeight + 2).fill(NAVY);

    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(WHITE);
    let x = startX;
    for (const col of cols) {
      doc.text(col.header, x + 3, y + 1, {
        width: col.width - 6,
        lineBreak: false,
      });
      x += col.width;
    }
    return y + rowHeight + 2;
  }

  let y = drawTableHeader(doc.y);

  for (let i = 0; i < trips.length; i++) {
    if (y > pageHeight - 50) {
      drawFooter(doc, pageNum, null, pageWidth, pageHeight, margin, reportRef);
      pageNum++;
      doc.addPage();
      drawHeader(doc, "Trip Report", label, reportRef, pageWidth, margin, true);
      y = drawTableHeader(doc.y);
    }

    const trip = trips[i];

    // Alternate row shading
    if (i % 2 === 0) {
      doc.rect(startX, y - 1, tableWidth, rowHeight).fill(GREY_100);
    }

    // Business trips get subtle amber left border
    if (trip.classification === "business") {
      doc.rect(startX, y - 1, 2, rowHeight).fill(AMBER);
    }

    doc.font("Helvetica").fontSize(7).fillColor(NAVY);

    const values = [
      trip.date,
      `${trip.startTime}${trip.endTime ? "–" + trip.endTime : ""}`,
      trip.startAddress || "—",
      trip.endAddress || "—",
      trip.distanceMiles.toFixed(1),
      trip.classification === "business"
        ? "Business"
        : trip.classification === "personal"
          ? "Personal"
          : "Unclass.",
      trip.platform || "—",
      trip.businessPurpose || "—",
      trip.vehicleName || "—",
      trip.hmrcRatePence ? `${trip.hmrcRatePence}p` : "—",
      trip.deductionPence ? formatPence(trip.deductionPence) : "—",
    ];

    let x = startX;
    for (let j = 0; j < cols.length; j++) {
      doc.text(values[j], x + 3, y + 1, {
        width: cols[j].width - 6,
        lineBreak: false,
      });
      x += cols[j].width;
    }
    y += rowHeight;
  }

  // Bottom border of table
  doc
    .moveTo(startX, y)
    .lineTo(startX + tableWidth, y)
    .lineWidth(0.5)
    .strokeColor(GREY_200)
    .stroke();

  drawFooter(doc, pageNum, null, pageWidth, pageHeight, margin, reportRef);

  doc.end();
  return bufferPromise;
}

// === Self-Assessment PDF (Portrait A4 — Professional) =============

export async function generateSelfAssessmentPdf(
  userId: string,
  taxYear: string
): Promise<Buffer> {
  const summary = await fetchExportSummary(userId, taxYear);

  const pageWidth = 595.28; // A4 portrait
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  const doc = new PDFDocument({
    size: "A4",
    margin,
    bufferPages: true,
  });
  const bufferPromise = collectPdfBuffer(doc);

  const reportRef = generateReportRef(userId, taxYear);

  // ── Page 1: HMRC attestation cover sheet ──
  // A signed declaration page makes the export look like a formal HMRC
  // submission rather than a generic data export. Accountants notice.

  drawAttestationCoverPage(
    doc,
    summary.userName,
    taxYear,
    reportRef,
    pageWidth,
    pageHeight,
    margin
  );

  // ── Page 2: Mileage overview (was page 1) ──
  doc.addPage();

  drawHeader(
    doc,
    "HMRC Mileage Expense Report",
    `Tax Year ${taxYear}`,
    reportRef,
    pageWidth,
    margin
  );

  // Prepared for
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(GREY_600)
    .text(`Prepared for: `, margin, doc.y, { continued: true })
    .font("Helvetica-Bold")
    .fillColor(NAVY)
    .text(summary.userName);

  doc.moveDown(1.2);

  // ── Mileage Overview boxes ──
  const boxY = doc.y;
  const boxGap = 10;
  const boxW = (contentWidth - boxGap * 2) / 3;

  drawStatBox(doc, margin, boxY, boxW, "Total Trips", String(summary.totalTrips));
  drawStatBox(
    doc,
    margin + boxW + boxGap,
    boxY,
    boxW,
    "Business Miles",
    `${summary.businessMiles.toFixed(1)} mi`
  );
  // Only highlight the HMRC Deduction box in amber when there is a
  // deduction to celebrate - a £0.00 figure in a bright amber block
  // looks odd and implies a positive result where there is none.
  drawStatBox(
    doc,
    margin + (boxW + boxGap) * 2,
    boxY,
    boxW,
    "HMRC Deduction",
    formatPence(summary.totalDeductionPence),
    summary.totalDeductionPence > 0
  );

  doc.y = boxY + 64;

  // Second row of stat boxes
  const box2Y = doc.y;
  drawStatBox(
    doc,
    margin,
    box2Y,
    boxW,
    "Total Miles",
    `${summary.totalMiles.toFixed(1)} mi`
  );
  drawStatBox(
    doc,
    margin + boxW + boxGap,
    box2Y,
    boxW,
    "Personal Miles",
    `${summary.personalMiles.toFixed(1)} mi`
  );
  if (summary.totalEarningsPence > 0) {
    drawStatBox(
      doc,
      margin + (boxW + boxGap) * 2,
      box2Y,
      boxW,
      "Total Earnings",
      formatPence(summary.totalEarningsPence)
    );
  }

  doc.y = box2Y + 68;

  // ── Vehicle Breakdown ──
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(NAVY)
    .text("Vehicle Breakdown", margin, doc.y);
  doc.moveDown(0.5);

  if (summary.vehicleBreakdown.length > 0) {
    // Table header
    const vCols = [
      { header: "Vehicle", width: 140 },
      { header: "Type", width: 70 },
      { header: "Total Miles", width: 80 },
      { header: "Business Miles", width: 85 },
      { header: "Deduction", width: contentWidth - 375 },
    ];
    const vTableW = vCols.reduce((s, c) => s + c.width, 0);
    let vy = doc.y;

    doc.rect(margin, vy, vTableW, 18).fill(NAVY);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
    let vx = margin;
    for (const col of vCols) {
      doc.text(col.header, vx + 4, vy + 5, {
        width: col.width - 8,
        lineBreak: false,
      });
      vx += col.width;
    }
    vy += 20;

    for (let i = 0; i < summary.vehicleBreakdown.length; i++) {
      const v = summary.vehicleBreakdown[i];
      if (i % 2 === 0) {
        doc.rect(margin, vy - 1, vTableW, 18).fill(GREY_100);
      }

      doc.font("Helvetica").fontSize(8).fillColor(NAVY);
      vx = margin;
      const vals = [
        v.vehicleName,
        v.vehicleType.charAt(0).toUpperCase() + v.vehicleType.slice(1),
        `${v.totalMiles.toFixed(1)} mi`,
        `${v.businessMiles.toFixed(1)} mi`,
        formatPence(v.deductionPence),
      ];
      for (let j = 0; j < vCols.length; j++) {
        doc.text(vals[j], vx + 4, vy + 4, {
          width: vCols[j].width - 8,
          lineBreak: false,
        });
        vx += vCols[j].width;
      }
      vy += 18;
    }
    doc.y = vy + 8;
  }

  // ── Monthly Breakdown ──
  if (summary.monthlyBreakdown.length > 0) {
    doc.moveDown(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(NAVY)
      .text("Monthly Breakdown", margin, doc.y);
    doc.moveDown(0.5);

    const mCols = [
      { header: "Month", width: 120 },
      { header: "Trips", width: 60 },
      { header: "Total Miles", width: 90 },
      { header: "Business Miles", width: 90 },
      { header: "Deduction", width: contentWidth - 360 },
    ];
    const mTableW = mCols.reduce((s, c) => s + c.width, 0);

    // Check if we need a new page
    const estimatedHeight = (summary.monthlyBreakdown.length + 1) * 18 + 20;
    if (doc.y + estimatedHeight > pageHeight - 60) {
      drawFooter(doc, 1, null, pageWidth, pageHeight, margin, reportRef);
      doc.addPage();
      drawHeader(
        doc,
        "HMRC Mileage Expense Report",
        `Tax Year ${taxYear}`,
        reportRef,
        pageWidth,
        margin
      );
    }

    let my = doc.y;

    // Header row
    doc.rect(margin, my, mTableW, 18).fill(NAVY);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
    let mx = margin;
    for (const col of mCols) {
      doc.text(col.header, mx + 4, my + 5, {
        width: col.width - 8,
        lineBreak: false,
      });
      mx += col.width;
    }
    my += 20;

    let totalMonthTrips = 0;
    let totalMonthMiles = 0;
    let totalMonthBusiness = 0;
    let totalMonthDeduction = 0;

    for (let i = 0; i < summary.monthlyBreakdown.length; i++) {
      const m = summary.monthlyBreakdown[i];
      totalMonthTrips += m.trips;
      totalMonthMiles += m.miles;
      totalMonthBusiness += m.businessMiles;
      totalMonthDeduction += m.deductionPence;

      if (i % 2 === 0) {
        doc.rect(margin, my - 1, mTableW, 18).fill(GREY_100);
      }

      doc.font("Helvetica").fontSize(8).fillColor(NAVY);
      mx = margin;
      const vals = [
        m.month,
        String(m.trips),
        `${m.miles.toFixed(1)} mi`,
        `${m.businessMiles.toFixed(1)} mi`,
        formatPence(m.deductionPence),
      ];
      for (let j = 0; j < mCols.length; j++) {
        doc.text(vals[j], mx + 4, my + 4, {
          width: mCols[j].width - 8,
          lineBreak: false,
        });
        mx += mCols[j].width;
      }
      my += 18;
    }

    // Totals row
    doc.rect(margin, my - 1, mTableW, 20).fill(NAVY_LIGHT);
    doc.font("Helvetica-Bold").fontSize(8).fillColor(WHITE);
    mx = margin;
    const totals = [
      "Total",
      String(totalMonthTrips),
      `${totalMonthMiles.toFixed(1)} mi`,
      `${totalMonthBusiness.toFixed(1)} mi`,
      formatPence(totalMonthDeduction),
    ];
    for (let j = 0; j < mCols.length; j++) {
      doc.text(totals[j], mx + 4, my + 5, {
        width: mCols[j].width - 8,
        lineBreak: false,
      });
      mx += mCols[j].width;
    }
    my += 24;
    doc.y = my;
  }

  // ── HMRC Rate Explanation ──
  doc.moveDown(0.5);

  // Check if we need a new page for the explanation box
  if (doc.y + 100 > pageHeight - 60) {
    drawFooter(doc, 1, null, pageWidth, pageHeight, margin, reportRef);
    doc.addPage();
    drawHeader(
      doc,
      "HMRC Mileage Expense Report",
      `Tax Year ${taxYear}`,
      reportRef,
      pageWidth,
      margin
    );
  }

  const infoBoxY = doc.y;
  const infoBoxH = 80;
  doc
    .roundedRect(margin, infoBoxY, contentWidth, infoBoxH, 6)
    .lineWidth(1)
    .fillAndStroke("rgba(245, 166, 35, 0.05)", AMBER);

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(AMBER_DARK)
    .text("HMRC Approved Mileage Allowance Rates", margin + 14, infoBoxY + 10);

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(GREY_600)
    .text(
      `Cars & Vans: ${HMRC_RATES.car.first10000}p per mile for the first ${HMRC_THRESHOLD_MILES.toLocaleString()} miles, then ${HMRC_RATES.car.after10000}p per mile thereafter.`,
      margin + 14,
      infoBoxY + 26,
      { width: contentWidth - 28 }
    )
    .text(
      `Motorcycles: ${HMRC_RATES.motorbike.flat}p per mile (flat rate, all miles).`,
      margin + 14,
      infoBoxY + 42,
      { width: contentWidth - 28 }
    )
    .text(
      "These are the standard HMRC rates for employees and self-employed individuals claiming business mileage. Rates are applied per vehicle type across the full tax year (6 April to 5 April).",
      margin + 14,
      infoBoxY + 56,
      { width: contentWidth - 28 }
    );

  doc.y = infoBoxY + infoBoxH + 12;

  // ── Earnings Summary ──
  if (summary.earningsByPlatform.length > 0) {
    if (doc.y + 80 > pageHeight - 60) {
      drawFooter(doc, 1, null, pageWidth, pageHeight, margin, reportRef);
      doc.addPage();
      drawHeader(
        doc,
        "HMRC Mileage Expense Report",
        `Tax Year ${taxYear}`,
        reportRef,
        pageWidth,
        margin
      );
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(NAVY)
      .text("Earnings Summary", margin, doc.y);
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10).fillColor(NAVY);

    for (const e of summary.earningsByPlatform) {
      doc.text(`${e.platform}: `, { continued: true });
      doc.font("Helvetica-Bold").text(formatPence(e.totalPence));
      doc.font("Helvetica");
    }

    doc.moveDown(0.3);
    doc
      .font("Helvetica-Bold")
      .text(`Total earnings: ${formatPence(summary.totalEarningsPence)}`);
    doc.font("Helvetica");
    doc.moveDown(1);
  }

  // ── Data Completeness ──
  const trips = await fetchExportTrips({ userId, taxYear });
  const completeness = calcDataCompleteness(trips);

  if (doc.y + 50 > pageHeight - 60) {
    drawFooter(doc, 1, null, pageWidth, pageHeight, margin, reportRef);
    doc.addPage();
    drawHeader(
      doc,
      "HMRC Mileage Expense Report",
      `Tax Year ${taxYear}`,
      reportRef,
      pageWidth,
      margin
    );
  }

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(completeness >= 90 ? GREEN : GREY_400);

  // Completeness bar
  const barY = doc.y;
  const barW = 140;
  const barH = 8;
  doc.roundedRect(margin, barY, barW, barH, 4).fill(GREY_200);
  doc
    .roundedRect(margin, barY, barW * (completeness / 100), barH, 4)
    .fill(completeness >= 90 ? GREEN : AMBER);

  doc.text(
    `${completeness}% data completeness — trips with full address and classification records`,
    margin + barW + 10,
    barY - 1,
    { width: contentWidth - barW - 10 }
  );

  doc.y = barY + 20;

  // ── Disclaimer ──
  doc.moveDown(1);
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(GREY_400)
    .text(
      "Disclaimer: This report is generated by MileClear for informational purposes. " +
        "It is your responsibility to verify all figures before submitting to HMRC. " +
        "MileClear is not a tax advisor. Consult a qualified accountant for tax advice.",
      margin,
      doc.y,
      { align: "center", width: contentWidth }
    );

  // ── Footer on all pages ──
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    drawFooter(doc, i + 1, pageCount, pageWidth, pageHeight, margin, reportRef);
  }

  doc.end();
  return bufferPromise;
}

// === Accounting integrations (coming soon) ========================

export async function formatXeroExpense(userId: string, taxYear: string) {
  const summary = await fetchExportSummary(userId, taxYear);

  return {
    Type: "ACCPAY",
    Contact: { Name: summary.userName },
    Date: summary.generatedAt.split("T")[0],
    DueDate: summary.generatedAt.split("T")[0],
    LineItems: summary.vehicleBreakdown.map((v) => ({
      Description: `HMRC mileage allowance — ${v.vehicleName} (${v.businessMiles.toFixed(1)} business miles)`,
      Quantity: 1,
      UnitAmount: (v.deductionPence / 100).toFixed(2),
      AccountCode: "395",
      TaxType: "NONE",
    })),
    Reference: `MileClear ${taxYear}`,
  };
}

export async function formatFreeAgentExpense(userId: string, taxYear: string) {
  const summary = await fetchExportSummary(userId, taxYear);

  return {
    expense: {
      user: summary.userName,
      dated_on: summary.generatedAt.split("T")[0],
      description: `HMRC mileage allowance ${taxYear}`,
      category: "285",
      gross_value: (summary.totalDeductionPence / 100).toFixed(2),
      sales_tax_rate: "0.0",
      manual_sales_tax_amount: "0.00",
      vehicle_breakdowns: summary.vehicleBreakdown.map((v) => ({
        vehicle: v.vehicleName,
        vehicle_type: v.vehicleType,
        business_miles: v.businessMiles,
        deduction: (v.deductionPence / 100).toFixed(2),
      })),
    },
  };
}

export async function formatQuickBooksExpense(
  userId: string,
  taxYear: string
) {
  const summary = await fetchExportSummary(userId, taxYear);

  return {
    AccountRef: { name: "Automobile", value: "55" },
    PaymentType: "Cash",
    TxnDate: summary.generatedAt.split("T")[0],
    Line: summary.vehicleBreakdown.map((v, i) => ({
      Id: String(i + 1),
      Description: `HMRC mileage — ${v.vehicleName} (${v.businessMiles.toFixed(1)} mi)`,
      Amount: (v.deductionPence / 100).toFixed(2),
      DetailType: "AccountBasedExpenseLineDetail",
      AccountBasedExpenseLineDetail: {
        AccountRef: { name: "Mileage", value: "56" },
      },
    })),
    PrivateNote: `MileClear export ${taxYear}`,
  };
}

// ── Invoice PDF (Get Paid, Jul 2026) ─────────────────────────────────────────

/**
 * Branded A4 portrait invoice. Reuses the buffer pattern above. Branding
 * comes from the user's business profile: uploaded logo (PNG/JPEG via
 * doc.image, with a trading-name text fallback), accent colour (validated
 * hex, default MileClear amber), address, VAT number, and bank details
 * (decrypted here, printed only on the owner's own document). The
 * "Payment reference: INV-NNNN" line is the exact string the Phase-4
 * bank reconciler matches on.
 */
export async function generateInvoicePdf(
  userId: string,
  invoiceId: string
): Promise<{ buffer: Buffer; filename: string }> {
  const [invoice, user, logo] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: {
        lineItems: { orderBy: { position: "asc" } },
        client: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        displayName: true,
        fullName: true,
        email: true,
        tradingName: true,
        businessAddress: true,
        vatRegistered: true,
        vatNumber: true,
        invoiceAccentColor: true,
        bankAccountName: true,
        bankSortCode: true,
        bankAccountNumber: true,
      },
    }),
    prisma.userLogo.findUnique({ where: { userId } }),
  ]);
  if (!invoice) throw new Error("Invoice not found");
  if (!user) throw new Error("User not found");

  const invoiceNumber = await ensureInvoiceNumber(invoice);
  const ref = formatInvoiceNumber(invoiceNumber);
  const accent = /^#[0-9a-fA-F]{6}$/.test(user.invoiceAccentColor ?? "")
    ? user.invoiceAccentColor!
    : AMBER;
  const businessName =
    user.tradingName || user.fullName || user.displayName || "Sole trader";

  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const done = collectPdfBuffer(doc);
  const pageWidth = 595.28;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;

  // ── Header: logo/name left, INVOICE + meta right
  let headerBottom = margin;
  let drewLogo = false;
  if (logo) {
    try {
      doc.image(Buffer.from(logo.data), margin, margin, { fit: [150, 56] });
      drewLogo = true;
      headerBottom = margin + 56;
    } catch {
      // Corrupt/unsupported image: fall through to the text wordmark.
    }
  }
  if (!drewLogo) {
    doc.font("Helvetica-Bold").fontSize(20).fillColor(NAVY);
    doc.text(businessName, margin, margin, { width: contentWidth - 200 });
    headerBottom = doc.y;
  }

  doc.font("Helvetica-Bold").fontSize(24).fillColor(accent);
  doc.text("INVOICE", margin, margin, { width: contentWidth, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor(GREY_600);
  doc.text(ref, { width: contentWidth, align: "right" });
  doc.text(`Issued: ${invoice.sentAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, {
    width: contentWidth,
    align: "right",
  });
  doc.text(`Due: ${invoice.dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, {
    width: contentWidth,
    align: "right",
  });
  const headerRight = doc.y;

  // From block (business identity under the logo)
  let y = Math.max(headerBottom, headerRight) + 8;
  doc.font("Helvetica").fontSize(9).fillColor(GREY_600);
  if (drewLogo) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY);
    doc.text(businessName, margin, y, { width: contentWidth / 2 });
    doc.font("Helvetica").fontSize(9).fillColor(GREY_600);
    y = doc.y;
  }
  if (user.businessAddress) {
    doc.text(user.businessAddress, margin, y, { width: contentWidth / 2 });
    y = doc.y;
  }
  if (user.email) {
    doc.text(user.email, margin, y, { width: contentWidth / 2 });
    y = doc.y;
  }

  // Accent rule
  y += 14;
  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(2).strokeColor(accent).stroke();
  y += 18;

  // ── Bill To
  doc.font("Helvetica-Bold").fontSize(9).fillColor(accent);
  doc.text("BILL TO", margin, y);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY);
  doc.text(invoice.company, margin, doc.y + 2);
  doc.font("Helvetica").fontSize(9).fillColor(GREY_600);
  const client = invoice.client;
  if (client) {
    const addr = [client.addressLine1, client.addressLine2, client.city, client.postcode]
      .filter(Boolean)
      .join("\n");
    if (addr) doc.text(addr);
    if (client.email) doc.text(client.email);
  } else if (invoice.clientEmail) {
    doc.text(invoice.clientEmail);
  }
  if (invoice.reference) {
    doc.text(`Your reference: ${invoice.reference}`);
  }
  y = doc.y + 24;

  // ── Line items table
  const colDesc = margin;
  const colQty = margin + contentWidth - 200;
  const colUnit = margin + contentWidth - 140;
  const colTotal = margin + contentWidth - 70;

  doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE);
  doc.rect(margin, y, contentWidth, 22).fill(NAVY);
  doc.fillColor(WHITE);
  doc.text("DESCRIPTION", colDesc + 8, y + 7, { width: colQty - colDesc - 16 });
  doc.text("QTY", colQty, y + 7, { width: 50, align: "right" });
  doc.text("UNIT", colUnit, y + 7, { width: 60, align: "right" });
  doc.text("TOTAL", colTotal, y + 7, { width: 70 - 8, align: "right" });
  y += 22;

  const lines =
    invoice.lineItems.length > 0
      ? invoice.lineItems.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPricePence: l.unitPricePence,
          totalPence: l.totalPence,
        }))
      : [
          {
            description: invoice.reference
              ? `Services — ${invoice.reference}`
              : "Services",
            quantity: 1,
            unitPricePence: invoice.subtotalPence ?? invoice.amountPence,
            totalPence: invoice.subtotalPence ?? invoice.amountPence,
          },
        ];

  doc.font("Helvetica").fontSize(9);
  for (const [i, line] of lines.entries()) {
    const rowH = 22;
    if (i % 2 === 1) {
      doc.rect(margin, y, contentWidth, rowH).fill(GREY_100);
    }
    doc.fillColor(NAVY);
    doc.text(line.description, colDesc + 8, y + 7, {
      width: colQty - colDesc - 16,
      ellipsis: true,
      height: rowH - 8,
    });
    doc.fillColor(GREY_600);
    doc.text(
      Number.isInteger(line.quantity) ? String(line.quantity) : line.quantity.toFixed(2),
      colQty,
      y + 7,
      { width: 50, align: "right" }
    );
    doc.text(formatPence(line.unitPricePence), colUnit, y + 7, { width: 60, align: "right" });
    doc.fillColor(NAVY);
    doc.text(formatPence(line.totalPence), colTotal, y + 7, { width: 70 - 8, align: "right" });
    y += rowH;
  }
  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.5).strokeColor(GREY_200).stroke();
  y += 12;

  // ── Totals block (right-aligned)
  const totalsLabelX = colUnit - 60;
  const totalsValueX = colTotal;
  const totalRow = (label: string, value: string, opts?: { bold?: boolean; accentBand?: boolean }) => {
    if (opts?.accentBand) {
      doc.rect(totalsLabelX - 8, y - 4, pageWidth - margin - totalsLabelX + 8, 24).fill(accent);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY);
      doc.text(label, totalsLabelX, y + 2, { width: totalsValueX - totalsLabelX + 20 });
      doc.text(value, totalsValueX - 20, y + 2, { width: 70 + 12, align: "right" });
      y += 26;
      return;
    }
    doc.font(opts?.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(GREY_600);
    doc.text(label, totalsLabelX, y, { width: totalsValueX - totalsLabelX + 20 });
    doc.fillColor(NAVY);
    doc.text(value, totalsValueX - 20, y, { width: 70 + 12, align: "right" });
    y += 16;
  };

  if (invoice.subtotalPence != null && invoice.vatRate != null) {
    totalRow("Subtotal", formatPence(invoice.subtotalPence));
    totalRow(`VAT @ ${invoice.vatRate}%`, formatPence(invoice.vatPence ?? 0));
  }
  totalRow("Total due", formatPence(invoice.amountPence), { accentBand: true });

  if (user.vatRegistered && user.vatNumber) {
    doc.font("Helvetica").fontSize(8).fillColor(GREY_600);
    doc.text(`VAT number: ${user.vatNumber}`, totalsLabelX - 8, y + 2);
    y = doc.y;
  }
  y += 24;

  // ── Payment details card
  const sortCode = decryptIfEncrypted(user.bankSortCode);
  const accountNumber = decryptIfEncrypted(user.bankAccountNumber);
  const hasBank = user.bankAccountName || sortCode || accountNumber;
  doc.rect(margin, y, contentWidth, hasBank ? 96 : 56).fill(GREY_100);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(accent === AMBER ? AMBER_DARK : accent);
  doc.text("PAYMENT DETAILS", margin + 12, y + 10);
  doc.font("Helvetica").fontSize(9).fillColor(NAVY);
  let py = y + 26;
  if (user.bankAccountName) {
    doc.text(`Account name: ${user.bankAccountName}`, margin + 12, py);
    py = doc.y;
  }
  if (sortCode) {
    doc.text(
      `Sort code: ${sortCode.slice(0, 2)}-${sortCode.slice(2, 4)}-${sortCode.slice(4, 6)}` +
        (accountNumber ? `    Account number: ${accountNumber}` : ""),
      margin + 12,
      py
    );
    py = doc.y;
  } else if (accountNumber) {
    doc.text(`Account number: ${accountNumber}`, margin + 12, py);
    py = doc.y;
  }
  doc.font("Helvetica-Bold");
  doc.text(`Payment reference: ${ref}`, margin + 12, py + 2);
  y += (hasBank ? 96 : 56) + 16;

  // ── Notes + footer
  if (invoice.notes) {
    doc.font("Helvetica").fontSize(8).fillColor(GREY_600);
    doc.text(invoice.notes, margin, y, { width: contentWidth });
    y = doc.y + 12;
  }
  doc.font("Helvetica").fontSize(7).fillColor(GREY_400);
  doc.text("Created with MileClear — mileage, invoices & tax for the self-employed — mileclear.com", margin, 780, {
    width: contentWidth,
    align: "center",
  });

  doc.end();
  const buffer = await done;
  return { buffer, filename: `${ref}.pdf` };
}
