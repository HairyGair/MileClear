// Xero sync — SPEND bank transactions (12 Jul 2026).
//
// Pushes a tax year's deductible motoring costs — built by the shared
// accountingItems module (AMAP mileage months + alongside-allowable
// expenses) — as Xero `BankTransaction` records of Type SPEND:
//
//   BankAccount = the user's mapped bank account (AccountID),
//   one line item against the mapped expense account (AccountCode),
//   LineAmountTypes NoTax (AMAP claims + logged gross expenses carry
//   no separate VAT treatment in this integration),
//   Contact = the expense vendor when present, else "MileClear"
//   (Xero find-or-creates contacts referenced by Name).
//
// WRITE-ONLY, create-only, idempotent via xero_synced_items keyed by
// (userId, itemKey) with the shared SyncItem key. Mirrors the
// QuickBooks Purchase sync so the two ledgers can't drift.

import { prisma } from "../lib/prisma.js";
import type { XeroConnection } from "@prisma/client";
import { xeroApi } from "./xero.js";
import { logEvent } from "./appEvents.js";
import { buildSyncItems, type SyncItem } from "./accountingItems.js";

// ── Xero shapes (the subset we touch) ───────────────────────────────

interface XeroAccountRaw {
  AccountID: string;
  Code?: string;
  Name: string;
  Type: string;
  Class?: string;
  Status?: string;
}
interface XeroAccountsResponse {
  Accounts?: XeroAccountRaw[];
}
interface XeroBankTransactionPayload {
  Type: "SPEND";
  Contact: { Name: string };
  BankAccount: { AccountID: string };
  Date: string; // YYYY-MM-DD
  Reference: string;
  LineAmountTypes: "NoTax";
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode: string;
  }>;
}
interface XeroBankTransactionsResponse {
  BankTransactions?: Array<{ BankTransactionID: string }>;
}

// ── Public types ────────────────────────────────────────────────────

export interface XeroAccount {
  id: string;
  code: string | null;
  name: string;
  type: string;
}

export interface XeroAccountLists {
  expenseAccounts: XeroAccount[];
  payFromAccounts: XeroAccount[];
}

export interface XeroSyncResult {
  pushed: number;
  skipped: number;
  failed: number;
  mileageTransactions: number;
  expenseTransactions: number;
  totalPushedPence: number;
  failures: Array<{ item: string; reason: string }>;
  lastSyncedAt: string;
}

export interface XeroSyncPreview {
  mileageMonths: number;
  eligibleExpenses: number;
  alreadySynced: number;
  estimatedTotalPence: number;
  accountsMapped: boolean;
}

// ── Account discovery + mapping ─────────────────────────────────────

/** Active Xero accounts, split into expense-line candidates (Class
 *  EXPENSE — line items post by Code) and pay-from candidates (Type
 *  BANK — the SPEND transaction's BankAccount by AccountID). */
export async function listXeroAccounts(
  connection: XeroConnection
): Promise<XeroAccountLists> {
  const res = await xeroApi<XeroAccountsResponse>(
    connection,
    "GET",
    `/Accounts?where=${encodeURIComponent('Status=="ACTIVE"')}`
  );
  const accounts = res.Accounts ?? [];
  const toAccount = (a: XeroAccountRaw): XeroAccount => ({
    id: a.AccountID,
    code: a.Code ?? null,
    name: a.Name,
    type: a.Type,
  });
  const expenseAccounts = accounts
    // Line items need a Code to post against; Class EXPENSE covers
    // EXPENSE / OVERHEADS / DIRECTCOSTS types.
    .filter((a) => a.Class === "EXPENSE" && a.Code)
    .map(toAccount);
  const payFromAccounts = accounts.filter((a) => a.Type === "BANK").map(toAccount);
  return { expenseAccounts, payFromAccounts };
}

/** Persist the user's chosen expense (Code) + pay-from (AccountID). */
export async function setXeroAccountMapping(args: {
  userId: string;
  expenseAccountCode: string;
  payFromAccountId: string;
}): Promise<void> {
  await prisma.xeroConnection.update({
    where: { userId: args.userId },
    data: {
      expenseAccountCode: args.expenseAccountCode,
      payFromAccountId: args.payFromAccountId,
    },
  });
}

/** The refs a SPEND transaction needs, using the stored mapping or
 *  auto-picking sensible defaults (persisted so it's stable + editable). */
async function resolveAccounts(
  connection: XeroConnection
): Promise<{ expenseAccountCode: string; payFromAccountId: string }> {
  if (connection.expenseAccountCode && connection.payFromAccountId) {
    return {
      expenseAccountCode: connection.expenseAccountCode,
      payFromAccountId: connection.payFromAccountId,
    };
  }
  const { expenseAccounts, payFromAccounts } = await listXeroAccounts(connection);
  if (expenseAccounts.length === 0) {
    throw new Error("Your Xero organisation has no expense accounts to post to.");
  }
  if (payFromAccounts.length === 0) {
    throw new Error("Your Xero organisation has no bank account to pay from.");
  }
  const preferExpense =
    expenseAccounts.find((a) => /motor|vehicle|travel|mileage|fuel/i.test(a.name)) ??
    expenseAccounts[0];
  const preferPayFrom = payFromAccounts[0];

  await prisma.xeroConnection.update({
    where: { id: connection.id },
    data: {
      expenseAccountCode: preferExpense.code,
      payFromAccountId: preferPayFrom.id,
    },
  });
  return {
    expenseAccountCode: preferExpense.code!,
    payFromAccountId: preferPayFrom.id,
  };
}

