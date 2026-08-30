// Branded quote-PDF generator for Laura Backstaged (freelance theatre
// technician, MileClear user) — a one-off tool, not part of the product.
// Reuses the PDFKit conventions from services/export.ts (A4, 48pt margin,
// collectPdfBuffer) so it stays easy to align with the real invoice PDFs
// if this ever needs porting into the app later.
//
// Edit RATE_CARD below once; edit the `quote` object per booking, then run:
//
//   npx tsx apps/api/scripts/laura-quote.ts [outfile.pdf]
//
// Defaults to writing next to this script.
import { writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PDFDocument from "pdfkit";
import { formatPence } from "@mileclear/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Laura's brand ────────────────────────────────────────────────
const CHARCOAL = "#2b2b2b";
const CORAL = "#ff6b6b";
const CORAL_DARK = "#d9483f";
const WHITE = "#ffffff";
const GREY_100 = "#f7f7f8";
const GREY_200 = "#e5e7eb";
const GREY_500 = "#6b7280";
const GREY_400 = "#9ca3af";

// ── Set rates, from her flyer — pence. Reuse these when building `quote` below.
const RATE_CARD = {
  performancePence: 7000, // £70 per performance
  techDressPence: 4000, // £40 tech/dress
  hourlyNonPerformerPence: 3000, // £30/hr non-performer work (set up, load out, etc.)
};

// ── Types ─────────────────────────────────────────────────────────
type QuoteCost = number | "included" | "dash" | "not_included";

interface QuoteRow {
  time?: string;
  label: string;
  cost: QuoteCost;
  note?: string; // wrapped paragraph under the label (used for the travel row)
}

interface QuoteSection {
  heading: string;
  rows: QuoteRow[];
}

interface QuoteInput {
  quoteNumber: string;
  issueDate: Date;
  validUntil: Date;
  clientName: string;
  eventName?: string;
  sections: QuoteSection[];
  totalPence: number;
  footerNote: string;
}

// ── This booking — edit per quote ───────────────────────────────
const quote: QuoteInput = {
  quoteNumber: "Q-0001",
  issueDate: new Date("2026-07-24"),
  validUntil: new Date("2026-08-07"),
  clientName: "Client name",
  eventName: "Show / event name",
  sections: [
    {
      heading: "Friday 31st",
      rows: [
        { time: "12:00 – 14:00", label: "Set up", cost: RATE_CARD.hourlyNonPerformerPence * 2 },
        { time: "14:00 – 17:00", label: "Tech", cost: RATE_CARD.techDressPence },
      ],
    },
    {
      heading: "Saturday 1st",
      rows: [
        { time: "08:00 – 09:00", label: "Rig check", cost: "included" },
        { time: "10:00 – 12:00", label: "Tech/dress", cost: RATE_CARD.techDressPence },
        { time: "12:00 – 13:00", label: "Lunch", cost: "dash" },
        { time: "13:00 – 14:00", label: "Prep for show", cost: "included" },
        { time: "14:00 – 16:00", label: "Show", cost: RATE_CARD.performancePence },
        { time: "16:00 – 18:00", label: "Load out", cost: RATE_CARD.hourlyNonPerformerPence * 2 },
      ],
    },
    {
      heading: "Totals",
      rows: [
        { label: "Friday total", cost: RATE_CARD.hourlyNonPerformerPence * 2 + RATE_CARD.techDressPence },
        {
          label: "Saturday total",
          cost:
            RATE_CARD.techDressPence +
            RATE_CARD.performancePence +
            RATE_CARD.hourlyNonPerformerPence * 2,
        },
      ],
    },
    {
      heading: "Travel",
      rows: [
        {
          label: "",
          note:
            "Travel is not included and will be charged separately at the agreed mileage rate (if applicable). Work over 30 minutes from SG16 is quoted separately.",
          cost: "not_included",
        },
      ],
    },
  ],
  totalPence:
    RATE_CARD.hourlyNonPerformerPence * 2 +
    RATE_CARD.techDressPence +
    RATE_CARD.techDressPence +
    RATE_CARD.performancePence +
    RATE_CARD.hourlyNonPerformerPence * 2,
  footerNote:
    "This quote is valid until the date above and is not a contract until confirmed in writing by both parties. Prices exclude travel unless stated.",
};

// ── PDF generation ───────────────────────────────────────────────
function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function costCell(cost: QuoteCost): { text: string; italic: boolean; colour: string } {
  if (cost === "included") return { text: "Included", italic: true, colour: GREY_500 };
  if (cost === "dash") return { text: "–", italic: false, colour: GREY_500 };
  if (cost === "not_included") return { text: "Not Included", italic: true, colour: GREY_500 };
  return { text: formatPence(cost), italic: false, colour: CHARCOAL };
}

async function generateQuotePdf(input: QuoteInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const done = collectPdfBuffer(doc);
  const pageWidth = 595.28;
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  const dateFmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // ── Header: two-tone wordmark left, QUOTE + meta right
  doc.font("Helvetica-Bold").fontSize(20).fillColor(CHARCOAL);
  doc.text("Laura", margin, margin, { continued: true, lineBreak: false });
  doc.fillColor(CORAL).text("backstaged", { lineBreak: false });
  const wordmarkBottom = doc.y + doc.currentLineHeight();

  doc.font("Helvetica-Bold").fontSize(26).fillColor(CORAL);
  doc.text("QUOTE", margin, margin, { width: contentWidth, align: "right" });
  doc.font("Helvetica").fontSize(9).fillColor(GREY_500);
  doc.text(input.quoteNumber, { width: contentWidth, align: "right" });
  doc.text(`Issued: ${dateFmt(input.issueDate)}`, { width: contentWidth, align: "right" });
  doc.text(`Valid until: ${dateFmt(input.validUntil)}`, { width: contentWidth, align: "right" });
  const metaBottom = doc.y;

  let y = Math.max(wordmarkBottom, metaBottom) + 10;

  // ── For block
  doc.font("Helvetica-Bold").fontSize(9).fillColor(CORAL_DARK);
  doc.text("FOR", margin, y);
  doc.font("Helvetica-Bold").fontSize(12).fillColor(CHARCOAL);
  doc.text(input.clientName, margin, doc.y + 2);
  if (input.eventName) {
    doc.font("Helvetica").fontSize(9).fillColor(GREY_500);
    doc.text(input.eventName, margin, doc.y + 1);
  }
  y = doc.y + 14;

  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(2).strokeColor(CORAL).stroke();
  y += 16;

  // ── Table header banner
  const colItem = margin;
  const colCost = margin + contentWidth - 90;
  doc.rect(margin, y, contentWidth, 22).fill(CHARCOAL);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE);
  doc.text("ITEM", colItem + 10, y + 7);
  doc.text("COST", colCost, y + 7, { width: 90 - 10, align: "right" });
  y += 22 + 10;

  // ── Sections
  for (const section of input.sections) {
    doc.rect(margin, y + 2, 6, 6).fill(CORAL);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(CHARCOAL);
    doc.text(section.heading, margin + 14, y);
    y = doc.y + 6;

    for (const row of section.rows) {
      const cell = costCell(row.cost);
      const rowTop = y;
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor(CHARCOAL);
      doc.text(row.label, colItem + 14, y, { width: colCost - colItem - 24, continued: !!row.time });
      if (row.time) {
        doc.font("Helvetica").fillColor(GREY_500);
        doc.text(`   ${row.time}`, { continued: false });
      }
      doc.font(cell.italic ? "Helvetica-Oblique" : "Helvetica-Bold").fontSize(9.5).fillColor(cell.colour);
      doc.text(cell.text, colCost, rowTop, { width: 90 - 10, align: "right" });
      y = doc.y + 4;
      if (row.note) {
        doc.font("Helvetica").fontSize(8.5).fillColor(GREY_500);
        doc.text(row.note, colItem + 14, y, { width: colCost - colItem - 24 - 100 });
        y = doc.y + 4;
      }
    }
    y += 4;
    doc.moveTo(margin, y).lineTo(pageWidth - margin, y).lineWidth(0.5).strokeColor(GREY_200).stroke();
    y += 14;
  }

  // ── Total box
  doc.rect(margin, y, contentWidth, 34).fillAndStroke(GREY_100, CORAL);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(CHARCOAL);
  doc.text("TOTAL QUOTE", margin + 14, y + 10);
  doc.fontSize(16).fillColor(CORAL_DARK);
  doc.text(formatPence(input.totalPence), margin, y + 8, { width: contentWidth - 14, align: "right" });
  y += 34 + 16;

  // ── Footer
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(GREY_400);
  doc.text(input.footerNote, margin, y, { width: contentWidth });
  doc.font("Helvetica").fontSize(8).fillColor(GREY_400);
  doc.text(
    "Laura Backstaged  ·  Laurabackstaged@hotmail.com  ·  @Laurabackstaged  ·  15 yrs theatre experience, DBS checked",
    margin,
    770,
    { width: contentWidth, align: "center" }
  );

  doc.end();
  return done;
}

async function main() {
  const buffer = await generateQuotePdf(quote);
  const out = process.argv[2] || path.join(__dirname, "laura-quote-output.pdf");
  writeFileSync(out, buffer);
  console.log(`Written: ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
