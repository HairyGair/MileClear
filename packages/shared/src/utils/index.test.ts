import { describe, it, expect } from "vitest";
import {
  haversineDistance,
  calculateHmrcDeduction,
  formatPence,
  formatMiles,
  getTaxYear,
  parseTaxYear,
} from "./index.js";

// ---------------------------------------------------------------------------
// haversineDistance
// ---------------------------------------------------------------------------

describe("haversineDistance", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistance(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  it("calculates distance between London and Manchester (~163 miles)", () => {
    // London: 51.5074, -0.1278 — Manchester: 53.4808, -2.2426
    const dist = haversineDistance(51.5074, -0.1278, 53.4808, -2.2426);
    // Straight-line distance is ~163 miles; allow ±2 miles for float precision
    expect(dist).toBeGreaterThan(161);
    expect(dist).toBeLessThan(165);
  });

  it("is symmetric — A→B equals B→A", () => {
    const ab = haversineDistance(51.5, -0.1, 53.48, -2.24);
    const ba = haversineDistance(53.48, -2.24, 51.5, -0.1);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it("returns a positive distance for nearby coordinates", () => {
    // 1 degree of latitude ≈ 69 miles
    const dist = haversineDistance(51.0, 0.0, 52.0, 0.0);
    expect(dist).toBeGreaterThan(60);
    expect(dist).toBeLessThan(75);
  });

  it("handles negative latitudes and longitudes (southern hemisphere)", () => {
    // Sydney, AU to Melbourne, AU
    const dist = haversineDistance(-33.8688, 151.2093, -37.8136, 144.9631);
    // Approx 443 miles straight-line
    expect(dist).toBeGreaterThan(430);
    expect(dist).toBeLessThan(460);
  });

  it("handles coordinates that cross the prime meridian", () => {
    // Two points straddling 0° longitude
    const dist = haversineDistance(51.5, -1.0, 51.5, 1.0);
    // 2 degrees longitude at lat 51.5 ≈ ~86 miles
    expect(dist).toBeGreaterThan(80);
    expect(dist).toBeLessThan(92);
  });

  it("handles zero latitude difference (same latitude, different longitude)", () => {
    const dist = haversineDistance(0, 0, 0, 1);
    // 1 degree of longitude at equator ≈ 69.17 miles
    expect(dist).toBeGreaterThan(68);
    expect(dist).toBeLessThan(71);
  });
});

// ---------------------------------------------------------------------------
// calculateHmrcDeduction
// ---------------------------------------------------------------------------

describe("calculateHmrcDeduction", () => {
  // Car — below threshold
  it("car: 100 miles at 45p/mi = 4500p (£45)", () => {
    expect(calculateHmrcDeduction("car", 100)).toBe(4500);
  });

  it("car: 1000 miles at 45p/mi = 45000p", () => {
    expect(calculateHmrcDeduction("car", 1000)).toBe(45000);
  });

  it("car: exactly 10,000 miles = 450000p (all at 45p)", () => {
    expect(calculateHmrcDeduction("car", 10_000)).toBe(450_000);
  });

  it("car: 10,001 miles — 1 mile over threshold at 25p", () => {
    // 10000 * 45 + 1 * 25 = 450000 + 25 = 450025
    expect(calculateHmrcDeduction("car", 10_001)).toBe(450_025);
  });

  it("car: 12,000 miles — 2,000 miles above threshold at 25p", () => {
    // 10000 * 45 + 2000 * 25 = 450000 + 50000 = 500000
    expect(calculateHmrcDeduction("car", 12_000)).toBe(500_000);
  });

  it("car: 0 miles = 0p", () => {
    expect(calculateHmrcDeduction("car", 0)).toBe(0);
  });

  // Van — same rates as car
  it("van: 5000 miles = 225000p", () => {
    expect(calculateHmrcDeduction("van", 5_000)).toBe(225_000);
  });

  it("van: 10,000 miles boundary = 450000p", () => {
    expect(calculateHmrcDeduction("van", 10_000)).toBe(450_000);
  });

  it("van: 15,000 miles — 5000 above threshold", () => {
    // 450000 + 5000 * 25 = 450000 + 125000 = 575000
    expect(calculateHmrcDeduction("van", 15_000)).toBe(575_000);
  });

  // Motorbike — flat 24p/mi
  it("motorbike: 100 miles at 24p/mi = 2400p", () => {
    expect(calculateHmrcDeduction("motorbike", 100)).toBe(2400);
  });

  it("motorbike: 10,000 miles — flat rate, no threshold change", () => {
    expect(calculateHmrcDeduction("motorbike", 10_000)).toBe(240_000);
  });

  it("motorbike: 15,000 miles — flat rate continues above 10k", () => {
    expect(calculateHmrcDeduction("motorbike", 15_000)).toBe(360_000);
  });

  it("motorbike: 0 miles = 0p", () => {
    expect(calculateHmrcDeduction("motorbike", 0)).toBe(0);
  });

  // Fractional miles
  it("car: 100.5 miles rounds correctly", () => {
    // 100.5 * 45 = 4522.5 → rounds to 4523
    expect(calculateHmrcDeduction("car", 100.5)).toBe(4523);
  });

  it("car: 10000.5 miles straddles threshold with fractional remainder", () => {
    // 10000 * 45 + 0.5 * 25 = 450000 + 12.5 → rounds to 450013
    expect(calculateHmrcDeduction("car", 10_000.5)).toBe(450_013);
  });
});

// ---------------------------------------------------------------------------
// formatPence
// ---------------------------------------------------------------------------

describe("formatPence", () => {
  it("formats 0p as £0.00", () => {
    expect(formatPence(0)).toBe("£0.00");
  });

  it("formats 100p as £1.00", () => {
    expect(formatPence(100)).toBe("£1.00");
  });

  it("formats 12345p as £123.45", () => {
    expect(formatPence(12345)).toBe("£123.45");
  });

  it("formats 499p as £4.99", () => {
    expect(formatPence(499)).toBe("£4.99");
  });

  it("formats 450000p as £4500.00 (HMRC car deduction, 10k miles)", () => {
    expect(formatPence(450_000)).toBe("£4500.00");
  });

  it("formats 1p as £0.01", () => {
    expect(formatPence(1)).toBe("£0.01");
  });

  it("formats 10p as £0.10", () => {
    expect(formatPence(10)).toBe("£0.10");
  });

  it("formats large value — 1000000p as £10000.00", () => {
    expect(formatPence(1_000_000)).toBe("£10000.00");
  });

  it("uses pound sign £ (U+00A3), not # or $", () => {
    const result = formatPence(100);
    expect(result.charCodeAt(0)).toBe(0xa3);
  });
});

// ---------------------------------------------------------------------------
// formatMiles
// ---------------------------------------------------------------------------

describe("formatMiles", () => {
  it("formats 0 as '0 mi'", () => {
    expect(formatMiles(0)).toBe("0 mi");
  });

  it("formats 1 as '1 mi'", () => {
    expect(formatMiles(1)).toBe("1 mi");
  });

  it("formats 100 as '100 mi'", () => {
    expect(formatMiles(100)).toBe("100 mi");
  });

  it("formats 1000 with thousand separator as '1,000 mi'", () => {
    expect(formatMiles(1000)).toBe("1,000 mi");
  });

  it("formats 1234.5 with decimal as '1,234.5 mi'", () => {
    expect(formatMiles(1234.5)).toBe("1,234.5 mi");
  });

  it("truncates trailing decimal — 1234.0 formats as '1,234 mi'", () => {
    // maximumFractionDigits: 1 drops trailing zero
    expect(formatMiles(1234.0)).toBe("1,234 mi");
  });

  it("formats 10000 as '10,000 mi'", () => {
    expect(formatMiles(10_000)).toBe("10,000 mi");
  });

  it("includes 'mi' suffix", () => {
    expect(formatMiles(50)).toMatch(/mi$/);
  });
});

// ---------------------------------------------------------------------------
// getTaxYear
// ---------------------------------------------------------------------------

describe("getTaxYear", () => {
  // Well inside tax year
  it("returns '2024-25' for a date in October 2024", () => {
    expect(getTaxYear(new Date(2024, 9, 15))).toBe("2024-25");
  });

  it("returns '2025-26' for a date in December 2025", () => {
    expect(getTaxYear(new Date(2025, 11, 1))).toBe("2025-26");
  });

  it("returns '2025-26' for a date in January 2026 (before 6 Apr 2026)", () => {
    expect(getTaxYear(new Date(2026, 0, 1))).toBe("2025-26");
  });

  // 5 April — still the previous tax year
  it("returns '2024-25' for 5 April 2025 (last day of tax year)", () => {
    expect(getTaxYear(new Date(2025, 3, 5))).toBe("2024-25");
  });

  // 6 April — new tax year starts
  it("returns '2025-26' for 6 April 2025 (first day of new tax year)", () => {
    expect(getTaxYear(new Date(2025, 3, 6))).toBe("2025-26");
  });

  // Boundary: 31 March — still old year
  it("returns '2024-25' for 31 March 2025", () => {
    expect(getTaxYear(new Date(2025, 2, 31))).toBe("2024-25");
  });

  // Boundary: 1 April — still old year (< 6 April)
  it("returns '2024-25' for 1 April 2025", () => {
    expect(getTaxYear(new Date(2025, 3, 1))).toBe("2024-25");
  });

  // Boundary: 7 April — well into new year
  it("returns '2025-26' for 7 April 2025", () => {
    expect(getTaxYear(new Date(2025, 3, 7))).toBe("2025-26");
  });

  // Year-end decade wrap: 2029-30
  it("returns '2029-30' for July 2029", () => {
    expect(getTaxYear(new Date(2029, 6, 1))).toBe("2029-30");
  });

  // Cross-century would be '2099-00' but practically irrelevant — test string format instead
  it("format is always YYYY-YY (4-digit dash 2-digit)", () => {
    const result = getTaxYear(new Date(2025, 5, 1));
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// parseTaxYear
// ---------------------------------------------------------------------------

describe("parseTaxYear", () => {
  it("parses '2024-25' into correct start and end dates", () => {
    const { start, end } = parseTaxYear("2024-25");
    expect(start.getFullYear()).toBe(2024);
    expect(start.getMonth()).toBe(3); // April (0-indexed)
    expect(start.getDate()).toBe(6);

    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(3);
    expect(end.getDate()).toBe(5);
  });

  it("parses '2025-26' correctly", () => {
    const { start, end } = parseTaxYear("2025-26");
    expect(start.getFullYear()).toBe(2025);
    expect(end.getFullYear()).toBe(2026);
  });

  it("throws for an invalid format string", () => {
    expect(() => parseTaxYear("2025/26")).toThrow("Invalid tax year format");
  });

  it("throws when suffix does not match year", () => {
    // 2024-26 is invalid: suffix should be 25
    expect(() => parseTaxYear("2024-26")).toThrow("Invalid tax year format");
  });

  it("round-trips with getTaxYear — parse(getTaxYear(date)) boundaries contain date", () => {
    const date = new Date(2025, 7, 14); // 14 August 2025
    const taxYear = getTaxYear(date);
    const { start, end } = parseTaxYear(taxYear);
    expect(date.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(date.getTime()).toBeLessThanOrEqual(end.getTime());
  });
});