// ── Push + preview ──────────────────────────────────────────────────

function buildBankTransaction(
  item: SyncItem,
  accounts: { expenseAccountCode: string; payFromAccountId: string }
): XeroBankTransactionPayload {
  return {
    Type: "SPEND",
    Contact: { Name: (item.vendor ?? "MileClear").slice(0, 255) },
    BankAccount: { AccountID: accounts.payFromAccountId },
    Date: item.txnDate,
    Reference: `MileClear ${item.key}`.slice(0, 255),
    LineAmountTypes: "NoTax",
    LineItems: [
      {
        Description: `${item.description} — ${item.privateNote}`.slice(0, 4000),
        Quantity: 1,
        UnitAmount: Number((item.amountPence / 100).toFixed(2)),
        AccountCode: accounts.expenseAccountCode,
      },
    ],
  };
}

async function loadActiveConnection(userId: string): Promise<XeroConnection> {
  const connection = await prisma.xeroConnection.findUnique({ where: { userId } });
  if (!connection || connection.status !== "active") {
    throw new Error("Xero is not connected.");
  }
  return connection;
}

/** Push a tax year's mileage claim + alongside-allowable expenses to
 *  Xero as SPEND bank transactions. Create-only + idempotent;
 *  partial-failure tolerant. */
export async function pushTaxYearToXero(args: {
  userId: string;
  taxYear: string;
}): Promise<XeroSyncResult> {
  const { userId, taxYear } = args;
  const connection = await loadActiveConnection(userId);
  const accounts = await resolveAccounts(connection);

  const items = await buildSyncItems(userId, taxYear);

  const keys = items.map((i) => i.key);
  const already = await prisma.xeroSyncedItem.findMany({
    where: { userId, itemKey: { in: keys } },
    select: { itemKey: true },
  });
  const syncedKeys = new Set(already.map((a) => a.itemKey));

  let pushed = 0;
  let skipped = 0;
  let failed = 0;
  let mileageTransactions = 0;
  let expenseTransactions = 0;
  let totalPushedPence = 0;
  const failures: XeroSyncResult["failures"] = [];

  for (const item of items) {
    if (syncedKeys.has(item.key)) {
      skipped += 1;
      continue;
    }
    try {
      const res = await xeroApi<XeroBankTransactionsResponse>(
        connection,
        "POST",
        "/BankTransactions",
        { BankTransactions: [buildBankTransaction(item, accounts)] }
      );
      const entityId = res.BankTransactions?.[0]?.BankTransactionID;
      if (!entityId) {
        throw new Error("Xero returned no BankTransactionID");
      }
      await prisma.xeroSyncedItem.create({
        data: {
          connectionId: connection.id,
          userId,
          itemKey: item.key,
          xeroEntityId: entityId,
          xeroEntityType: "BankTransaction",
        },
      });
      pushed += 1;
      totalPushedPence += item.amountPence;
      if (item.kind === "mileage") mileageTransactions += 1;
      else expenseTransactions += 1;
    } catch (err) {
      failed += 1;
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ item: item.description, reason: reason.slice(0, 400) });
    }
  }

  const lastSyncedAt = new Date();
  await prisma.xeroConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt },
  });
  logEvent("xero.sync", userId, {
    taxYear,
    pushed,
    skipped,
    failed,
    mileageTransactions,
    expenseTransactions,
    totalPushedPence,
  });

  return {
    pushed,
    skipped,
    failed,
    mileageTransactions,
    expenseTransactions,
    totalPushedPence,
    failures,
    lastSyncedAt: lastSyncedAt.toISOString(),
  };
}

/** Counts for the UI before the user triggers a sync. No Xero write. */
export async function previewTaxYearForXero(args: {
  userId: string;
  taxYear: string;
}): Promise<XeroSyncPreview> {
  const { userId, taxYear } = args;
  const connection = await loadActiveConnection(userId);
  const items = await buildSyncItems(userId, taxYear);
  const keys = items.map((i) => i.key);
  const alreadySynced = await prisma.xeroSyncedItem.count({
    where: { userId, itemKey: { in: keys } },
  });
  return {
    mileageMonths: items.filter((i) => i.kind === "mileage").length,
    eligibleExpenses: items.filter((i) => i.kind === "expense").length,
    alreadySynced,
    estimatedTotalPence: items.reduce((a, i) => a + i.amountPence, 0),
    accountsMapped: Boolean(connection.expenseAccountCode && connection.payFromAccountId),
  };
}
