import { describe, expect, it } from "vitest";
import { isKnownCountryCode, isUk } from "@mileclear/shared";
import {
  countryAskDue,
  countryToSuggest,
  onServerCountry,
  parseCachedCountry,
  regionFromLocale,
} from "../rule";

describe("parseCachedCountry", () => {
  it("reads the country and the pending flag", () => {
    expect(parseCachedCountry("NZ", "1")).toEqual({ country: "NZ", pending: true });
    expect(parseCachedCountry("GB", "0")).toEqual({ country: "GB", pending: false });
  });

  it("treats missing or junk as the UK, not pending", () => {
    expect(parseCachedCountry(null, null)).toEqual({ country: "GB", pending: false });
    expect(parseCachedCountry("Narnia", "yes")).toEqual({ country: "GB", pending: false });
  });
});

describe("onServerCountry", () => {
  it("adopts the server's value when nothing is waiting", () => {
    expect(onServerCountry("AU", { country: "GB", pending: false })).toEqual({ kind: "adopt", country: "AU" });
    expect(onServerCountry("GB", { country: "AU", pending: false })).toEqual({ kind: "adopt", country: "GB" });
  });

  it("keeps an offline choice and sends it again until the server has it", () => {
    expect(onServerCountry("GB", { country: "NZ", pending: true })).toEqual({ kind: "resend", country: "NZ" });
    expect(onServerCountry(undefined, { country: "NZ", pending: true })).toEqual({ kind: "resend", country: "NZ" });
    expect(onServerCountry("NZ", { country: "NZ", pending: true })).toEqual({ kind: "adopt", country: "NZ" });
  });

  it("leaves the phone alone when an older server omits it", () => {
    expect(onServerCountry(undefined, { country: "GB", pending: false })).toEqual({ kind: "keep" });
  });

  it("reads an unknown server value as the UK", () => {
    expect(onServerCountry("ZZ", { country: "NZ", pending: false })).toEqual({ kind: "adopt", country: "GB" });
  });
});

describe("regionFromLocale", () => {
  it("reads the region from iOS and Android locales", () => {
    expect(regionFromLocale("en_GB")).toBe("GB");
    expect(regionFromLocale("en-NZ")).toBe("NZ");
    expect(regionFromLocale("en_AU@rg=gbzzzz")).toBe("AU");
    expect(regionFromLocale("zh_Hant_TW")).toBe("TW");
  });

  it("returns null when there is no region", () => {
    expect(regionFromLocale("en")).toBeNull();
    expect(regionFromLocale(undefined)).toBeNull();
    expect(regionFromLocale("")).toBeNull();
  });
});

describe("countryAskDue", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  const base = {
    suggestion: "NZ",
    cached: { country: "GB", pending: false },
    asked: false,
    accountCreatedAt: "2026-10-22T09:00:00Z",
    now,
  };

  it("asks a new account with a country to suggest", () => {
    expect(countryAskDue(base)).toBe("NZ");
  });

  it("never asks without a suggestion, twice, or once a country is chosen", () => {
    expect(countryAskDue({ ...base, suggestion: null })).toBeNull();
    expect(countryAskDue({ ...base, asked: true })).toBeNull();
    expect(countryAskDue({ ...base, cached: { country: "AU", pending: false } })).toBeNull();
    expect(countryAskDue({ ...base, cached: { country: "GB", pending: true } })).toBeNull();
  });

  it("leaves accounts older than a week alone", () => {
    expect(countryAskDue({ ...base, accountCreatedAt: "2026-10-01T09:00:00Z" })).toBeNull();
    expect(countryAskDue({ ...base, accountCreatedAt: null })).toBeNull();
    expect(countryAskDue({ ...base, accountCreatedAt: "junk" })).toBeNull();
  });
});

describe("countryToSuggest", () => {
  const known = (c: string) => isKnownCountryCode(c);
  it("never asks a UK phone or a UK sign-up", () => {
    expect(countryToSuggest("GB", "GB", known, isUk)).toBeNull();
    expect(countryToSuggest("GB", null, known, isUk)).toBeNull();
    expect(countryToSuggest("JE", undefined, known, isUk)).toBeNull();
    expect(countryToSuggest(null, null, known, isUk)).toBeNull();
  });

  it("suggests the phone's region first, then the sign-up country", () => {
    expect(countryToSuggest("NZ", "GB", known, isUk)).toBe("NZ");
    expect(countryToSuggest("GB", "AU", known, isUk)).toBe("AU");
    expect(countryToSuggest(null, "IE", known, isUk)).toBe("IE");
  });

  it("ignores codes it doesn't know", () => {
    expect(countryToSuggest("ZZ", null, known, isUk)).toBeNull();
  });
});
