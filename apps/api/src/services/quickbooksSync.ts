// QuickBooks Online sync — Purchase-based (12 Jul 2026).
//
// Replaces the old VehicleMileage approach, which is broken in UK QBO
// (the Vehicle/VehicleMileage entities are US/Canada-only). Instead we
// push a tax year's deductible motoring costs as QBO `Purchase` (cash
// expense) transactions into user-mapped accounts:
//
//   - MILEAGE: the AMAP simplified-expenses claim, aggregated to one
//     Purchase per (vehicle type, calendar month). The 10,000-mile tier
//     boundary is honoured by walking each vehicle type's trips in date
//     order and posting the MARGINAL deduction, so a month that straddles
//     the boundary is split at the right rate. Completed months are
//     stable across re-syncs; the current month self-corrects next push.
//
//   - EXPENSES: one Purchase per logged expense — but ONLY the categories
//     that are deductible ALONGSIDE the mileage allowance
//     (`deductibleWithMileage`). Pushing fuel/running costs next to an
//     AMAP claim would double-count, so those are excluded.
//
// Every Purchase is: PaymentType "Cash", top-level AccountRef = the
// user's mapped Bank/Cash account (source of funds), a single
// AccountBasedExpenseLineDetail line against the mapped expense account.
//
// WRITE-ONLY, create-only, idempotent. Idempotency reuses
// quickbooks_synced_expenses keyed by (userId, expenseId); mileage months
// use a synthetic key `mileage:{taxYear}:{YYYY-MM}:{vehicleType}`.

import { prisma } from "../lib/prisma.js";
import type { QuickBooksConnection } from "@prisma/client";
import { qboApi } from "./quickbooks.js";
import { logEvent } from "./appEvents.js";
import {
  calculateMileageDeduction,
  resolveMileageRates,
  parseTaxYear,
  EXPENSE_CATEGORIES,
} from "@mileclear/shared";

// ── QBO shapes (the subset we touch) ────────────────────────────────

interface QboAccountRaw {
  Id: string;
  Name: string;
  AccountType: string;
  AccountSubType?: string;
}
interface QboQueryResponse {
  QueryResponse: { Account?: QboAccountRaw[] };
}
interface QboPurchaseLine {
  Amount: number;
  DetailType: "AccountBasedExpenseLineDetail";
  Description?: string;
  AccountBasedExpenseLineDetail: { AccountRef: { value: string } };
}
interface QboPurchasePayload {
  PaymentType: "Cash";
  AccountRef: { value: string };
  TxnDate: string;
  PrivateNote: string;
  Line: QboPurchaseLine[];
}
interface QboPurchaseResponse {
  Purchase: { Id: string };
}

// ── Public types ────────────────────────────────────────────────────

export interface QboAccount {
  id: string;
  name: string;
  type: string;
  subType?: string;
}

export interface QboAccountLists {
  expenseAccounts: QboAccount[];
  payFromAccounts: QboAccount[];
}

export interface QboSyncResult {
  pushed: number;
  skipped: number;
  failed: number;
  mileagePurchases: number;
  expensePurchases: number;
  totalPushedPence: number;
  failures: Array<{ item: string; reason: string }>;
  lastSyncedAt: string;
}

export interface QboSyncPreview {
  mileageMonths: number;
  eligibleExpenses: number;
  alreadySynced: number;
  estimatedTotalPence: number;
  accountsMapped: boolean;
}

// ── Account discovery + mapping ─────────────────────────────────────

function mapAccount(a: QboAccountRaw): QboAccount {
  return { id: a.Id, name: a.Name, type: a.AccountType, subType: a.AccountSubType };
}

/** All active QBO accounts, split into candidates for the expense line
 *  (P&L expense accounts) and the pay-from account (Bank/Cash). */
export async function listQboAccounts(
  connection: QuickBooksConnection
): Promise<QboAccountLists> {
  const sql =
    "SELECT Id, Name, AccountType, AccountSubType FROM Account WHERE Active = true MAXRESULTS 1000";
  const res = await qboApi<QboQueryResponse>(
    connection,
    "GET",
    `/query?query=${encodeURIComponent(sql)}`
  );
  const accounts = res.QueryResponse.Account ?? [];
  const expenseAccounts = accounts
    .filter((a) => a.AccountType === "Expense" || a.AccountType === "Other Expense")
    .map(mapAccount);
  const payFromAccounts = accounts
    .filter((a) => a.AccountType === "Bank" || a.AccountType === "Other Current Asset")
    .map(mapAccount);
  return { expenseAccounts, payFromAccounts };
}

/** Persist the user's chosen expense + pay-from accounts. */
export async function setAccountMapping(args: {
  userId: string;
  expenseAccountId: string;
  payFromAccountId: string;
}): Promise<void> {
  await prisma.quickBooksConnection.update({
    where: { userId: args.userId },
    data: {
      expenseAccountId: args.expenseAccountId,
      payFromAccountId: args.payFromAccountId,
    },
  });
}

/** The two account IDs a Purchase needs, using the stored mapping or
 *  auto-picking sensible defaults (persisted so it's stable + editable).
 *  Throws a clear error if the QBO company has no usable accounts. */
