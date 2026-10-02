import { describe, it, expect } from "vitest";
import {
  saReturnTaxYear,
  saFilingDeadline,
  daysUntilSaDeadline,
  isSaCountdownSeason,
  previousTaxYear,
  taxYearRangeLabel,
  ukDateParts,
} from "./saCountdown.js";

// Instants in UTC. December and January are GMT, so UTC = UK time there;
// in April/October the UK is on BST (UTC+1).
const at = (iso: string) => new Date(iso);

describe("saReturnTaxYear", () => {
  it("is the tax year that ended the previous April", () => {
    expect(saReturnTaxYear(at("2026-10-02T12:00:00Z"))).toBe("2025-26");
    expect(saReturnTaxYear(at("2026-12-01T09:00:00Z"))).toBe("2025-26");
    expect(saReturnTaxYear(at("2027-01-15T09:00:00Z"))).toBe("2025-26");
  });

  it("does not move on until 6 April", () => {
    // 5 April 2027, late evening UK (BST): still the 2025-26 return.
    expect(saReturnTaxYear(at("2027-04-05T22:30:00Z"))).toBe("2025-26");
    // 23:30 UTC on 5 April is 00:30 BST on 6 April: the new tax year.
    expect(saReturnTaxYear(at("2027-04-05T23:30:00Z"))).toBe("2026-27");
    expect(saReturnTaxYear(at("2027-04-06T09:00:00Z"))).toBe("2026-27");
  });

  it("stays on the same return either side of 31 January", () => {
    expect(saReturnTaxYear(at("2027-01-31T23:00:00Z"))).toBe("2025-26");
    expect(saReturnTaxYear(at("2027-02-01T00:30:00Z"))).toBe("2025-26");
  });
});

describe("deadline", () => {
  it("is 31 January after the tax year ends", () => {
    expect(saFilingDeadline("2025-26").toISOString()).toBe("2027-01-31T23:59:59.000Z");
    expect(saFilingDeadline("2026-27").toISOString()).toBe("2028-01-31T23:59:59.000Z");
  });

  it("counts whole UK days", () => {
    expect(daysUntilSaDeadline(at("2026-12-01T08:00:00Z"))).toBe(61);
    expect(daysUntilSaDeadline(at("2027-01-29T18:00:00Z"))).toBe(2);
    expect(daysUntilSaDeadline(at("2027-01-30T23:59:00Z"))).toBe(1);
    expect(daysUntilSaDeadline(at("2027-01-31T00:01:00Z"))).toBe(0);
    expect(daysUntilSaDeadline(at("2027-01-31T23:59:00Z"))).toBe(0);
    expect(daysUntilSaDeadline(at("2027-02-01T00:01:00Z"))).toBe(-1);
  });

  it("can be asked about a specific tax year", () => {
    expect(daysUntilSaDeadline(at("2027-04-06T09:00:00Z"), "2025-26")).toBeLessThan(0);
    expect(daysUntilSaDeadline(at("2027-04-06T09:00:00Z"))).toBe(300);
  });
});

describe("isSaCountdownSeason", () => {
  it("runs 1 December to 31 January inclusive", () => {
    expect(isSaCountdownSeason(at("2026-11-30T23:59:00Z"))).toBe(false);
    expect(isSaCountdownSeason(at("2026-12-01T00:00:00Z"))).toBe(true);
    expect(isSaCountdownSeason(at("2026-12-25T12:00:00Z"))).toBe(true);
    expect(isSaCountdownSeason(at("2027-01-31T23:59:00Z"))).toBe(true);
    expect(isSaCountdownSeason(at("2027-02-01T00:00:00Z"))).toBe(false);
    expect(isSaCountdownSeason(at("2026-10-02T12:00:00Z"))).toBe(false);
  });
});

describe("helpers", () => {
  it("previousTaxYear steps back across the century digits", () => {
    expect(previousTaxYear("2026-27")).toBe("2025-26");
    expect(previousTaxYear("2000-01")).toBe("1999-00");
  });

  it("labels a tax year", () => {
    expect(taxYearRangeLabel("2025-26")).toBe("6 April 2025 to 5 April 2026");
  });

  it("reads UK time, not UTC", () => {
    // 23:30 UTC on 30 June is 00:30 BST on 1 July.
    expect(ukDateParts(at("2026-06-30T23:30:00Z"))).toEqual({ year: 2026, month: 7, day: 1, hour: 0 });
  });
});
