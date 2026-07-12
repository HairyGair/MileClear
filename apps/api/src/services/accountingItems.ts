// Shared accounting-sync item builder (12 Jul 2026).
//
// QuickBooks and Xero both push the same two streams for a tax year:
//
//   - MILEAGE: the AMAP simplified-expenses claim, aggregated to one
//     item per (vehicle type, calendar month). The 10,000-mile tier
//     boundary is honoured by walking each vehicle type's trips in date
//     order and accumulating the MARGINAL deduction, so a month that
//     straddles the boundary is split at the right rate. Completed
//     months are stable across re-syncs; the current month self-corrects
//     on the next push.
//
//   - EXPENSES: one item per logged expense — but ONLY the categories
//     that are deductible ALONGSIDE the mileage allowance
//     (`deductibleWithMileage`). Pushing fuel/running costs next to an
//     AMAP claim would double-count, so those are excluded.
//
// The providers differ only in how an item becomes a transaction
// (QBO `Purchase` vs Xero `BankTransaction`), which account refs look
// like, and where the idempotency rows live. Everything about WHAT to
// push lives here so the two ledgers can never drift apart.

import { prisma } from "../lib/prisma.js";
import {
  calculateMileageDeduction,
  resolveMileageRates,
  parseTaxYear,
  EXPENSE_CATEGORIES,
} from "@mileclear/shared";

export interface SyncItem {
  /** Stable idempotency key. Expenses use the Expense row ID; mileage
   *  months use `mileage:{taxYear}:{YYYY-MM}:{vehicleType}`. */
  key: string;
  amountPence: number;
  txnDate: string; // YYYY-MM-DD
  privateNote: string;
  description: string;
  /** Payee-ish label for ledgers that want a contact/vendor. */
  vendor: string | null;
  kind: "mileage" | "expense";
}

function ym(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Normalise a stored vehicleType to an AMAP rate class. */
function normVehicleType(v: string): "car" | "van" | "motorbike" {
  return v === "van" || v === "motorbike" ? v : "car";
}

/** Build the mileage-month sync items for a tax year, honouring the
 *  10k tier boundary per vehicle type via marginal deductions. */
export async function buildMileageItems(
  userId: string,
  taxYear: string
): Promise<SyncItem[]> {
  const { start, end } = parseTaxYear(taxYear);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      workType: true,
      employerMileageRatePence: true,
      employerMileageRatePenceAfter10k: true,
    },
  });
  const rateOpts = { ...(user ? resolveMileageRates(user) : {}), taxYear };

  const trips = await prisma.trip.findMany({
    where: {
      userId,
      classification: "business",
      isPhantomTrip: false,
      vehicleId: { not: null },
      startedAt: { gte: start, lte: end },
    },
    select: { startedAt: true, distanceMiles: true, vehicleId: true },
    orderBy: { startedAt: "asc" },
  });
  if (trips.length === 0) return [];

  const vehIds = [...new Set(trips.map((t) => t.vehicleId).filter((v): v is string => !!v))];
  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehIds } },
    select: { id: true, vehicleType: true },
  });
  const vehicleType = new Map(vehicles.map((v) => [v.id, v.vehicleType || "car"]));

  // Group by vehicle type, walk in date order, accumulate marginal
  // deduction into (type, month) buckets.
  const byType = new Map<"car" | "van" | "motorbike", typeof trips>();
  for (const t of trips) {
    const vt = normVehicleType((t.vehicleId && vehicleType.get(t.vehicleId)) || "car");
    const arr = byType.get(vt) ?? [];
    arr.push(t);
    byType.set(vt, arr);
  }

  interface Bucket {
    vt: string;
    month: string;
    miles: number;
    deductionPence: number;
    count: number;
    lastDate: Date;
  }
  const buckets = new Map<string, Bucket>();
  for (const [vt, arr] of byType) {
    let cumMiles = 0;
    for (const t of arr) {
      const before = calculateMileageDeduction(vt, cumMiles, rateOpts).deductionPence;
      const after = calculateMileageDeduction(vt, cumMiles + t.distanceMiles, rateOpts).deductionPence;
      cumMiles += t.distanceMiles;
      const month = ym(t.startedAt);
      const key = `${vt}:${month}`;
      const b = buckets.get(key) ?? { vt, month, miles: 0, deductionPence: 0, count: 0, lastDate: t.startedAt };
      b.miles += t.distanceMiles;
      b.deductionPence += Math.max(0, after - before);
      b.count += 1;
      b.lastDate = t.startedAt;
      buckets.set(key, b);
    }
  }

  return [...buckets.values()]
    .filter((b) => b.deductionPence > 0)
    .map((b) => ({
      key: `mileage:${taxYear}:${b.month}:${b.vt}`,
      amountPence: b.deductionPence,
      // Post-date to the last day of that month's activity so it lands
      // in the right period even if synced later.
      txnDate: b.lastDate.toISOString().slice(0, 10),
      privateNote: `MileClear mileage allowance (AMAP) — ${b.miles.toFixed(1)} business miles by ${b.vt} in ${b.month}, ${b.count} trip(s). Tax year ${taxYear}.`,
      description: `Business mileage — ${b.miles.toFixed(1)} mi (${b.month})`,
      vendor: null,
      kind: "mileage" as const,
    }));
}

/** Logged expenses in the tax year that are deductible ALONGSIDE the
 *  mileage allowance (excludes fuel/running costs, which AMAP replaces). */
export async function buildExpenseItems(
  userId: string,
  taxYear: string
): Promise<SyncItem[]> {
  const { start, end } = parseTaxYear(taxYear);
  const allowedCategories = new Set<string>(
    EXPENSE_CATEGORIES.filter((c) => c.deductibleWithMileage).map((c) => c.value)
  );
  const labelFor = new Map<string, string>(
    EXPENSE_CATEGORIES.map((c) => [c.value, c.label])
  );

  const expenses = await prisma.expense.findMany({
    where: {
      userId,
      date: { gte: start, lte: end },
      category: { in: [...allowedCategories] },
    },
    select: { id: true, category: true, amountPence: true, date: true, vendor: true, description: true },
    orderBy: { date: "asc" },
  });

  return expenses.map((e) => {
    const label = labelFor.get(e.category) ?? e.category;
    const detail = [e.vendor, e.description].filter(Boolean).join(" — ");
    return {
      key: e.id,
      amountPence: e.amountPence,
      txnDate: e.date.toISOString().slice(0, 10),
      privateNote: `MileClear expense — ${label}${detail ? `: ${detail}` : ""}. Tax year ${taxYear}.`,
      description: detail ? `${label}: ${detail}` : label,
      vendor: e.vendor ?? null,
      kind: "expense" as const,
    };
  });
}

/** Both streams for a tax year, mileage first. */
export async function buildSyncItems(
  userId: string,
  taxYear: string
): Promise<SyncItem[]> {
  return [
    ...(await buildMileageItems(userId, taxYear)),
    ...(await buildExpenseItems(userId, taxYear)),
  ];
}
