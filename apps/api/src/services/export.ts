import PDFDocument from "pdfkit";
import { formatPence, HMRC_RATES, HMRC_THRESHOLD_MILES } from "@mileclear/shared";
import type { ExportTripRow, ExportSummary } from "@mileclear/shared";
import { fetchExportTrips, fetchExportSummary } from "./export-data.js";

interface ExportOpts {
  taxYear?: string;
  from?: Date;
  to?: Date;
  classification?: "business" | "personal";
}

// --- CSV ---

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // Prevent CSV formula injection
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

// --- PDF (Trip Report) ---

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

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

  const doc = new PDFDocument({ layout: "landscape", size: "A4", margin: 40 });
  const bufferPromise = collectPdfBuffer(doc);

  const label = opts.taxYear
    ? `Tax Year ${opts.taxYear}`
    : `${opts.from!.toLocaleDateString("en-GB")} — ${opts.to!.toLocaleDateString("en-GB")}`;

  // Header
  doc.fontSize(20).font("Helvetica-Bold").text("MileClear Trip Report", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(12).font("Helvetica").text(label, { align: "center" });
  doc.moveDown(0.5);

  // Summary line
  const totalMiles = trips.reduce((sum, t) => sum + t.distanceMiles, 0);
  const totalDeduction = trips.reduce((sum, t) => sum + t.deductionPence, 0);
  const businessTrips = trips.filter((t) => t.classification === "business").length;
  doc
    .fontSize(10)
    .text(
      `${trips.length} trips | ${totalMiles.toFixed(1)} miles | ${businessTrips} business | Deduction: ${formatPence(totalDeduction)}`,
      { align: "center" }
    );
  doc.moveDown(1);

  // Table
  const cols = [
    { header: "Date", width: 70 },
    { header: "Time", width: 70 },
    { header: "From", width: 120 },
    { header: "To", width: 120 },
    { header: "Miles", width: 50 },
    { header: "Type", width: 55 },
    { header: "Platform", width: 65 },
    { header: "Vehicle", width: 90 },
    { header: "Rate", width: 40 },
    { header: "Deduction", width: 65 },
  ];

  const startX = 40;
  const rowHeight = 16;

  function drawTableHeader(y: number) {
    doc.font("Helvetica-Bold").fontSize(8);
    let x = startX;
    for (const col of cols) {
      doc.text(col.header, x, y, { width: col.width, lineBreak: false });
      x += col.width;
    }
    doc
      .moveTo(startX, y + rowHeight - 2)
      .lineTo(startX + cols.reduce((s, c) => s + c.width, 0), y + rowHeight - 2)
      .stroke("#999999");
    return y + rowHeight;
  }

  let y = drawTableHeader(doc.y);

  doc.font("Helvetica").fontSize(7);

  for (const trip of trips) {
    if (y > 540) {
      // Footer on current page
      doc.fontSize(7).font("Helvetica").text("MileClear — mileclear.com", startX, 560, { align: "center" });
      doc.addPage();
      y = drawTableHeader(40);
      doc.font("Helvetica").fontSize(7);
    }

    const values = [
      trip.date,
      `${trip.startTime}${trip.endTime ? "–" + trip.endTime : ""}`,
      trip.startAddress || "—",
      trip.endAddress || "—",
      trip.distanceMiles.toFixed(1),
      trip.classification,
      trip.platform || "—",
      trip.vehicleName || "—",
      `${trip.hmrcRatePence}p`,
      formatPence(trip.deductionPence),
    ];

    let x = startX;
    for (let i = 0; i < cols.length; i++) {
      doc.text(values[i], x, y, {
        width: cols[i].width,
        lineBreak: false,
      });
      x += cols[i].width;
    }
    y += rowHeight;
  }

  // Footer
  doc.fontSize(7).font("Helvetica").text(
    `Generated ${new Date().toLocaleDateString("en-GB")} — MileClear — mileclear.com`,
    startX,
    Math.min(y + 20, 560),
    { align: "center" }
  );

  doc.end();
  return bufferPromise;
}

// --- Self-Assessment PDF ---

