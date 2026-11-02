import { describe, it, expect } from "vitest";
import {
  EXPLAINER_CARDS,
  LATE_SECTIONS,
  LATE_TITLE,
  SENDS_SECTIONS,
  SENDS_TITLE,
  MTD_EXPLAINER_ROUTE,
  MTD_LATE_ROUTE,
  MTD_SENDS_ROUTE,
} from "./mtdHelpCopy";

const all = [
  LATE_TITLE,
  SENDS_TITLE,
  ...EXPLAINER_CARDS.flatMap((c) => [c.title, c.body, c.tip?.lead ?? "", c.tip?.text ?? ""]),
  ...LATE_SECTIONS.flatMap((s) => [s.heading ?? "", s.body]),
  ...SENDS_SECTIONS.flatMap((s) => [s.heading ?? "", s.body]),
].join("\n");

describe("quarterly updates help copy", () => {
  it("has five explainer cards and the last one finishes", () => {
    expect(EXPLAINER_CARDS).toHaveLength(5);
    expect(EXPLAINER_CARDS.filter((c) => c.last)).toHaveLength(1);
  });
  it("uses no em dashes and never calls anything approved or recognised", () => {
    expect(all).not.toMatch(/—|–/);
    expect(all).not.toMatch(/approved|recognised|recognized/i);
  });
  it("does not promise penalty points for 2026-27 quarterly updates", () => {
    const late = LATE_SECTIONS.map((s) => s.body).join(" ");
    expect(late).toMatch(/2026-27[^.]*no penalties/);
    expect(late).toMatch(/4 points/);
  });
  it("has one route per screen", () => {
    expect(new Set([MTD_EXPLAINER_ROUTE, MTD_LATE_ROUTE, MTD_SENDS_ROUTE]).size).toBe(3);
  });
});
