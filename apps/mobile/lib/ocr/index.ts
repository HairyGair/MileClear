/**
 * On-device OCR bridge
 *
 * Two engines behind one interface:
 *   - iOS:     Apple Vision, via the native VisionOcrModule.
 *   - Android: Google ML Kit, via @react-native-ml-kit/text-recognition.
 *
 * Both run entirely on-device - no image ever leaves the phone. Returns empty
 * results silently when neither engine is present (Expo Go, web).
 *
 * The receipt parser below is engine-agnostic and shared by both platforms;
 * only recognizeText() differs.
 */

import { NativeModules, Platform } from "react-native";

const VisionOcrModule = NativeModules.VisionOcrModule;

// Checked directly rather than through the package's default export: when the
// native side is missing, that export is a Proxy that throws on ANY property
// access, so touching it to test availability is itself the crash.
const MlKitNativeModule = NativeModules.TextRecognition;

type MlKitModule = typeof import("@react-native-ml-kit/text-recognition").default;
let mlKit: MlKitModule | null = null;
let mlKitLoadAttempted = false;

function loadMlKit(): MlKitModule | null {
  if (mlKitLoadAttempted) return mlKit;
  mlKitLoadAttempted = true;
  if (Platform.OS !== "android" || !MlKitNativeModule) return null;
  try {
    mlKit = require("@react-native-ml-kit/text-recognition").default;
  } catch {
    mlKit = null;
  }
  return mlKit;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OcrLine {
  /** Raw text string recognized by the OCR engine */
  text: string;
  /**
   * Confidence score 0.0 - 1.0, or null when the engine doesn't report one.
   * Apple Vision gives a per-line confidence; ML Kit does not expose one
   * through its React Native bridge. Null rather than an invented number:
   * this value is shown to the driver as a percentage, and a fabricated
   * "90%" would be presented as if it were measured.
   */
  confidence: number | null;
}

export interface OcrParseResult {
  /** Amount in pence (integer), or null if not found */
  amountPence: number | null;
  /** ISO date string YYYY-MM-DD, or null if not found */
  date: string | null;
  /** Best-guess vendor name, or null if not found */
  vendor: string | null;
  /**
   * Average confidence across all recognized lines (0.0 - 1.0), or null when
   * the engine reports no confidence at all (ML Kit / Android). Callers must
   * hide any confidence UI when this is null.
   */
  confidence: number | null;
  /** All recognized text lines (raw) */
  rawLines: string[];
}

// ── Availability ──────────────────────────────────────────────────────────────

/**
 * True when an on-device OCR engine is present: Apple Vision on iOS native
 * builds, ML Kit on Android native builds. Expo Go returns false on both.
 */
export function isOcrAvailable(): boolean {
  if (Platform.OS === "ios") return !!VisionOcrModule;
  if (Platform.OS === "android") return loadMlKit() !== null;
  return false;
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

  if (Platform.OS === "android") {
    const engine = loadMlKit();
    if (!engine) return [];
    try {
      // ML Kit returns blocks of lines; Vision returns a flat list of lines.
      // Flatten to match, so parseReceiptText sees the same shape either way.
      const result = await engine.recognize(imageUri);
      return (result?.blocks || []).flatMap((block) =>
        (block.lines || [])
          .map((line) => ({ text: line.text, confidence: null }))
          .filter((line) => !!line.text),
      );
    } catch {
      return [];
    }
  }

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
  const slashMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
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
  // Average only the lines that actually carry a score. Treating a missing
  // score as 0 would drag the average down and make a good ML Kit scan look
  // like a bad one; null means "not measured", not "measured as zero".
  const scored = lines
    .map((l) => l.confidence)
    .filter((c): c is number => typeof c === "number");
  const avgConfidence =
    scored.length > 0 ? scored.reduce((sum, c) => sum + c, 0) / scored.length : null;

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
