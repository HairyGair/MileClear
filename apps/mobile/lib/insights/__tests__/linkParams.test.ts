import { describe, expect, it } from "vitest";
import { parseInsightsLink, stampInsightsLink } from "../linkParams";

describe("parseInsightsLink", () => {
  it("reads period and offset", () => {
    expect(parseInsightsLink("week", "-1")).toEqual({ period: "week", offset: -1 });
    expect(parseInsightsLink("month", undefined)).toEqual({ period: "month", offset: 0 });
    expect(parseInsightsLink("tax_year", "0")).toEqual({ period: "tax_year", offset: 0 });
  });
  it("takes the first of repeated params", () => {
    expect(parseInsightsLink(["month", "week"], ["-2", "0"])).toEqual({ period: "month", offset: -2 });
  });
  it("ignores a missing or unknown period", () => {
    expect(parseInsightsLink(undefined, "-1")).toBeNull();
    expect(parseInsightsLink("year", "-1")).toBeNull();
    expect(parseInsightsLink("", undefined)).toBeNull();
  });
  it("never looks forward and ignores rubbish offsets", () => {
    expect(parseInsightsLink("week", "3")).toEqual({ period: "week", offset: 0 });
    expect(parseInsightsLink("week", "abc")).toEqual({ period: "week", offset: 0 });
    expect(parseInsightsLink("week", "-1.5")).toEqual({ period: "week", offset: 0 });
    expect(parseInsightsLink("week", "-99999")).toEqual({ period: "week", offset: -520 });
  });
});

describe("stampInsightsLink", () => {
  it("stamps Insights period links with the tap time", () => {
    expect(stampInsightsLink("/insights?period=week", 123)).toBe("/insights?period=week&at=123");
    expect(stampInsightsLink("/insights?period=week&offset=-1", 5)).toBe("/insights?period=week&offset=-1&at=5");
  });
  it("leaves every other route alone", () => {
    expect(stampInsightsLink("/(tabs)/tax", 1)).toBe("/(tabs)/tax");
    expect(stampInsightsLink("/insights", 1)).toBe("/insights");
  });
});
