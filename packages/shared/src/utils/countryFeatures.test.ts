import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  SHORTLIST_COUNTRY_CODES,
  countryByCode,
  countryName,
  countryOf,
  isKnownCountryCode,
} from "../data/countries.js";
import { featuresFor, isUk, ukOnlyFeaturesFor, UK_COUNTRY_CODES } from "./countryFeatures.js";

describe("countries", () => {
  it("has unique two-letter codes and three-letter currencies", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(c.currency).toMatch(/^[A-Z]{3}$/);
      expect(c.name.length).toBeGreaterThan(1);
    }
  });

  it("knows the shortlist", () => {
    for (const code of SHORTLIST_COUNTRY_CODES) expect(countryByCode(code)).not.toBeNull();
  });

  it("has the right units and money for the countries we plan for", () => {
    expect(countryByCode("GB")).toMatchObject({ name: "United Kingdom", currency: "GBP", usesKm: false });
    expect(countryByCode("US")).toMatchObject({ currency: "USD", usesKm: false });
    expect(countryByCode("IE")).toMatchObject({ currency: "EUR", usesKm: true });
    expect(countryByCode("AU")).toMatchObject({ currency: "AUD", usesKm: true });
    expect(countryByCode("NZ")).toMatchObject({ currency: "NZD", usesKm: true });
    expect(countryByCode("CA")).toMatchObject({ currency: "CAD", usesKm: true });
  });

  it("treats missing, unknown and junk as the UK", () => {
    expect(countryOf(undefined)).toBe("GB");
    expect(countryOf(null)).toBe("GB");
    expect(countryOf("")).toBe("GB");
    expect(countryOf("ZZ")).toBe("GB");
    expect(countryOf(42)).toBe("GB");
    expect(countryOf(" nz ")).toBe("NZ");
    expect(countryName(null)).toBe("United Kingdom");
  });

  it("only accepts exact known codes", () => {
    expect(isKnownCountryCode("AU")).toBe(true);
    expect(isKnownCountryCode("au")).toBe(false);
    expect(isKnownCountryCode("ZZ")).toBe(false);
    expect(isKnownCountryCode("GBR")).toBe(false);
  });
});

describe("featuresFor", () => {
  it("gives the UK, and drivers with no country, everything they had", () => {
    for (const c of [...UK_COUNTRY_CODES, undefined, null, "", "ZZ"]) {
      expect(isUk(c)).toBe(true);
      expect(Object.values(featuresFor(c)).every(Boolean)).toBe(true);
      expect(ukOnlyFeaturesFor(c)).toEqual([]);
    }
  });

  it("hides every UK-only feature outside the UK", () => {
    for (const c of ["IE", "AU", "NZ", "CA", "US", "DE"]) {
      expect(isUk(c)).toBe(false);
      expect(Object.values(featuresFor(c)).some(Boolean)).toBe(false);
      expect(ukOnlyFeaturesFor(c)).toContain("ukTax");
      expect(ukOnlyFeaturesFor(c)).toContain("fuelPrices");
    }
  });
});
