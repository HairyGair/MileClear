// Trip CSV import — bringing a mileage history over from another app.
//
// Deliberately NOT a set of per-vendor templates. Every rival exports a
// slightly different shape and changes it without warning, so instead of
// hardcoding MileIQ/Driversnote/TripLog layouts this maps columns by
// header synonyms and, where a header is genuinely ambiguous, by looking
// at the values underneath it. "Start" is a time in one app and a place
// in another; only the data can settle that.
//
// Round-tripping our own export is the baseline: Date, Start Time,
// End Time, From, To, Distance (miles), Classification, Business Purpose.

import { prisma } from "../lib/prisma.js";
import type {
  CsvTripRow,
  CsvTripRowError,
  CsvTripParsePreview,
  CsvTripImportResult,
  TripCsvColumnMap,
  TripClassification,
} from "@mileclear/shared";

const MAX_ROWS = 2000;
const KM_TO_MILES = 0.621371;
/** Two trips on the same day within this many miles are treated as the same. */
const DUPLICATE_MILES_TOLERANCE = 0.05;

// ── Cell handling ─────────────────────────────────────────────────

/** Neutralise spreadsheet formula injection, matching the earnings parser. */
function sanitizeCellValue(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Doubled quotes inside a quoted field are a literal quote.
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ── Value sniffing ────────────────────────────────────────────────

const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i;

function looksLikeTime(v: string): boolean {
  return TIME_RE.test(v.trim());
}

function looksLikeNumber(v: string): boolean {
  return /^-?[\d,]+(\.\d+)?\s*(mi|miles|km|kilometres)?$/i.test(v.trim());
}

function parseDateCell(value: string): Date | null {
  const v = value.trim();
  if (!v) return null;

  // ISO first — unambiguous.
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  // Otherwise assume DAY FIRST. This is a UK app and every UK export is
  // day-first; guessing US order would silently move 03/04 from 3 April
  // to 4 March, which is both wrong and invisible to the user.
  const dmy = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const yearRaw = Number(dmy[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  // "12 Aug 2026" and similar.
  const parsed = new Date(v);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function parseDistance(value: string): number | null {
  const cleaned = value.replace(/,/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseClassification(value: string | null): TripClassification {
  if (!value) return "unclassified";
  const v = value.toLowerCase();
  if (/business|work|client|b2b|^b$/.test(v)) return "business";
  if (/personal|private|commut|^p$/.test(v)) return "personal";
  return "unclassified";
}

// ── Column mapping ────────────────────────────────────────────────

const HEADER_PATTERNS: Record<keyof TripCsvColumnMap, RegExp[]> = {
  date: [/^date$/i, /trip.?date/i, /start.?date/i, /^day$/i],
  // The bare /^start$/ and /^end$/ forms sit on BOTH the time and the
  // place fields on purpose. Times are tried first (see `order`) and only
  // claim the column if the values under it actually look like times, so
  // "Start" holding 09:15 becomes a time and "Start" holding Exeter falls
  // through to `from`. Without the bare form here, a time-valued "Start"
  // is rejected by the place guard and then matched by nothing at all.
  startTime: [/start.?time/i, /^from.?time$/i, /departure/i, /^start$/i],
  endTime: [/end.?time/i, /stop.?time/i, /^to.?time$/i, /arrival/i, /^end$/i, /^stop$/i],
  from: [/^from$/i, /start.?(address|location|place|point)/i, /origin/i, /^start$/i],
  to: [/^to$/i, /end.?(address|location|place|point)/i, /destination/i, /^stop$/i, /^end$/i],
  distance: [/distance/i, /miles/i, /^mileage$/i, /^km$/i, /kilometre/i],
  classification: [/classification/i, /category/i, /^type$/i],
  purpose: [/purpose/i, /reason/i, /^notes?$/i, /description/i],
};

/**
 * Resolve headers to fields. Header match proposes; value sniffing
 * disposes — a column headed "Start" holding "08:42" is a time, the
 * same header holding "14 Rydon Acres" is a place.
 */
function mapColumns(
  headers: string[],
  sampleRows: string[][]
): TripCsvColumnMap {
  const map: TripCsvColumnMap = {
    date: null, startTime: null, endTime: null, from: null,
    to: null, distance: null, classification: null, purpose: null,
  };
  const taken = new Set<number>();

  const sampleFor = (idx: number): string[] =>
    sampleRows.map((r) => r[idx] ?? "").filter((v) => v.trim() !== "").slice(0, 8);

  // Strong, unambiguous fields first so they claim their column before
  // the looser patterns (from/to) get a chance to steal it.
  const order: (keyof TripCsvColumnMap)[] = [
    "date", "distance", "classification", "startTime", "endTime", "from", "to", "purpose",
  ];

  for (const field of order) {
    for (const pattern of HEADER_PATTERNS[field]) {
      const idx = headers.findIndex(
        (h, i) => !taken.has(i) && pattern.test(h.trim())
      );
      if (idx === -1) continue;

      const values = sampleFor(idx);
      // Ambiguity guards: only accept the column if the data agrees.
      if ((field === "startTime" || field === "endTime") && values.length) {
        if (!values.some(looksLikeTime)) continue;
      }
      if ((field === "from" || field === "to") && values.length) {
        if (values.every(looksLikeTime)) continue; // it is a time column
      }
      if (field === "distance" && values.length) {
        if (!values.some(looksLikeNumber)) continue;
      }

      map[field] = headers[idx];
      taken.add(idx);
      break;
    }
  }

  return map;
}

function detectSource(headers: string[]): string | null {
  const joined = headers.join("|").toLowerCase();
  if (/hmrc rate|business purpose/.test(joined)) return "MileClear";
  if (/mileiq/.test(joined)) return "MileIQ";
  if (/driversnote/.test(joined)) return "Driversnote";
  if (/triplog/.test(joined)) return "TripLog";
  return null;
}

// ── Preview ───────────────────────────────────────────────────────

export async function parseTripCsvPreview(
  userId: string,
  csvContent: string
): Promise<CsvTripParsePreview> {
  const lines = csvContent
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");

  if (lines.length < 2) {
    throw new Error("That file has no rows in it. Export again and re-upload.");
  }

  const headers = splitCsvLine(lines[0]);
  const dataLines = lines.slice(1);
  const parsedRows = dataLines.map(splitCsvLine);
  const columns = mapColumns(headers, parsedRows.slice(0, 20));

  if (!columns.date || !columns.distance) {
    const missing = [!columns.date && "a date", !columns.distance && "a distance"]
      .filter(Boolean)
      .join(" and ");
    throw new Error(
      `We could not find ${missing} column in that file. The columns we found were: ${headers.join(", ")}.`
    );
  }

  const idxOf = (name: string | null) =>
    name === null ? -1 : headers.indexOf(name);
  const iDate = idxOf(columns.date);
  const iStart = idxOf(columns.startTime);
  const iEnd = idxOf(columns.endTime);
  const iFrom = idxOf(columns.from);
  const iTo = idxOf(columns.to);
  const iDist = idxOf(columns.distance);
  const iClass = idxOf(columns.classification);
  const iPurpose = idxOf(columns.purpose);

  // Kilometres are converted rather than rejected — the whole point is
  // that someone is moving apps, and some of them default to km.
  const convertedFromKm = /km|kilometre/i.test(columns.distance);

  const rows: CsvTripRow[] = [];
  const errors: CsvTripRowError[] = [];

  for (let i = 0; i < parsedRows.length && rows.length < MAX_ROWS; i++) {
    const cells = parsedRows[i];
    const line = i + 2; // 1-based, plus the header row

    const date = parseDateCell(cells[iDate] ?? "");
    if (!date) {
      errors.push({ line, reason: `Could not read the date "${cells[iDate] ?? ""}"` });
      continue;
    }

    const rawDistance = parseDistance(cells[iDist] ?? "");
    if (rawDistance === null) {
      errors.push({ line, reason: `Could not read the distance "${cells[iDist] ?? ""}"` });
      continue;
    }

    const distanceMiles = convertedFromKm ? rawDistance * KM_TO_MILES : rawDistance;

    const cell = (idx: number): string | null => {
      if (idx === -1) return null;
      const v = (cells[idx] ?? "").trim();
      return v === "" ? null : sanitizeCellValue(v);
    };

    rows.push({
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      startTime: iStart === -1 ? null : (looksLikeTime(cells[iStart] ?? "") ? cells[iStart].trim() : null),
      endTime: iEnd === -1 ? null : (looksLikeTime(cells[iEnd] ?? "") ? cells[iEnd].trim() : null),
      from: cell(iFrom),
      to: cell(iTo),
      distanceMiles: Math.round(distanceMiles * 100) / 100,
      classification: parseClassification(cell(iClass) ?? cell(iPurpose)),
      purpose: cell(iPurpose),
      isDuplicate: false,
    });
  }

  if (dataLines.length > MAX_ROWS) {
    errors.push({
      line: MAX_ROWS + 2,
      reason: `Only the first ${MAX_ROWS} trips were read. Split the file and import the rest separately.`,
    });
  }

  await markDuplicates(userId, rows);

  return {
    detectedSource: detectSource(headers),
    columns,
    convertedFromKm,
    rows,
    totalRows: rows.length,
    totalMiles: Math.round(rows.reduce((s, r) => s + r.distanceMiles, 0) * 100) / 100,
    duplicateCount: rows.filter((r) => r.isDuplicate).length,
    errors,
  };
}

/**
 * Flag rows that already exist. Importing the same file twice is the
 * single most likely user error, and a silent double-count would
 * overstate someone's tax deduction.
 */
async function markDuplicates(userId: string, rows: CsvTripRow[]): Promise<void> {
  if (rows.length === 0) return;

  const dates = rows.map((r) => new Date(`${r.date}T00:00:00`));
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const max = new Date(Math.max(...dates.map((d) => d.getTime())));
  max.setDate(max.getDate() + 1);

  const existing = await prisma.trip.findMany({
    where: { userId, startedAt: { gte: min, lt: max } },
    select: { startedAt: true, distanceMiles: true },
  });

  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const byDate = new Map<string, number[]>();
  for (const t of existing) {
    const k = key(t.startedAt);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(t.distanceMiles);
  }

  for (const row of rows) {
    const sameDay = byDate.get(row.date);
    if (!sameDay) continue;
    row.isDuplicate = sameDay.some(
      (miles) => Math.abs(miles - row.distanceMiles) <= DUPLICATE_MILES_TOLERANCE
    );
  }
}

// ── Confirm ───────────────────────────────────────────────────────

export async function confirmTripCsvImport(
  userId: string,
  rows: CsvTripRow[],
  geocode: (address: string) => Promise<{ lat: number; lng: number } | null>
): Promise<CsvTripImportResult> {
  const toImport = rows.filter((r) => !r.isDuplicate && r.distanceMiles > 0);

  // Geocode each distinct address once. A year of commuting is the same
  // two addresses several hundred times over.
  const cache = new Map<string, { lat: number; lng: number } | null>();
  const resolve = async (addr: string | null) => {
    if (!addr) return null;
    if (!cache.has(addr)) cache.set(addr, await geocode(addr));
    return cache.get(addr) ?? null;
  };

  let imported = 0;
  let totalMiles = 0;

  for (const row of toImport) {
    const start = await resolve(row.from);
    const end = await resolve(row.to);

    // Midday, not midnight. An imported trip carries a date but rarely a
    // timezone, and 00:00 can slip across the 6 April tax-year boundary
    // into the wrong year once stored as UTC.
    const startedAt = new Date(`${row.date}T${row.startTime ?? "12:00"}`);
    if (isNaN(startedAt.getTime())) continue;
    const endedAt = row.endTime
      ? new Date(`${row.date}T${row.endTime}`)
      : null;

    await prisma.trip.create({
      data: {
        userId,
        // 0,0 is the established "no coordinates" sentinel (hasValidCoords
        // in routes/trips treats near-zero as unset), so imported rows we
        // cannot geocode stay out of the UK bounding-box queries that feed
        // community insights rather than planting a phantom cluster.
        startLat: start?.lat ?? 0,
        startLng: start?.lng ?? 0,
        endLat: end?.lat ?? null,
        endLng: end?.lng ?? null,
        startAddress: row.from,
        endAddress: row.to,
        distanceMiles: row.distanceMiles,
        startedAt,
        endedAt: endedAt && !isNaN(endedAt.getTime()) ? endedAt : null,
        isManualEntry: true,
        classification: row.classification,
        businessPurpose: row.purpose,
        notes: "Imported from CSV",
      },
    });

    imported++;
    totalMiles += row.distanceMiles;
  }

  return {
    imported,
    skippedDuplicates: rows.filter((r) => r.isDuplicate).length,
    skippedErrors: rows.length - toImport.length - rows.filter((r) => r.isDuplicate).length,
    totalMiles: Math.round(totalMiles * 100) / 100,
  };
}
