/**
 * Reconciliation cron tests.
 *
 * Audit item #6: cross-check that the cached MileageSummary matches the
 * underlying trips. Catches drift before it becomes a wrong MTD ITSA
 * quarterly submission (which carries fines).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    mileageSummary: {
      findMany: vi.fn(),
      // Re-read after a refresh; null by default (tests that care set it).
      findUnique: vi.fn(async () => null),
    },
    trip: {
      findMany: vi.fn(),
    },
    // The job preloads each user's vehicle list once to pick the rate class
    // for trips with no vehicle. No vehicles means the car fallback.
    vehicle: {
      findMany: vi.fn(async () => []),
    },
    appEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    // logEvent now enriches events with the user's heartbeat appVersion +
    // buildNumber for per-build regression detection. It calls user.findUnique
    // before creating the event, so the user mock has to be present even
    // when the test doesn't care about per-event data.
    user: {
      findUnique: vi.fn().mockResolvedValue({ appVersion: null, buildNumber: null }),
    },
  },
}));

// The refresh itself is mileage.ts's job, tested there.
vi.mock("../../services/mileage.js", () => ({
  upsertMileageSummary: vi.fn(async () => {}),
}));

import { runReconciliationJob } from "../../jobs/reconciliation.js";
import { prisma } from "../../lib/prisma.js";
import { upsertMileageSummary } from "../../services/mileage.js";

const USER_A = "user-a";
const USER_B = "user-b";
const TAX_YEAR = "2025-26";

// logEvent now uses an async user.findUnique lookup before writing to
// appEvent. That lookup completes off the call stack, so tests must flush
// microtasks twice (one for the lookup promise, one for the appEvent.create
// chain) before asserting on the spy.
async function flushLogEvents(): Promise<void> {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe("runReconciliationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      appVersion: null,
      buildNumber: null,
    } as any);
  });

  it("logs no drift when cached summary matches trip totals exactly", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      {
        id: "sum-1",
        userId: USER_A,
        taxYear: TAX_YEAR,
        businessMiles: 100,
        deductionPence: 4500, // 100 mi × 45p = £45.00
      } as any,
    ]);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { distanceMiles: 60, vehicle: { vehicleType: "car" } },
      { distanceMiles: 40, vehicle: { vehicleType: "car" } },
    ] as any);

    await runReconciliationJob();
    await flushLogEvents();

    const driftEvents = vi
      .mocked(prisma.appEvent.create)
      .mock.calls.filter(
        (c) => (c[0] as any).data?.type === "reconciliation.drift"
      );
    expect(driftEvents).toHaveLength(0);

    // Always logs a run-completed rollup
    const runEvents = vi
      .mocked(prisma.appEvent.create)
      .mock.calls.filter(
        (c) => (c[0] as any).data?.type === "reconciliation.run_completed"
      );
    expect(runEvents).toHaveLength(1);
  });

  it("counts a van someone else pays for in miles but not the deduction", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      {
        id: "sum-1",
        userId: USER_A,
        taxYear: TAX_YEAR,
        businessMiles: 150,
        deductionPence: 4500, // only the 100 own-car miles × 45p
      } as any,
    ]);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { distanceMiles: 100, vehicle: { vehicleType: "car", providedByOthers: false } },
      { distanceMiles: 50, vehicle: { vehicleType: "van", providedByOthers: true } },
    ] as any);

    await runReconciliationJob();
    await flushLogEvents();

    const driftEvents = vi
      .mocked(prisma.appEvent.create)
      .mock.calls.filter(
        (c) => (c[0] as any).data?.type === "reconciliation.drift"
      );
    expect(driftEvents).toHaveLength(0);
  });

  it("logs drift when cached miles disagree with trip totals", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      {
        id: "sum-1",
        userId: USER_A,
        taxYear: TAX_YEAR,
        businessMiles: 50, // cached value too low
        deductionPence: 2250,
      } as any,
    ]);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { distanceMiles: 100, vehicle: { vehicleType: "car" } },
    ] as any);

    await runReconciliationJob();
    await flushLogEvents();

    const driftEvents = vi
      .mocked(prisma.appEvent.create)
      .mock.calls.filter(
        (c) => (c[0] as any).data?.type === "reconciliation.drift"
      );
    expect(driftEvents).toHaveLength(1);
    const meta = (driftEvents[0][0] as any).data.metadata;
    expect(meta.milesExpected).toBe(100);
    expect(meta.milesStored).toBe(50);
    expect(meta.milesDrift).toBe(50);
  });

  it("ignores drift below the rounding tolerance", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      {
        id: "sum-1",
        userId: USER_A,
        taxYear: TAX_YEAR,
        businessMiles: 100.01, // 0.01 mi drift — below tolerance (0.05)
        deductionPence: 4501, // 1 pence drift — below tolerance (5)
      } as any,
    ]);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { distanceMiles: 100, vehicle: { vehicleType: "car" } },
    ] as any);

    await runReconciliationJob();
    await flushLogEvents();

    const driftEvents = vi
      .mocked(prisma.appEvent.create)
      .mock.calls.filter(
        (c) => (c[0] as any).data?.type === "reconciliation.drift"
      );
    expect(driftEvents).toHaveLength(0);
  });

  it("checks each user's summary independently", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      {
        id: "sum-a",
        userId: USER_A,
        taxYear: TAX_YEAR,
        businessMiles: 100,
        deductionPence: 4500,
      } as any,
      {
        id: "sum-b",
        userId: USER_B,
        taxYear: TAX_YEAR,
        businessMiles: 999, // wrong
        deductionPence: 0,
      } as any,
    ]);
    // First call returns user-A trips, second returns user-B trips
    vi.mocked(prisma.trip.findMany)
      .mockResolvedValueOnce([
        { distanceMiles: 100, vehicle: { vehicleType: "car" } },
      ] as any)
      .mockResolvedValueOnce([
        { distanceMiles: 200, vehicle: { vehicleType: "car" } },
      ] as any);

    await runReconciliationJob();
    await flushLogEvents();

    const driftEvents = vi
      .mocked(prisma.appEvent.create)
      .mock.calls.filter(
        (c) => (c[0] as any).data?.type === "reconciliation.drift"
      );
    expect(driftEvents).toHaveLength(1);
    expect((driftEvents[0][0] as any).data.userId).toBe(USER_B);
  });

  it("refreshes a drifted summary and logs no mismatch when the refresh agrees", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      { id: "sum-1", userId: USER_A, taxYear: TAX_YEAR, businessMiles: 50, deductionPence: 2250 } as any,
    ]);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { distanceMiles: 100, vehicle: { vehicleType: "car" } },
    ] as any);
    vi.mocked(prisma.mileageSummary.findUnique).mockResolvedValue({
      businessMiles: 100,
      deductionPence: 4500,
    } as any);

    await runReconciliationJob();
    await flushLogEvents();

    expect(upsertMileageSummary).toHaveBeenCalledTimes(1);
    expect(upsertMileageSummary).toHaveBeenCalledWith(USER_A, TAX_YEAR);
    const types = vi.mocked(prisma.appEvent.create).mock.calls.map((c) => (c[0] as any).data?.type);
    expect(types).not.toContain("reconciliation.heal_mismatch");
    const run = vi
      .mocked(prisma.appEvent.create)
      .mock.calls.find((c) => (c[0] as any).data?.type === "reconciliation.run_completed");
    expect((run![0] as any).data.metadata).toMatchObject({ driftCount: 1, healed: 1, healMismatches: 0, healErrors: 0 });
  });

  it("does not refresh summaries that already match", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      { id: "sum-1", userId: USER_A, taxYear: TAX_YEAR, businessMiles: 100, deductionPence: 4500 } as any,
    ]);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { distanceMiles: 100, vehicle: { vehicleType: "car" } },
    ] as any);

    await runReconciliationJob();

    expect(upsertMileageSummary).not.toHaveBeenCalled();
  });

  it("logs heal_mismatch when the refreshed summary still disagrees with the trips", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      { id: "sum-1", userId: USER_A, taxYear: TAX_YEAR, businessMiles: 50, deductionPence: 2250 } as any,
    ]);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { distanceMiles: 100, vehicle: { vehicleType: "car" } },
    ] as any);
    // The upsert left it unchanged: its logic disagrees with this job.
    vi.mocked(prisma.mileageSummary.findUnique).mockResolvedValue({
      businessMiles: 50,
      deductionPence: 2250,
    } as any);

    await runReconciliationJob();
    await flushLogEvents();

    const mismatch = vi
      .mocked(prisma.appEvent.create)
      .mock.calls.filter((c) => (c[0] as any).data?.type === "reconciliation.heal_mismatch");
    expect(mismatch).toHaveLength(1);
    expect((mismatch[0][0] as any).data.metadata).toMatchObject({
      taxYear: TAX_YEAR,
      milesExpected: 100,
      milesAfter: 50,
    });
  });

  it("keeps going when one refresh throws", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([
      { id: "sum-a", userId: USER_A, taxYear: TAX_YEAR, businessMiles: 1, deductionPence: 45 } as any,
      { id: "sum-b", userId: USER_B, taxYear: TAX_YEAR, businessMiles: 1, deductionPence: 45 } as any,
    ]);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { distanceMiles: 100, vehicle: { vehicleType: "car" } },
    ] as any);
    vi.mocked(upsertMileageSummary).mockRejectedValueOnce(new Error("db down"));
    vi.mocked(prisma.mileageSummary.findUnique).mockResolvedValue({
      businessMiles: 100,
      deductionPence: 4500,
    } as any);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await runReconciliationJob();
    await flushLogEvents();
    errSpy.mockRestore();

    expect(upsertMileageSummary).toHaveBeenCalledTimes(2);
    const run = vi
      .mocked(prisma.appEvent.create)
      .mock.calls.find((c) => (c[0] as any).data?.type === "reconciliation.run_completed");
    expect((run![0] as any).data.metadata).toMatchObject({ healed: 1, healErrors: 1 });
  });

  it("returns early when no summaries exist", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([]);

    await runReconciliationJob();
    await flushLogEvents();

    expect(prisma.trip.findMany).not.toHaveBeenCalled();
    expect(prisma.appEvent.create).not.toHaveBeenCalled();
  });
});
