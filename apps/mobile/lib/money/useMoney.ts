// Money in the driver's currency (23 Oct 2026). Amounts are stored in minor
// units (pence, cents) whatever the country, so only the symbol changes: a UK
// driver gets formatPence exactly as before, a New Zealand driver "$12.50".
// The currency follows the country (Settings > Country), never a conversion.
import { countryByCode, formatMoney, formatPence } from "@mileclear/shared";
import { useCountry } from "../country/country";

export interface Money {
  /** ISO 4217, e.g. "GBP", "NZD". */
  currency: string;
  /** Minor units to text: "£12.50", "$12.50". */
  format: (minor: number) => string;
  /** Shown before an amount box: "£", "$". */
  symbol: string;
}

const cache = new Map<string, Money>();

export function moneyFor(country: string): Money {
  let m = cache.get(country);
  if (!m) {
    const currency = countryByCode(country)?.currency ?? "GBP";
    m =
      currency === "GBP"
        ? { currency, format: formatPence, symbol: "£" }
        : {
            currency,
            format: (minor: number) => formatMoney(minor, currency),
            // The symbol formatMoney uses, else the code ("SEK").
            symbol: formatMoney(0, currency).replace(/[\d.,\s]/g, "") || currency,
          };
    cache.set(country, m);
  }
  return m;
}

/** The driver's currency. Re-renders when the country changes. */
export function useMoney(): Money {
  return moneyFor(useCountry());
}
