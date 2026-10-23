import { afterEach, describe, expect, it } from "vitest";
import { countrySettingEnabledFor, effectiveCountry, jobCountry } from "../../lib/countrySetting.js";
import { ukOnlyUser } from "../../lib/ukOnly.js";

const before = process.env.COUNTRY_SETTING;
afterEach(() => {
  if (before === undefined) delete process.env.COUNTRY_SETTING;
  else process.env.COUNTRY_SETTING = before;
});

describe("the Country setting switch (23 Oct 2026)", () => {
  it("is off by default: every driver is GB and no job filters anyone", () => {
    delete process.env.COUNTRY_SETTING;
    expect(countrySettingEnabledFor({ isAdmin: false })).toBe(false);
    expect(effectiveCountry({ isAdmin: false, country: "NZ" })).toBe("GB");
    expect(jobCountry("NZ")).toBe("GB");
    expect(ukOnlyUser()).toEqual({});
  });

  it("admins have it while it is off, for testing, but jobs still treat them as GB", () => {
    delete process.env.COUNTRY_SETTING;
    expect(countrySettingEnabledFor({ isAdmin: true })).toBe(true);
    expect(effectiveCountry({ isAdmin: true, country: "NZ" })).toBe("NZ");
    expect(jobCountry("NZ")).toBe("GB");
  });

  it("only exactly 'on' turns it on for everyone", () => {
    process.env.COUNTRY_SETTING = "1";
    expect(countrySettingEnabledFor({ isAdmin: false })).toBe(false);
    process.env.COUNTRY_SETTING = "on";
    expect(countrySettingEnabledFor({ isAdmin: false })).toBe(true);
    expect(effectiveCountry({ isAdmin: false, country: "AU" })).toBe("AU");
    expect(effectiveCountry({ isAdmin: false, country: null })).toBe("GB");
    expect(jobCountry("AU")).toBe("AU");
    expect(ukOnlyUser()).toEqual({ country: { in: ["GB", "JE", "GG", "IM"] } });
  });
});
