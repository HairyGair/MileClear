// Money in the driver's currency (23 Oct 2026, going beyond the UK). Stored
// amounts are minor units everywhere (pence, cents), so only the symbol and
// the grouping change. GBP goes through formatPence so UK figures are exactly
// what they were. Grouping is done by hand, like formatPence, so the API, the
// web and both phone engines print the same thing.
import { formatPence } from "./index.js";

const SYMBOLS: Record<string, string> = {
  GBP: "£",
  EUR: "€",
  NZD: "$",
  AUD: "$",
  CAD: "$",
  USD: "$",
  ZAR: "R",
};

/** Currencies with no minor unit: the stored figure is already whole. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "UGX", "XAF", "XOF"]);

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Format an amount in minor units (e.g. 123456 NZD -> "$1,234.56").
 * GBP is formatPence ("£1,234.56"). A currency with no symbol here is shown
 * with its code ("SEK 1,234.56"). Missing currency is GBP.
 */
export function formatMoney(minor: number, currency?: string | null): string {
  const code = (currency || "GBP").toUpperCase();
  if (code === "GBP") return formatPence(minor);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const text = ZERO_DECIMAL.has(code)
    ? group(String(Math.round(abs)))
    : (() => {
        const [whole, frac] = (abs / 100).toFixed(2).split(".");
        return `${group(whole)}.${frac}`;
      })();
  const symbol = SYMBOLS[code];
  const body = symbol ? `${symbol}${text}` : `${code} ${text}`;
  return negative ? `-${body}` : body;
}

/** A per-km rate in minor units, e.g. 120 NZD -> "$1.20", 37 -> "37c". */
export function formatRatePerKm(minorPerKm: number, currency: string): string {
  if (currency === "GBP") return `${minorPerKm}p`;
  return minorPerKm >= 100 ? formatMoney(minorPerKm, currency) : `${minorPerKm}c`;
}
