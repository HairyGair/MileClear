// Pure rules for the Country setting (23 Oct 2026). No React, no database,
// so they test in node. Same shape as the Miles / Kilometres rules
// (lib/units/rule.ts): a choice made offline wins until the server has it.
import { countryOf, DEFAULT_COUNTRY } from "@mileclear/shared";

export const COUNTRY_KEY = "country";
/** Set while a choice made on this phone hasn't reached the server yet. */
export const COUNTRY_PENDING_KEY = "country_pending";

export interface CachedCountry {
  country: string;
  pending: boolean;
}

export const NO_COUNTRY: CachedCountry = { country: DEFAULT_COUNTRY, pending: false };

/** Stored text to the cached choice. Anything unreadable is the UK, not pending. */
export function parseCachedCountry(country: string | null | undefined, pending: string | null | undefined): CachedCountry {
  return { country: countryOf(country), pending: pending === "1" };
}

export type ServerCountryStep =
  /** Show and cache what the server says. */
  | { kind: "adopt"; country: string }
  /** The phone's choice hasn't been saved yet: keep it and send it again. */
  | { kind: "resend"; country: string }
  /** Nothing to do (an old server that doesn't know the setting). */
  | { kind: "keep" };

export function onServerCountry(serverRaw: unknown, cached: CachedCountry): ServerCountryStep {
  if (cached.pending) {
    if (serverRaw === cached.country) return { kind: "adopt", country: cached.country };
    return { kind: "resend", country: cached.country };
  }
  if (serverRaw === undefined) return { kind: "keep" };
  return { kind: "adopt", country: countryOf(serverRaw) };
}

/**
 * The REGION an iPhone is set to, from its AppleLocale ("en_GB", or
 * "en_US@rg=gbzzzz" when the region was changed apart from the language:
 * the @rg= override wins). Upper-case code, or null. Script subtags
 * ("zh_Hant_TW") are skipped.
 *
 * Never pass a language setting here (AppleLanguages, Android's
 * localeIdentifier): "en_US" is a common language on UK phones and says
 * nothing about where the driver is.
 */
export function regionFromAppleLocale(locale: unknown): string | null {
  if (typeof locale !== "string") return null;
  const rg = /@(?:.*;)?rg=([a-z]{2})/i.exec(locale);
  if (rg) return rg[1].toUpperCase();
  const base = locale.split("@")[0];
  const parts = base.split(/[-_]/).slice(1);
  for (const p of parts) if (/^[A-Za-z]{2}$/.test(p)) return p.toUpperCase();
  return null;
}

/** Set once "Where do you drive?" has been shown on this phone. */
export const COUNTRY_ASKED_KEY = "country_asked";

/** Only a new account is asked (the same week-old line as the first-run tour). */
export const COUNTRY_ASK_ACCOUNT_DAYS = 7;

/**
 * Whether the one-off "Where do you drive?" sheet is due: a new account, still
 * on the default UK with nothing waiting to upload, never asked on this phone,
 * and a country to suggest. Returns that country, or null.
 */
export function countryAskDue(args: {
  suggestion: string | null;
  cached: CachedCountry;
  asked: boolean;
  accountCreatedAt: string | null | undefined;
  now: number;
}): string | null {
  const { suggestion, cached, asked, accountCreatedAt, now } = args;
  if (!suggestion || asked || cached.pending || cached.country !== DEFAULT_COUNTRY) return null;
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  if (!Number.isFinite(created) || now - created > COUNTRY_ASK_ACCOUNT_DAYS * 86_400_000) return null;
  return suggestion;
}

export interface CountrySuggestion {
  country: string;
  /** From the iPhone's own region setting. False when it is only the
   *  sign-up location (an IP, so a VPN or a trip abroad): then United
   *  Kingdom stays the main button. */
  strong: boolean;
}

/**
 * Whether to ask "Where do you drive?" once on first run, and which country
 * to offer. A phone whose region is the UK is never asked. Otherwise the
 * iPhone's region (strong), else the sign-up country (weak, the only hint on
 * Android), when it is a known country outside the UK.
 */
export function countryToSuggest(
  deviceRegion: string | null,
  signupCountry: string | null | undefined,
  known: (code: string) => boolean,
  isUkCode: (code: string) => boolean
): CountrySuggestion | null {
  if (deviceRegion && isUkCode(deviceRegion)) return null;
  if (deviceRegion && known(deviceRegion)) return { country: deviceRegion, strong: true };
  if (signupCountry && known(signupCountry) && !isUkCode(signupCountry)) return { country: signupCountry, strong: false };
  return null;
}