export async function generateSelfAssessmentPdf(
  userId: string,
  taxYear: string
): Promise<Buffer> {
  const summary = await fetchExportSummary(userId, taxYear);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const bufferPromise = collectPdfBuffer(doc);

  // Title
  doc.fontSize(22).font("Helvetica-Bold").text("HMRC Mileage Expense Report", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(14).font("Helvetica").text(`Tax Year ${taxYear}`, { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(10).text(`Prepared for: ${summary.userName}`, { align: "center" });
  doc.moveDown(1.5);

  // Overview
  doc.fontSize(14).font("Helvetica-Bold").text("Mileage Overview");
  doc.moveDown(0.5);
  doc.fontSize(11).font("Helvetica");

  const overviewRows = [
    ["Total trips", String(summary.totalTrips)],
    ["Total miles", `${summary.totalMiles.toFixed(1)} mi`],
    ["Business miles", `${summary.businessMiles.toFixed(1)} mi`],
    ["Personal miles", `${summary.personalMiles.toFixed(1)} mi`],
    ["Total HMRC deduction", formatPence(summary.totalDeductionPence)],
  ];

  for (const [label, value] of overviewRows) {
    doc.text(`${label}:  `, { continued: true }).font("Helvetica-Bold").text(value);
    doc.font("Helvetica");
  }

  doc.moveDown(1.5);

  // Vehicle breakdown
  if (summary.vehicleBreakdown.length > 0) {
    doc.fontSize(14).font("Helvetica-Bold").text("Vehicle Breakdown");
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica");

    for (const v of summary.vehicleBreakdown) {
      doc.font("Helvetica-Bold").text(`${v.vehicleName} (${v.vehicleType})`);
      doc.font("Helvetica");

      const type = v.vehicleType;
      if (type === "motorbike") {
        doc.text(
          `  Business miles: ${v.businessMiles.toFixed(1)} mi @ ${HMRC_RATES.motorbike.flat}p/mi = ${formatPence(v.deductionPence)}`
        );
      } else {
        const rates = HMRC_RATES[type];
        if (v.businessMiles <= HMRC_THRESHOLD_MILES) {
          doc.text(
            `  Business miles: ${v.businessMiles.toFixed(1)} mi @ ${rates.first10000}p/mi = ${formatPence(v.deductionPence)}`
          );
        } else {
          const first = Math.round(HMRC_THRESHOLD_MILES * rates.first10000);
          const remaining = v.deductionPence - first;
          doc.text(
            `  First ${HMRC_THRESHOLD_MILES.toLocaleString()} mi @ ${rates.first10000}p/mi = ${formatPence(first)}`
          );
          doc.text(
            `  Remaining ${(v.businessMiles - HMRC_THRESHOLD_MILES).toFixed(1)} mi @ ${rates.after10000}p/mi = ${formatPence(remaining)}`
          );
          doc.text(`  Total: ${formatPence(v.deductionPence)}`);
        }
      }

      doc.text(`  Total miles: ${v.totalMiles.toFixed(1)} mi`);
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);
  }

  // Earnings summary
  if (summary.earningsByPlatform.length > 0) {
    doc.fontSize(14).font("Helvetica-Bold").text("Earnings Summary");
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica");

    for (const e of summary.earningsByPlatform) {
      doc.text(`${e.platform}: ${formatPence(e.totalPence)}`);
    }

    doc.moveDown(0.3);
    doc
      .font("Helvetica-Bold")
      .text(`Total earnings: ${formatPence(summary.totalEarningsPence)}`);
    doc.font("Helvetica");
    doc.moveDown(1.5);
  }

  // Disclaimer
  doc.fontSize(8).fillColor("#666666");
  doc.text(
    "Disclaimer: This report is generated by MileClear for informational purposes. " +
      "It is your responsibility to verify all figures before submitting to HMRC. " +
      "MileClear is not a tax advisor. Consult a qualified accountant for tax advice.",
    { align: "center" }
  );
  doc.moveDown(0.5);
  doc.text(
    `Generated on ${new Date().toLocaleDateString("en-GB")} — MileClear — mileclear.com`,
    { align: "center" }
  );

  doc.end();
  return bufferPromise;
}

// --- Accounting integrations (coming_soon) ---

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
