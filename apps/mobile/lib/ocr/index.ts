/**
 * Vision OCR bridge
 *
 * Wraps the native VisionOcrModule with graceful fallbacks.
 * Returns empty results silently when not supported (Expo Go, Android).
 * Images are processed entirely on-device - nothing leaves the phone.
 */

import { NativeModules, Platform } from "react-native";

const VisionOcrModule = NativeModules.VisionOcrModule;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OcrLine {
  /** Raw text string recognized by Vision framework */
  text: string;
  /** Confidence score 0.0 - 1.0 */
  confidence: number;
}

export interface OcrParseResult {
  /** Amount in pence (integer), or null if not found */
  amountPence: number | null;
  /** ISO date string YYYY-MM-DD, or null if not found */
  date: string | null;
  /** Best-guess vendor name, or null if not found */
  vendor: string | null;
  /** Average confidence across all recognized lines (0.0 - 1.0) */
  confidence: number;
  /** All recognized text lines (raw) */
  rawLines: string[];
}

// ── Availability ──────────────────────────────────────────────────────────────

/**
 * Returns true only on iOS native builds with the Vision module linked.
 * Expo Go and Android both return false.
 */
export function isOcrAvailable(): boolean {
  return Platform.OS === "ios" && !!VisionOcrModule;
}

// ── Core recognition ──────────────────────────────────────────────────────────

/**
 * Run on-device text recognition on an image.
 *
 * @param imageUri - A file:// URI from expo-image-picker or expo-camera
 * @returns Array of recognized text lines with confidence scores
 */
export async function recognizeText(imageUri: string): Promise<OcrLine[]> {
  if (!isOcrAvailable()) return [];
  try {
    return await VisionOcrModule.recognizeText(imageUri);
  } catch {
    return [];
  }
}

// ── Receipt parser ────────────────────────────────────────────────────────────

/** Keywords that indicate a total/payable amount line */
const TOTAL_KEYWORDS = [
  "total",
  "amount due",
  "amount payable",
  "grand total",
  "balance due",
  "to pay",
  "subtotal",
  "sum",
  "net",
  "gross",
];

/** Month name abbreviations for date parsing */
const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Known UK store / petrol station names for vendor detection */
const KNOWN_VENDORS = [
  "tesco", "sainsbury", "asda", "morrisons", "waitrose", "marks & spencer",
  "m&s", "lidl", "aldi", "co-op", "costco", "iceland", "boots", "superdrug",
  "shell", "bp", "esso", "texaco", "gulf", "jet", "total energies",
  "mcdonald", "kfc", "burger king", "subway", "greggs", "costa", "starbucks",
  "deliveroo", "uber", "amazon", "dpd", "hermes", "evri", "yodel",
  "halfords", "argos", "currys", "b&q", "ikea", "screwfix", "toolstation",
];

/**
 * Extract a GBP amount (in pence) from a text line.
 * Handles: PS12.50, 12.50, 12,50, TOTAL 12.50
 */
function extractAmountFromLine(text: string): number | null {
  // Match PS xx.xx or xx.xx (with optional PS prefix)
  const match = text.match(/£?\s*(\d{1,4}[.,]\d{2})\b/);
  if (!match) return null;
  const raw = match[1].replace(",", ".");
  const parsed = parseFloat(raw);
  if (isNaN(parsed) || parsed <= 0 || parsed > 9999) return null;
  return Math.round(parsed * 100);
}

/**
 * Parse a date string into YYYY-MM-DD.
 * Handles: DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY, DD MMM YYYY, DD MMM YY
 */
function parseDateString(text: string): string | null {
  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (slashMatch) {
    const d = parseInt(slashMatch[1], 10);
    const m = parseInt(slashMatch[2], 10);
    let y = parseInt(slashMatch[3], 10);
    if (y < 100) y += y >= 50 ? 1900 : 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2099) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  // DD MMM YYYY or DD MMM YY (e.g. "14 Apr 2026" or "14 April 2026")
  const namedMatch = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b/);
  if (namedMatch) {
    const d = parseInt(namedMatch[1], 10);
    const monthKey = namedMatch[2].toLowerCase();
    const m = MONTH_NAMES[monthKey];
    let y = parseInt(namedMatch[3], 10);
    if (y < 100) y += y >= 50 ? 1900 : 2000;
    if (d >= 1 && d <= 31 && m && y >= 2000 && y <= 2099) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Parse recognized OCR lines into structured receipt data.
 *
 * Strategy:
 * 1. Amount - prefer lines near "TOTAL", "AMOUNT DUE" etc.; take the largest
 *    qualifying value as a fallback
 * 2. Date - first valid date found anywhere in the receipt
 * 3. Vendor - first non-empty line that contains a known brand, or the first line
 */
export function parseReceiptText(lines: OcrLine[]): OcrParseResult {
  const rawLines = lines.map((l) => l.text);
  const avgConfidence =
    lines.length > 0
      ? lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length
      : 0;

  // ── Amount ──

  let amountPence: number | null = null;

  // Pass 1: lines that contain a total keyword
  for (const line of lines) {
    const lower = line.text.toLowerCase();
    const isTotal = TOTAL_KEYWORDS.some((kw) => lower.includes(kw));
    if (isTotal) {
      const extracted = extractAmountFromLine(line.text);
      if (extracted !== null) {
        amountPence = extracted;
        break;
      }
    }
  }

  // Pass 2: if no total keyword match, take the largest amount on the receipt
  // (receipts often show the grand total as the largest number)
  if (amountPence === null) {
    let largest = 0;
    for (const line of lines) {
      const extracted = extractAmountFromLine(line.text);
      if (extracted !== null && extracted > largest) {
        largest = extracted;
        amountPence = extracted;
      }
    }
  }

  // ── Date ──

  let date: string | null = null;
  for (const line of lines) {
    date = parseDateString(line.text);
    if (date) break;
  }

  // ── Vendor ──

  let vendor: string | null = null;

  // Pass 1: look for a known store name in any line
  for (const line of lines) {
    const lower = line.text.toLowerCase();
    const found = KNOWN_VENDORS.find((v) => lower.includes(v));
    if (found) {
      // Use the actual line text (trimmed) rather than the keyword
      vendor = line.text.trim();
      break;
    }
  }

  // Pass 2: fall back to the first substantive line (often the store header)
  if (!vendor) {
    const firstMeaningful = lines.find(
      (l) =>
        l.text.trim().length > 3 &&
        // Skip lines that look purely numeric (amounts, barcodes)
        !/^\d[\d\s.,£]+$/.test(l.text.trim())
    );
    if (firstMeaningful) {
      vendor = firstMeaningful.text.trim();
    }
  }

  return {
    amountPence,
    date,
    vendor,
    confidence: avgConfidence,
    rawLines,
  };
}
