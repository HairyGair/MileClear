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
    },
    trip: {
      findMany: vi.fn(),
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

import { runReconciliationJob } from "../../jobs/reconciliation.js";
import { prisma } from "../../lib/prisma.js";

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

  it("returns early when no summaries exist", async () => {
    vi.mocked(prisma.mileageSummary.findMany).mockResolvedValue([]);

    await runReconciliationJob();
    await flushLogEvents();

    expect(prisma.trip.findMany).not.toHaveBeenCalled();
    expect(prisma.appEvent.create).not.toHaveBeenCalled();
  });
});
