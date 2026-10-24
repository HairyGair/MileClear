// Banks a driver can link through TrueLayer (our open banking provider),
// shown before they upgrade so nobody pays for Pro to find their bank is
// missing (Jason Clarke, Co-operative Bank, 24 Oct 2026).
//
// Source: TrueLayer's public provider list, UK, all release channels
// (https://auth.truelayer.com/api/providers?release_channel=alpha), read
// 24 Oct 2026. Credit-card-only providers (American Express, Barclaycard,
// Capital One, MBNA, Virgin Money Credit Card) are left out, as payouts
// land in a current account. Re-read the list when TrueLayer adds a bank.

export const OPEN_BANKING_BANKS = [
  "Bank of Scotland",
  "Barclays",
  "Danske Bank",
  "first direct",
  "Halifax",
  "HSBC",
  "Lloyds",
  "M&S Bank",
  "Mettle",
  "Monzo",
  "Nationwide",
  "NatWest",
  "Revolut",
  "Royal Bank of Scotland",
  "Santander",
  "Starling",
  "Tesco Bank",
  "Tide",
  "TSB",
  "Ulster Bank",
  "Wise",
  "Zempler (formerly Cashplus)",
] as const;

/** Banks on the list above that also link business accounts. */
export const OPEN_BANKING_BUSINESS_BANKS = [
  "Bank of Scotland",
  "Barclays",
  "HSBC",
  "Lloyds",
  "NatWest",
  "Royal Bank of Scotland",
  "Santander",
  "Ulster Bank",
] as const;

/** Longest bank name a driver can send from "My bank isn't listed". */
export const MISSING_BANK_MAX_LENGTH = 80;