async function resolveAccounts(
  connection: QuickBooksConnection
): Promise<{ expenseAccountId: string; payFromAccountId: string }> {
  if (connection.expenseAccountId && connection.payFromAccountId) {
    return {
      expenseAccountId: connection.expenseAccountId,
      payFromAccountId: connection.payFromAccountId,
    };
  }
  const { expenseAccounts, payFromAccounts } = await listQboAccounts(connection);
  if (expenseAccounts.length === 0) {
    throw new Error("Your QuickBooks company has no expense accounts to post to.");
  }
  if (payFromAccounts.length === 0) {
    throw new Error("Your QuickBooks company has no bank or cash account to pay from.");
  }
  const preferExpense =
    expenseAccounts.find((a) => /motor|vehicle|travel|mileage|fuel/i.test(a.name)) ??
    expenseAccounts[0];
  const preferPayFrom =
    payFromAccounts.find((a) => /cash/i.test(a.name)) ?? payFromAccounts[0];

  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: {
      expenseAccountId: preferExpense.id,
      payFromAccountId: preferPayFrom.id,
    },
  });
  return { expenseAccountId: preferExpense.id, payFromAccountId: preferPayFrom.id };
}

// ── Item building ───────────────────────────────────────────────────

interface SyncItem {
  /** Idempotency key stored as quickbooks_synced_expenses.expenseId. */
  key: string;
  amountPence: number;
  txnDate: string; // YYYY-MM-DD
  privateNote: string;
  description: string;
  kind: "mileage" | "expense";
}

function buildPurchase(
  item: SyncItem,
  accounts: { expenseAccountId: string; payFromAccountId: string }
): QboPurchasePayload {
  return {
    PaymentType: "Cash",
    AccountRef: { value: accounts.payFromAccountId },
    TxnDate: item.txnDate,
    PrivateNote: item.privateNote.slice(0, 4000),
    Line: [
      {
        Amount: Number((item.amountPence / 100).toFixed(2)),
        DetailType: "AccountBasedExpenseLineDetail",
        Description: item.description.slice(0, 1000),
        AccountBasedExpenseLineDetail: { AccountRef: { value: accounts.expenseAccountId } },
      },
    ],
  };
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
async function buildMileageItems(userId: string, taxYear: string): Promise<SyncItem[]> {
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
      kind: "mileage" as const,
    }));
}

/** Logged expenses in the tax year that are deductible ALONGSIDE the
 *  mileage allowance (excludes fuel/running costs, which AMAP replaces). */
async function buildExpenseItems(userId: string, taxYear: string): Promise<SyncItem[]> {
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
      kind: "expense" as const,
    };
  });
}

// ── Push + preview ──────────────────────────────────────────────────

async function loadActiveConnection(userId: string): Promise<QuickBooksConnection> {
  const connection = await prisma.quickBooksConnection.findUnique({ where: { userId } });
  if (!connection || connection.status !== "active") {
    throw new Error("QuickBooks is not connected.");
  }
  return connection;
}

/** Push a tax year's mileage claim + alongside-allowable expenses to QBO
 *  as Purchases. Create-only + idempotent; partial-failure tolerant. */
export async function pushTaxYear(args: {
  userId: string;
  taxYear: string;
}): Promise<QboSyncResult> {
  const { userId, taxYear } = args;
  const connection = await loadActiveConnection(userId);
  const accounts = await resolveAccounts(connection);

  const items = [
    ...(await buildMileageItems(userId, taxYear)),
    ...(await buildExpenseItems(userId, taxYear)),
  ];

  const keys = items.map((i) => i.key);
  const already = await prisma.quickBooksSyncedExpense.findMany({
    where: { userId, expenseId: { in: keys } },
    select: { expenseId: true },
  });
  const syncedKeys = new Set(already.map((a) => a.expenseId));

  let pushed = 0;
  let skipped = 0;
  let failed = 0;
  let mileagePurchases = 0;
  let expensePurchases = 0;
  let totalPushedPence = 0;
  const failures: QboSyncResult["failures"] = [];

  for (const item of items) {
    if (syncedKeys.has(item.key)) {
      skipped += 1;
      continue;
    }
    try {
      const res = await qboApi<QboPurchaseResponse>(
        connection,
        "POST",
        "/purchase",
        buildPurchase(item, accounts)
      );
      await prisma.quickBooksSyncedExpense.create({
        data: {
          connectionId: connection.id,
          userId,
          expenseId: item.key,
          qboEntityId: res.Purchase.Id,
          qboEntityType: "Purchase",
        },
      });
      pushed += 1;
      totalPushedPence += item.amountPence;
      if (item.kind === "mileage") mileagePurchases += 1;
      else expensePurchases += 1;
    } catch (err) {
      failed += 1;
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ item: item.description, reason: reason.slice(0, 400) });
    }
  }

  const lastSyncedAt = new Date();
  await prisma.quickBooksConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt },
  });
  logEvent("quickbooks.sync", userId, {
    taxYear,
    pushed,
    skipped,
    failed,
    mileagePurchases,
    expensePurchases,
    totalPushedPence,
  });

  return {
    pushed,
    skipped,
    failed,
    mileagePurchases,
    expensePurchases,
    totalPushedPence,
    failures,
    lastSyncedAt: lastSyncedAt.toISOString(),
  };
}

/** Counts for the UI before the user triggers a sync. No QBO write. */
export async function previewTaxYear(args: {
  userId: string;
  taxYear: string;
}): Promise<QboSyncPreview> {
  const { userId, taxYear } = args;
  const connection = await loadActiveConnection(userId);
  const items = [
    ...(await buildMileageItems(userId, taxYear)),
    ...(await buildExpenseItems(userId, taxYear)),
  ];
  const keys = items.map((i) => i.key);
  const alreadySynced = await prisma.quickBooksSyncedExpense.count({
    where: { userId, expenseId: { in: keys } },
  });
  return {
    mileageMonths: items.filter((i) => i.kind === "mileage").length,
    eligibleExpenses: items.filter((i) => i.kind === "expense").length,
    alreadySynced,
    estimatedTotalPence: items.reduce((a, i) => a + i.amountPence, 0),
    accountsMapped: Boolean(connection.expenseAccountId && connection.payFromAccountId),
  };
}
