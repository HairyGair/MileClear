import { describe, it, expect } from "vitest";
import {
  CERTIFICATE_PURPOSES,
  CERTIFICATE_STATEMENT,
  checkCertificatePeriod,
  computeCertificateFigures,
  formatCertificateCode,
  maskRegistration,
  monthsBetween,
  normaliseCertificateCode,
  parseCertificateDate,
  toPublicCertificate,
  type MileageCertificateSnapshot,
} from "./mileageCertificate";

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe("computeCertificateFigures", () => {
  it("splits miles by classification and by how they were recorded", () => {
    const f = computeCertificateFigures(
      [
        { startedAt: at(2026, 4, 10), distanceMiles: 10, classification: "business", isManualEntry: false },
        { startedAt: at(2026, 4, 12), distanceMiles: 5.25, classification: "personal", isManualEntry: false },
        { startedAt: at(2026, 6, 1), distanceMiles: 20, classification: "unclassified", isManualEntry: true },
        { startedAt: at(2026, 6, 2), distanceMiles: 4.75, classification: "business", isManualEntry: false },
      ],
      "2026-04-06",
      "2026-06-30"
    );
    expect(f.totalMiles).toBe(40);
    expect(f.businessMiles).toBe(14.8);
    expect(f.personalMiles).toBe(5.3);
    expect(f.unclassifiedMiles).toBe(20);
    expect(f.trips).toBe(4);
    expect(f.gpsTrips).toBe(3);
    expect(f.manualTrips).toBe(1);
    expect(f.gpsMilesPercent).toBe(50);
    expect(f.firstTripAt).toBe(at(2026, 4, 10).toISOString());
    expect(f.lastTripAt).toBe(at(2026, 6, 2).toISOString());
    // May has no trips but still shows, as zero.
    expect(f.months).toEqual([
      { month: "2026-04", miles: 15.3, trips: 2 },
      { month: "2026-05", miles: 0, trips: 0 },
      { month: "2026-06", miles: 24.8, trips: 2 },
    ]);
  });

  it("is all zeros with no trips", () => {
    const f = computeCertificateFigures([], "2026-01-01", "2026-01-31");
    expect(f.totalMiles).toBe(0);
    expect(f.gpsMilesPercent).toBe(0);
    expect(f.firstTripAt).toBeNull();
    expect(f.months).toEqual([{ month: "2026-01", miles: 0, trips: 0 }]);
  });
});

describe("monthsBetween", () => {
  it("crosses a year end", () => {
    expect(monthsBetween("2025-11-15", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("codes", () => {
  it("normalises spacing, case and look-alike digits", () => {
    expect(normaliseCertificateCode("abcd-efgh-ijkl-mnop-qrst")).toBe("ABCDEFGHIJKLMNOPQRST");
    expect(normaliseCertificateCode("0BCD EFGH 1JKL MN0P QRS8")).toBe("OBCDEFGHIJKLMNOPQRSB");
  });
  it("rejects wrong lengths and characters", () => {
    expect(normaliseCertificateCode("ABC")).toBeNull();
    expect(normaliseCertificateCode("ABCDEFGHIJKLMNOPQRS9")).toBeNull();
    expect(normaliseCertificateCode("")).toBeNull();
  });
  it("groups in fours", () => {
    expect(formatCertificateCode("ABCDEFGHIJKLMNOPQRST")).toBe("ABCD-EFGH-IJKL-MNOP-QRST");
  });
});

describe("maskRegistration", () => {
  it("keeps the first part of the plate only", () => {
    expect(maskRegistration("AB12 CDE")).toBe("AB12 ***");
    expect(maskRegistration("ab12cde")).toBe("AB12 ***");
    expect(maskRegistration("K1")).toBe("K ***");
    expect(maskRegistration(null)).toBeNull();
  });
});

describe("checkCertificatePeriod", () => {
  const now = new Date(2026, 9, 4, 15, 0, 0);
  it("brings an end date in the future back to today", () => {
    const r = checkCertificatePeriod("2026-04-06", "2027-04-05", now);
    expect(r.ok && r.periodEnd).toBe("2026-10-04");
    expect(r.ok && r.clamped).toBe(true);
  });
  it("refuses bad, reversed, future and over-long periods", () => {
    expect(checkCertificatePeriod("2026-02-30", "2026-03-01", now).ok).toBe(false);
    expect(checkCertificatePeriod("2026-05-01", "2026-04-01", now).ok).toBe(false);
    expect(checkCertificatePeriod("2026-11-01", "2026-12-01", now).ok).toBe(false);
    expect(checkCertificatePeriod("2020-01-01", "2026-01-01", now).ok).toBe(false);
  });
  it("parses only real dates", () => {
    expect(parseCertificateDate("2026-02-29")).toBeNull();
    expect(parseCertificateDate("2028-02-29")).not.toBeNull();
  });
});

describe("toPublicCertificate", () => {
  const snap: MileageCertificateSnapshot = {
    version: 1,
    code: "ABCDEFGHIJKLMNOPQRST",
    issuedAt: "2026-10-04T10:00:00.000Z",
    driverName: "Sam Driver",
    purpose: "insurer",
    periodStart: "2025-04-06",
    periodEnd: "2026-04-05",
    taxYear: "2025-26",
    singleVehicle: true,
    vehicles: [{ make: "Ford", model: "Focus", year: 2019, registration: "AB12 CDE" }],
    accountCreatedAt: "2025-01-01T00:00:00.000Z",
    ...computeCertificateFigures([], "2025-04-06", "2026-04-05"),
  };
  it("masks the plate on a valid certificate", () => {
    const p = toPublicCertificate(snap, null);
    expect(p.status).toBe("valid");
    if (p.status === "valid") expect(p.vehicles[0].registration).toBe("AB12 ***");
  });
  it("shows no figures once withdrawn", () => {
    const p = toPublicCertificate(snap, new Date("2026-10-05T00:00:00Z"));
    expect(p).toEqual({
      status: "revoked",
      code: snap.code,
      issuedAt: snap.issuedAt,
      revokedAt: "2026-10-05T00:00:00.000Z",
    });
  });
});

describe("wording", () => {
  it("never claims to be official or approved", () => {
    const text = [CERTIFICATE_STATEMENT, ...CERTIFICATE_PURPOSES.flatMap((p) => [p.label, p.printed])].join(" ");
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/HMRC|DVLA|approved|certified/i);
    expect(CERTIFICATE_STATEMENT).toContain("not an official document");
  });
});
