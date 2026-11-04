/**
 * CSV and Trip Report at the driver's own rate (driver feedback, 3 Nov 2026:
 * paid a flat rate on their contract, wanted downloads at that rate rather
 * than HMRC's). Synthetic data only.
 *
 * What must hold:
 *  - without employerRates every row is priced exactly as before (HMRC);
 *  - with them, untagged business trips take the employer rate, with their
 *    own 10,000-mile band; gig-tagged trips stay at HMRC's rates, the same
 *    rule as Home's "to claim" figure;
 *  - personal trips and vehicles someone else pays for still claim nothing;
 *  - the CSV names its money columns for what they hold.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: { findMany: vi.fn() },
    vehicle: { findFirst: vi.fn() },
    earning: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/odometer.js", () => ({
  odometerForExportTrips: vi.fn(async () => new Map()),
}));
vi.mock("../../services/postcodeLookup.js", () => ({
  postcodesFor: vi.fn(async (pts: unknown[]) => pts.map(() => null)),
}));

import { prisma } from "../../lib/prisma.js";
import { fetchExportTrips } from "../../services/export-data.js";
import { generateTripsCsv, generateTripsPdf, tripsToCsv } from "../../services/export.js";
import { employerRateLabel, resolveMileageRates } from "@mileclear/shared";

const USER = "00000000-0000-0000-0000-0000000000e1";
const VAN = { id: "v1", make: "Vauxhall", model: "Vivaro", vehicleType: "van", isPrimary: true };

function trip(id: string, day: string, miles: number, classification: string, platformTag: string | null = null, provided = false) {
  return {
    id,
    vehicleId: VAN.id,
    vehicle: { make: VAN.make, model: VAN.model, vehicleType: VAN.vehicleType, providedByOthers: provided },
    startedAt: new Date(`${day}T09:00:00Z`),
    endedAt: new Date(`${day}T10:00:00Z`),
    distanceMiles: miles,
    classification,
    startAddress: "A",
    endAddress: "B",
    startLat: 51.5, startLng: -0.1, endLat: 51.6, endLng: -0.2,
    platformTag,
    businessPurpose: null,
    projectLabel: null,
  };
}

const FLAT_45 = resolveMileageRates({ workType: "employee", employerMileageRatePence: 45, employerMileageRatePenceAfter10k: null });
const TIERED = resolveMileageRates({ workType: "both", employerMileageRatePence: 40, employerMileageRatePenceAfter10k: 20 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.earning.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(VAN as never);
});

describe("fetchExportTrips with an employer rate", () => {
  it("prices every row at HMRC's rates when no employer rate is passed", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([trip("t1", "2026-05-01", 100, "business")] as never);
    const [row] = await fetchExportTrips({ userId: USER, taxYear: "2026-27" });
    expect(row.hmrcRatePence).toBe(55);
    expect(row.deductionPence).toBe(5500);
    expect(row.atEmployerRate).toBeUndefined();
  });

  it("prices untagged business trips at a flat 45p, past 10,000 miles too", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip("t1", "2026-05-01", 9990, "business"),
      trip("t2", "2026-06-01", 100, "business"),
    ] as never);
    const rows = await fetchExportTrips({ userId: USER, taxYear: "2026-27", employerRates: FLAT_45 });
    expect(rows.map((r) => r.hmrcRatePence)).toEqual([45, 45]);
    expect(rows.map((r) => r.deductionPence)).toEqual([449550, 4500]);
    expect(rows.every((r) => r.atEmployerRate)).toBe(true);
  });

  it("uses the employer's after-10k rate across the threshold", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip("t1", "2026-05-01", 9900, "business"),
      trip("t2", "2026-06-01", 200, "business"),
      trip("t3", "2026-07-01", 10, "business"),
    ] as never);
    const rows = await fetchExportTrips({ userId: USER, taxYear: "2026-27", employerRates: TIERED });
    expect(rows[0].deductionPence).toBe(396000);
    expect(rows[1].deductionPence).toBe(100 * 40 + 100 * 20);
    expect(rows[2].hmrcRatePence).toBe(20);
  });

  it("keeps gig-tagged trips at HMRC's rates, in their own 10,000-mile band", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip("t1", "2026-05-01", 10500, "business"),
      trip("t2", "2026-06-01", 100, "business", "uber"),
    ] as never);
    const rows = await fetchExportTrips({ userId: USER, taxYear: "2026-27", employerRates: FLAT_45 });
    expect(rows[0].atEmployerRate).toBe(true);
    // The employer miles do not use up the self-employed 10,000.
    expect(rows[1].hmrcRatePence).toBe(55);
    expect(rows[1].atEmployerRate).toBeUndefined();
  });

  it("still claims nothing for personal trips or a vehicle someone else pays for", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip("t1", "2026-05-01", 20, "personal"),
      trip("t2", "2026-05-02", 30, "business", null, true),
    ] as never);
    const rows = await fetchExportTrips({ userId: USER, taxYear: "2026-27", employerRates: FLAT_45 });
    expect(rows.map((r) => r.deductionPence)).toEqual([0, 0]);
    expect(rows.some((r) => r.atEmployerRate)).toBe(false);
  });
});

describe("CSV and Trip Report at the driver's rate", () => {
  it("names the CSV money columns for what they hold", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      trip("t1", "2026-05-01", 10, "business"),
      trip("t2", "2026-05-02", 10, "business", "uber"),
    ] as never);
    const csv = await generateTripsCsv(USER, { taxYear: "2026-27", employerRates: FLAT_45 });
    const [header, r1, r2] = csv.trim().split("\r\n");
    expect(header.endsWith("Vehicle,Rate used,Rate (p/mi),Amount")).toBe(true);
    expect(r1.endsWith("Your rate,45,£4.50")).toBe(true);
    expect(r2.endsWith("HMRC,55,£5.50")).toBe(true);
  });

  it("leaves the HMRC CSV header as it was", () => {
    const header = tripsToCsv([]).split("\r\n")[0];
    expect(header.endsWith("Vehicle,HMRC Rate (p/mi),Deduction")).toBe(true);
  });

  it("builds the Trip Report at the driver's rate", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([trip("t1", "2026-05-01", 10, "business", "uber"), trip("t2", "2026-05-02", 10, "business")] as never);
    const pdf = await generateTripsPdf(USER, { taxYear: "2026-27", employerRates: FLAT_45, employerRateText: "45p a mile" });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("employerRateLabel", () => {
  it("describes flat and tiered rates, and none for self-employed drivers", () => {
    expect(employerRateLabel({ workType: "employee", employerMileageRatePence: 45, employerMileageRatePenceAfter10k: null })).toBe("45p a mile");
    expect(employerRateLabel({ workType: "both", employerMileageRatePence: 45, employerMileageRatePenceAfter10k: 45 })).toBe("45p a mile");
    expect(employerRateLabel({ workType: "both", employerMileageRatePence: 40, employerMileageRatePenceAfter10k: 20 })).toBe("40p a mile for the first 10,000, then 20p");
    expect(employerRateLabel({ workType: "gig", employerMileageRatePence: 45, employerMileageRatePenceAfter10k: null })).toBeNull();
  });
});
