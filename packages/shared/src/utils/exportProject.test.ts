import { describe, it, expect } from "vitest";
import {
  exportProjectChoices,
  exportProjectLabel,
  exportProjectSlug,
  projectLabelMatches,
} from "./exportProject.js";
import { projectLabelKey } from "./projectMileage.js";

describe("projectLabelMatches", () => {
  it("matches the same client however it was typed", () => {
    const key = projectLabelKey("NHS Trust");
    expect(projectLabelMatches("NHS Trust", key)).toBe(true);
    expect(projectLabelMatches("  nhs   trust ", key)).toBe(true);
    expect(projectLabelMatches("NHS", key)).toBe(false);
  });
  it("never matches a trip with no client, or an empty key", () => {
    expect(projectLabelMatches(null, projectLabelKey("NHS"))).toBe(false);
    expect(projectLabelMatches("", "")).toBe(false);
    expect(projectLabelMatches("NHS", "")).toBe(false);
  });
});

describe("exportProjectLabel", () => {
  it("tidies spaces and keeps the driver's capitals", () => {
    expect(exportProjectLabel("  Private   practice ")).toBe("Private practice");
  });
  it("never comes back blank", () => {
    expect(exportProjectLabel("   ")).toBe("Client");
  });
});

describe("exportProjectSlug", () => {
  it("is lower case letters, digits and hyphens", () => {
    expect(exportProjectSlug("NHS Trust")).toBe("nhs-trust");
    expect(exportProjectSlug("Smith & Sons Ltd.")).toBe("smith-sons-ltd");
  });
  it("strips anything that could break a file name or a header", () => {
    const slug = exportProjectSlug('=Evil"; rm ../../x\r\n Ä1');
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  it("is at most 40 characters and never ends in a hyphen", () => {
    const slug = exportProjectSlug(`${"a".repeat(39)} b`);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });
  it("never comes back empty", () => {
    expect(exportProjectSlug("!!!")).toBe("client");
  });
});

describe("exportProjectChoices", () => {
  it("is null when no trip has a client", () => {
    expect(exportProjectChoices([])).toBeNull();
    expect(exportProjectChoices(["  ", ""])).toBeNull();
  });
  it("puts All clients first, then one row per client", () => {
    expect(exportProjectChoices(["NHS", "Private  practice", "nhs"])).toEqual([
      { projectLabel: undefined, label: "All clients" },
      { projectLabel: "NHS", label: "NHS" },
      { projectLabel: "Private practice", label: "Private practice" },
    ]);
  });
  it("offers a choice even with one client (all, or just that one)", () => {
    expect(exportProjectChoices(["NHS"])).toHaveLength(2);
  });
});
