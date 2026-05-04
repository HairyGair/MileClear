// Reconciliation cron — basic version
//
// Cross-checks aggregate totals against their source data. Catches drift
// before it ends up in an HMRC submission or a user-visible dashboard
// figure that disagrees with the underlying trips/earnings.
//
// What it checks (initial scope):
//   1. MileageSummary.businessMiles vs sum of business trips for that
//      user + tax year.
//   2. MileageSummary.deductionPence vs the recomputed AMAP figure
//      from the same trips.
//
// Discrepancies log as `reconciliation.drift` app_events with a structured
// payload so the admin can investigate. Cron does NOT fix drift on its own
// — auto-correcting cached figures is risky if the upsert logic itself is
// broken; we want a human to see WHY the drift exists first.
//
// Audit item #6 (external_audit_may_2.md). Required for MTD ITSA — a wrong
// quarterly figure submitted to HMRC carries fines. This is the safety net.

import { prisma } from "../lib/prisma.js";
import {
  calculateHmrcDeduction,
  parseTaxYear,
  type VehicleType,
} from "@mileclear/shared";
import { logEvent } from "../services/appEvents.js";

// Drift below this threshold is ignored. Below 5 pence and 0.05 mi we're
// in floating-point-rounding territory, not real disagreement.
const PENCE_TOLERANCE = 5;
const MILES_TOLERANCE = 0.05;

// Limit to current + previous tax year. Reconciling every historical year
// each run is wasteful and the relevance is only "is the figure HMRC will
// see correct?". Filed years can be skipped after the deadline passes.
function activeTaxYears(now: Date): string[] {
  const ty = (d: Date): string => {
    // 6 April boundary — same logic as @mileclear/shared getTaxYear
    const year = d.getUTCFullYear();
    const aprilSixth = new Date(Date.UTC(year, 3, 6));
    const startYear = d >= aprilSixth ? year : year - 1;
    return `${startYear}-${String(startYear + 1).slice(2)}`;
  };
  const current = ty(now);
  const [startStr] = current.split("-");
  const previousStartYear = parseInt(startStr, 10) - 1;
  const previous = `${previousStartYear}-${String(previousStartYear + 1).slice(2)}`;
  return [current, previous];
}

interface DriftRow {
  userId: string;
  taxYear: string;
  expectedMiles: number;
  storedMiles: number;
  expectedPence: number;
  storedPence: number;
  tripCount: number;
}

export async function runReconciliationJob(): Promise<void> {
  const startedAt = Date.now();
  const taxYears = activeTaxYears(new Date());

  // Pull every MileageSummary for the active tax years. These are the cached
  // aggregates the dashboard, exports, and (eventually) MTD ITSA submissions
  // read from. We compare each one to source.
  const summaries = await prisma.mileageSummary.findMany({
    where: { taxYear: { in: taxYears } },
    select: {
      id: true,
      userId: true,
      taxYear: true,
      businessMiles: true,
      deductionPence: true,
    },
  });

  if (summaries.length === 0) {
    console.log("[reconciliation] No mileage summaries to reconcile.");
    return;
  }

  // Group by user so we batch the trip queries. One query per user per year
  // pair is acceptable; we could narrow further with a per-user findMany but
  // that's only worth it once we're over a few thousand users.
  const drifts: DriftRow[] = [];

  for (const summary of summaries) {
    const { start, end } = parseTaxYear(summary.taxYear);
    const trips = await prisma.trip.findMany({
      where: {
        userId: summary.userId,
        classification: "business",
        startedAt: { gte: start, lte: end },
      },
      select: {
        distanceMiles: true,
        vehicle: { select: { vehicleType: true } },
      },
    });

    let expectedMiles = 0;
    const milesByType = new Map<VehicleType, number>();
    for (const t of trips) {
      expectedMiles += t.distanceMiles;
      const type = (t.vehicle?.vehicleType ?? "car") as VehicleType;
      milesByType.set(type, (milesByType.get(type) ?? 0) + t.distanceMiles);
    }

    let expectedPence = 0;
    for (const [type, miles] of milesByType) {
      expectedPence += calculateHmrcDeduction(type, miles);
    }

    const milesDrift = Math.abs(expectedMiles - summary.businessMiles);
    const penceDrift = Math.abs(expectedPence - summary.deductionPence);

    if (milesDrift > MILES_TOLERANCE || penceDrift > PENCE_TOLERANCE) {
      drifts.push({
        userId: summary.userId,
        taxYear: summary.taxYear,
        expectedMiles,
        storedMiles: summary.businessMiles,
        expectedPence,
        storedPence: summary.deductionPence,
        tripCount: trips.length,
      });
    }
  }

  // Log each drift as a structured app_event. Admin alerts dashboard surfaces
  // these by event type.
  for (const drift of drifts) {
    logEvent("reconciliation.drift", drift.userId, {
      taxYear: drift.taxYear,
      milesExpected: drift.expectedMiles,
      milesStored: drift.storedMiles,
      milesDrift: drift.expectedMiles - drift.storedMiles,
      pencesExpected: drift.expectedPence,
      pencesStored: drift.storedPence,
      pencesDrift: drift.expectedPence - drift.storedPence,
      tripCount: drift.tripCount,
    });
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[reconciliation] Checked ${summaries.length} summaries, found ${drifts.length} drift(s) in ${elapsedMs}ms.`
  );

  // Single rollup event so admin can see "this run completed" alongside the
  // individual drifts.
  logEvent("reconciliation.run_completed", null, {
    summariesChecked: summaries.length,
    driftCount: drifts.length,
    elapsedMs,
  });
}
