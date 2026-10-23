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
 * The region part of a phone locale ("en_GB", "en-NZ", "en_AU@rg=gbzzzz")
 * as an upper-case code, or null. Script subtags ("zh_Hant_TW") are skipped.
 */
export function regionFromLocale(locale: unknown): string | null {
  if (typeof locale !== "string") return null;
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

/**
 * Whether to ask "Where do you drive?" once on first run, and with which
 * country picked. Only when the phone's region or the sign-up location is a
 * known country outside the UK; UK phones never see it.
 */
export function countryToSuggest(
  deviceRegion: string | null,
  signupCountry: string | null | undefined,
  known: (code: string) => boolean,
  isUkCode: (code: string) => boolean
): string | null {
  for (const c of [deviceRegion, signupCountry ?? null]) {
    if (c && known(c) && !isUkCode(c)) return c;
  }
  return null;
}
