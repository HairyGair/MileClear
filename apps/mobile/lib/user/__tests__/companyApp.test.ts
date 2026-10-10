import { describe, it, expect } from "vitest";
import { seesCompanyDriverApp } from "../companyApp";

describe("seesCompanyDriverApp", () => {
  it("is true for a team company driver", () => {
    expect(seesCompanyDriverApp({ isCompanyDriver: true, workType: "gig" })).toBe(true);
  });
  it("is true for a driver who chose A company car", () => {
    expect(seesCompanyDriverApp({ isCompanyDriver: false, workType: "company" })).toBe(true);
  });
  it("is false for everyone else", () => {
    for (const w of ["gig", "employee", "both", null, undefined]) {
      expect(seesCompanyDriverApp({ isCompanyDriver: false, workType: w })).toBe(false);
    }
  });
});
