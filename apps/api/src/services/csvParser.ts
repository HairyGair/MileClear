import { prisma } from "../lib/prisma.js";
import type { CsvEarningRow, CsvParsePreview, CsvImportResult } from "@mileclear/shared";

// Platform detection by CSV header patterns
const PLATFORM_HEADER_PATTERNS: Record<string, RegExp[]> = {
  uber: [/trip.*date/i, /uber/i, /fare/i],
  deliveroo: [/deliveroo/i, /fee/i, /order.*id/i],
  amazon_flex: [/amazon/i, /block/i, /earnings/i],
  just_eat: [/just.*eat/i],
  stuart: [/stuart/i],
};

// Sanitize cell values to prevent CSV formula injection (=, +, -, @, \t, \r)
function sanitizeCellValue(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) {
    return "'" + value;
  }
  return value;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields.map(sanitizeCellValue);
}

function parseUkDate(value: string): Date | null {
  // Try DD/MM/YYYY or DD-MM-YYYY
  const ukMatch = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (ukMatch) {
    const [, day, month, year] = ukMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day));
    if (!isNaN(d.getTime())) return d;
  }

  // Try YYYY-MM-DD (ISO)
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }

  // Try parsing as generic date string
  const d = new Date(value);
  if (!isNaN(d.getTime())) return d;

  return null;
}

function parsePence(value: string): number | null {
  // Remove currency symbols and whitespace
  const cleaned = value.replace(/[£$€\s,]/g, "");
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

function detectPlatform(headers: string[]): string {
  const headerStr = headers.join(" ").toLowerCase();

  for (const [platform, patterns] of Object.entries(PLATFORM_HEADER_PATTERNS)) {
    const matchCount = patterns.filter((p) => p.test(headerStr)).length;
    if (matchCount >= 2 || (patterns.length === 1 && matchCount === 1)) {
      return platform;
    }
  }

  return "other";
}

function findColumnIndex(headers: string[], ...patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => pattern.test(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseRows(
  headers: string[],
  dataRows: string[][],
  platform: string
): Omit<CsvEarningRow, "isDuplicate">[] {
  // Find date column
  const dateCol = findColumnIndex(
    headers,
    /^date$/i,
    /trip.*date/i,
    /payment.*date/i,
    /earned.*date/i,
    /period.*start/i,
    /start.*date/i,
    /date/i
  );

  // Find amount column
  const amountCol = findColumnIndex(
    headers,
    /^amount$/i,
    /^total$/i,
    /earnings?$/i,
    /^fare$/i,
    /^fee$/i,
    /^pay$/i,
    /net.*pay/i,
    /total.*earn/i,
    /amount/i,
    /earn/i
  );

  // Find optional end date column
  const endDateCol = findColumnIndex(
    headers,
    /period.*end/i,
    /end.*date/i
  );

  if (dateCol === -1 || amountCol === -1) {
    return [];
  }

  const rows: Omit<CsvEarningRow, "isDuplicate">[] = [];

  for (const fields of dataRows) {
    if (fields.length <= Math.max(dateCol, amountCol)) continue;

    const dateStr = fields[dateCol];
    const amountStr = fields[amountCol];

    const date = parseUkDate(dateStr);
    const amountPence = parsePence(amountStr);

    if (!date || amountPence === null || amountPence <= 0) continue;

    const endDate =
      endDateCol !== -1 && fields[endDateCol]
        ? parseUkDate(fields[endDateCol])
        : null;

    const periodStart = date.toISOString().split("T")[0];
    const periodEnd = endDate
      ? endDate.toISOString().split("T")[0]
      : periodStart;

    const externalId = `csv_${platform}_${periodStart}_${amountPence}`;

    rows.push({
      platform,
      amountPence,
      periodStart,
      periodEnd,
      externalId,
    });
  }

  return rows;
}

export async function parseCsvPreview(
  userId: string,
  csvContent: string,
  overridePlatform?: string
): Promise<CsvParsePreview> {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must have a header row and at least one data row");
  }

  const headers = splitCsvLine(lines[0]);
  const dataRows = lines.slice(1).map(splitCsvLine);

  const platform = overridePlatform || detectPlatform(headers);
  const parsedRows = parseRows(headers, dataRows, platform);

  if (parsedRows.length === 0) {
    throw new Error(
      "Could not parse any earnings from the CSV. Ensure it has date and amount columns."
    );
  }

  // Check for existing externalIds to mark duplicates
  const externalIds = parsedRows.map((r) => r.externalId);
  const existing = await prisma.earning.findMany({
    where: {
      userId,
      externalId: { in: externalIds },
    },
    select: { externalId: true },
  });
  const existingSet = new Set(existing.map((e) => e.externalId));

  const rows: CsvEarningRow[] = parsedRows.map((r) => ({
    ...r,
    isDuplicate: existingSet.has(r.externalId),
  }));

  const duplicateCount = rows.filter((r) => r.isDuplicate).length;
  const totalAmountPence = rows
    .filter((r) => !r.isDuplicate)
    .reduce((sum, r) => sum + r.amountPence, 0);

  return {
    platform,
    rows,
    totalAmountPence,
    duplicateCount,
  };
}

export async function confirmCsvImport(
  userId: string,
  rows: CsvEarningRow[],
  filename?: string
): Promise<CsvImportResult> {
  // Filter out duplicates the client already marked
  const toImport = rows.filter((r) => !r.isDuplicate);

  let imported = 0;
  let skipped = 0;

  for (const row of toImport) {
    try {
      await prisma.earning.create({
        data: {
          userId,
          platform: row.platform,
          amountPence: row.amountPence,
          periodStart: new Date(row.periodStart),
          periodEnd: new Date(row.periodEnd),
          source: "csv",
          externalId: row.externalId,
          notes: filename ? `Imported from ${filename}` : null,
        },
      });
      imported++;
    } catch (err: any) {
      // Unique constraint violation = duplicate, skip it
      if (err?.code === "P2002") {
        skipped++;
      } else {
        throw err;
      }
    }
  }

  return { imported, skipped };
}
