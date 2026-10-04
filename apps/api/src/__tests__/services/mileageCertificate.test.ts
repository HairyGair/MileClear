import { describe, it, expect } from "vitest";
import {
  CERTIFICATE_CODE_ALPHABET,
  computeCertificateFigures,
  normaliseCertificateCode,
  type MileageCertificateSnapshot,
} from "@mileclear/shared";
import {
  generateCertificateCode,
  generateCertificatePdf,
  taxYearForPeriod,
} from "../../services/mileageCertificate.js";

function snapshot(periodStart: string, periodEnd: string): MileageCertificateSnapshot {
  const trips = [
    { startedAt: new Date(2025, 4, 10, 12), distanceMiles: 12.4, classification: "business", isManualEntry: false },
    { startedAt: new Date(2025, 6, 2, 9), distanceMiles: 3.1, classification: "personal", isManualEntry: true },
  ];
  return {
    version: 1,
    code: generateCertificateCode(),
    issuedAt: new Date(2026, 9, 4).toISOString(),
    driverName: "Sam Driver",
    purpose: "insurer",
    periodStart,
    periodEnd,
    taxYear: taxYearForPeriod(periodStart, periodEnd),
    singleVehicle: true,
    vehicles: [{ make: "Ford", model: "Focus", year: 2019, registration: "AB12 CDE" }],
    accountCreatedAt: new Date(2025, 0, 1).toISOString(),
    ...computeCertificateFigures(trips, periodStart, periodEnd),
  };
}

const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("generateCertificateCode", () => {
  it("is 20 base32 characters that survive normalising", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const code = generateCertificateCode();
      expect(code).toHaveLength(20);
      for (const ch of code) expect(CERTIFICATE_CODE_ALPHABET).toContain(ch);
      expect(normaliseCertificateCode(code)).toBe(code);
      seen.add(code);
    }
    expect(seen.size).toBe(200);
  });
});

describe("taxYearForPeriod", () => {
  it("names a whole tax year and nothing else", () => {
    expect(taxYearForPeriod("2025-04-06", "2026-04-05")).toBe("2025-26");
    expect(taxYearForPeriod("2025-04-06", "2026-03-31")).toBeNull();
    expect(taxYearForPeriod("2025-01-01", "2025-12-31")).toBeNull();
  });
});

describe("generateCertificatePdf", () => {
  it("fits a tax year on one page", async () => {
    const pdf = await generateCertificatePdf(snapshot("2025-04-06", "2026-04-05"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
  });

  it("fits the longest period (3 years, 37 months) on one page", async () => {
    const pdf = await generateCertificatePdf(snapshot("2023-10-05", "2026-10-04"));
    expect(pageCount(pdf)).toBe(1);
  });
});
