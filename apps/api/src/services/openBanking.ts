import crypto from "crypto";
import {
  TRUELAYER_AUTH_BASE,
  TRUELAYER_API_BASE,
  TRUELAYER_CLIENT_ID,
  TRUELAYER_CLIENT_SECRET,
  truelayerEnabled,
} from "../lib/truelayer.js";
import { prisma } from "../lib/prisma.js";
import { MERCHANT_PLATFORM_MAP } from "@mileclear/shared";
import { resolveMerchantSuggestion } from "./merchantCategoriser.js";
import { reconcileInvoicePayments } from "./invoiceReconcile.js";

// ── Encryption (AES-256-GCM for tokens at rest) ──────────────────────

const ENCRYPTION_KEY = process.env.TRUELAYER_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
}

function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decryptToken(encrypted: string): string {
  if (!encrypted.includes(":")) return encrypted;
  const [ivHex, tagHex, ciphertext] = encrypted.split(":");
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ── Merchant matching ─────────────────────────────────────────────────

const sortedMerchantKeys = Object.keys(MERCHANT_PLATFORM_MAP).sort(
  (a, b) => b.length - a.length
);

export function matchMerchantToPlatform(merchantName: string): string | null {
  const lower = merchantName.toLowerCase();
  for (const key of sortedMerchantKeys) {
    if (lower.includes(key)) {
      return MERCHANT_PLATFORM_MAP[key];
    }
  }
  return null;
}

/**
 * Phase 1 expense merchant → category classifier (22 May 2026).
 *
 * Hand-curated patterns targeting UK gig drivers + sole traders. Returns a
 * suggestion + confidence (0-100) for the inbox UI:
 *   ≥80 = high-confidence, one-tap accept eligible
 *   40-79 = needs a glance
 *   <40 = fallback, user almost certainly needs to override
 *
 * Phase 2 will move these patterns to a database table + per-user overrides
 * that train confidence from accept/override behaviour. Keep the API
 * stable so the migration is a drop-in.
 */
export function categoriseExpenseMerchant(
  merchant: string
): { category: string; confidence: number } {
  const lower = merchant.toLowerCase();

  // Parking
  if (
    /\b(ncp|justpark|ringgo|paybyphone|apcoa|britannia parking|euro car parks|parkmobile|q-park|parking)\b/.test(
      lower
    )
  ) {
    return { category: "parking", confidence: 85 };
  }
  // Tolls & bridges
  if (
    /\b(dartford|m6 toll|severn|mersey gateway|tyne tunnel|humber bridge|clifton suspension|itchen)\b/.test(
      lower
    )
  ) {
    return { category: "tolls", confidence: 85 };
  }
  // Congestion / ULEZ / clean-air zones
  if (
    /\b(tfl congestion|congestion charge|cong charge|ulez|clean air zone|caz)\b/.test(
      lower
    )
  ) {
    return { category: "congestion", confidence: 90 };
  }
  // Phone (UK mobile carriers)
  if (
    /\b(ee mobile|ee limited|vodafone|o2 uk|o2 telef|three uk|h3g|sky mobile|giffgaff|tesco mobile|virgin mobile|talkmobile|smarty|id mobile|lebara|lyca|voxi)\b/.test(
      lower
    )
  ) {
    return { category: "phone", confidence: 80 };
  }
  // Road tax (DVLA)
  if (/\b(dvla|vehicle tax|car tax|veh tax)\b/.test(lower)) {
    return { category: "road_tax", confidence: 85 };
  }
  // MOT
  if (/\b(mot)\b/.test(lower) && /test|station|garage/.test(lower)) {
    return { category: "mot", confidence: 80 };
  }
  // Maintenance / parts
  if (
    /\b(halfords|kwik fit|kwikfit|euro car parts|national tyres|formula one autocentre|atspartsway|gsf|partsway|autosmart|autosmart|tyre|garage|servicing)\b/.test(
      lower
    )
  ) {
    return { category: "maintenance", confidence: 75 };
  }
  // Vehicle insurance
  if (
    /\b(admiral|direct line|aviva|axa|lv=|lv insurance|hastings direct|churchill|tesco insurance|swinton|esure|saga insurance|hagerty|markerstudy|insurefor|insurance)\b/.test(
      lower
    )
  ) {
    return { category: "insurance", confidence: 70 };
  }
  // Fuel — Phase 1 routes through the expense inbox with low confidence so
  // the user reviews. FuelLog requires litres which a bank statement
  // doesn't carry, so we can't auto-promote. The user can either accept
  // as a generic expense, or jump to the Fuel screen to log properly.
  // Phase 2 will offer a "Log as fuel (with litres)" shortcut.
  if (
    /\b(shell|esso|texaco|gulf|jet petrol|jet auto|bp |bp$|tesco petrol|tesco fuel|sainsbury.{0,5}petrol|asda fuel|asda petrol|morrisons petrol|applegreen|murco|gulf retail)\b/.test(
      lower
    )
  ) {
    return { category: "other", confidence: 35 };
  }
  // Subsistence (HMRC SE57240 warning surfaces inline in the picker)
  if (
    /\b(mcdonald|starbucks|costa coffee|pret a manger|pret|greggs|burger king|kfc|subway|cafe nero|caffe nero|leon restaurants|wenzel|tim hortons|gail's|pizza|dominos)\b/.test(
      lower
    )
  ) {
    return { category: "subsistence", confidence: 60 };
  }
  // Accommodation
  if (
    /\b(premier inn|travelodge|holiday inn|hilton|marriott|booking\.com|hotels\.com|airbnb|hotel|ibis|novotel|mercure|premier suites)\b/.test(
      lower
    )
  ) {
    return { category: "accommodation", confidence: 80 };
  }
  // Subscriptions / SaaS for work
  if (
    /\b(google storage|google one|dropbox|microsoft 365|office 365|adobe|figma|notion labs|github|trello|asana|slack|canva|spotify|apple\.com\/bill)\b/.test(
      lower
    )
  ) {
    return { category: "subscription", confidence: 70 };
  }
  // Professional fees (accountants, legal, etc — broad fallback)
  if (
    /\b(accountant|tax adviser|solicitor|legal|consult|crunch accounting|freeagent|xero subscription)\b/.test(
      lower
    )
  ) {
    return { category: "professional_fees", confidence: 70 };
  }

  // Fallback — user reviews + categorises by hand
  return { category: "other", confidence: 20 };
}

// ── TrueLayer Auth ────────────────────────────────────────────────────

const REDIRECT_URI =
  process.env.TRUELAYER_REDIRECT_URI ||
  `${process.env.API_BASE_URL || "http://localhost:3002"}/earnings/open-banking/callback`;

const SCOPES = "info accounts balance transactions offline_access";

export function buildAuthLink(state: string): string {
  if (!truelayerEnabled) throw new Error("TrueLayer not configured");

  const env = process.env.TRUELAYER_ENV || "sandbox";
  const providers = env === "production" ? "uk-ob-all uk-oauth-all" : "mock";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: TRUELAYER_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    providers,
    state,
  });

  return `${TRUELAYER_AUTH_BASE}/?${params.toString()}`;
}

export async function exchangeCode(
  userId: string,
  code: string,
  institutionName?: string
) {
  if (!truelayerEnabled) throw new Error("TrueLayer not configured");

  const res = await fetch(`${TRUELAYER_AUTH_BASE}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: TRUELAYER_CLIENT_ID,
      client_secret: TRUELAYER_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TrueLayer token exchange failed: ${res.status} ${body}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const encryptedAccess = encryptToken(data.access_token);
  const encryptedRefresh = data.refresh_token ? encryptToken(data.refresh_token) : null;

  // Use a hash of the access token as a stable connection identifier
  const connectionKey = crypto
    .createHash("sha256")
    .update(data.access_token)
    .digest("hex")
    .slice(0, 40);

  // Try to get provider info from TrueLayer
  let providerName = institutionName || null;
  try {
    const accountsRes = await fetch(`${TRUELAYER_API_BASE}/data/v1/accounts`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (accountsRes.ok) {
      const accountsData = await accountsRes.json() as any;
      if (accountsData.results?.[0]?.provider?.display_name) {
        providerName = accountsData.results[0].provider.display_name;
      }
    }
  } catch {
    // Non-fatal — use whatever name we have
  }

  // Check for existing connection with same key
  const existing = await prisma.plaidConnection.findUnique({ where: { itemId: connectionKey } });
  if (existing && existing.userId !== userId) {
    throw new Error("This bank connection belongs to another account");
  }

  const connection = await prisma.plaidConnection.upsert({
    where: { itemId: connectionKey },
    create: {
      userId,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      itemId: connectionKey,
      institutionName: providerName,
      status: "active",
    },
    update: {
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      status: "active",
      institutionName: providerName || undefined,
    },
  });

  return {
    id: connection.id,
    institutionName: connection.institutionName,
    status: connection.status,
  };
}

async function refreshAccessToken(connection: {
  id: string;
  refreshToken: string | null;
}): Promise<string> {
  if (!connection.refreshToken) {
    throw new Error("No refresh token available — user must re-authorise");
  }

  const refreshToken = decryptToken(connection.refreshToken);

  const res = await fetch(`${TRUELAYER_AUTH_BASE}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: TRUELAYER_CLIENT_ID,
      client_secret: TRUELAYER_CLIENT_SECRET,
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!res.ok) {
    // Mark connection as needing re-auth
    await prisma.plaidConnection.update({
      where: { id: connection.id },
      data: { status: "error" },
    });
    throw new Error("Token refresh failed — user must re-authorise their bank");
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  // Store updated tokens
  const updateData: any = {
    accessToken: encryptToken(data.access_token),
  };
  if (data.refresh_token) {
    updateData.refreshToken = encryptToken(data.refresh_token);
  }

  await prisma.plaidConnection.update({
    where: { id: connection.id },
    data: updateData,
  });

  return data.access_token;
}

export async function getConnections(userId: string) {
  return prisma.plaidConnection.findMany({
    where: { userId },
    select: {
      id: true,
      institutionId: true,
      institutionName: true,
      lastSynced: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

async function getValidAccessToken(connection: {
  id: string;
  accessToken: string;
  refreshToken: string | null;
}): Promise<string> {
  const accessToken = decryptToken(connection.accessToken);

  // Test if current token is still valid
  const testRes = await fetch(`${TRUELAYER_API_BASE}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (testRes.ok) return accessToken;

  if (testRes.status === 401) {
    // Token expired — try refresh
    return refreshAccessToken(connection);
  }

  throw new Error(`TrueLayer API error: ${testRes.status}`);
}

export async function syncTransactions(
  userId: string,
  connectionId: string,
  fromDate?: string,
  toDate?: string
) {
  if (!truelayerEnabled) throw new Error("TrueLayer not configured");

  const connection = await prisma.plaidConnection.findFirst({
    where: { id: connectionId, userId, status: "active" },
  });

  if (!connection) {
    throw new Error("Bank connection not found or disconnected");
  }

  const accessToken = await getValidAccessToken(connection);

  // Default to last 90 days
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 90);

  const startDate = fromDate || defaultFrom.toISOString().split("T")[0];
  const endDate = toDate || now.toISOString().split("T")[0];

  // Fetch all accounts
  const accountsRes = await fetch(`${TRUELAYER_API_BASE}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!accountsRes.ok) {
    throw new Error(`Failed to fetch accounts: ${accountsRes.status}`);
  }

  const accountsData = await accountsRes.json() as any;
  const accounts = accountsData.results || [];

  // imported  = earnings auto-promoted from known-platform CREDITs
  // skipped   = previously-imported duplicates (P2002 on Earning OR BankTransaction)
  // queued    = landed in the inbox awaiting review (Phase 1, 22 May 2026)
  let imported = 0;
  let skipped = 0;
  let queued = 0;
  // Newly-created PENDING credits from THIS sync — fed to the invoice
  // reconciler below. Auto-consumed platform payouts are excluded (a
  // known gig-platform payout is never an invoice payment).
  const newPendingCreditIds: string[] = [];

  // Fetch transactions for each account
  for (const account of accounts) {
    const txnUrl = `${TRUELAYER_API_BASE}/data/v1/accounts/${account.account_id}/transactions?from=${startDate}&to=${endDate}`;
    const txnRes = await fetch(txnUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!txnRes.ok) continue;

    const txnData = await txnRes.json() as any;
    const transactions = txnData.results || [];

    for (const txn of transactions) {
      const merchantName = txn.merchant_name || txn.description || "";
      const isCredit = txn.transaction_type === "CREDIT";
      const rawAmount = Number(txn.amount) || 0;
      // Signed pence: positive = CREDIT, negative = DEBIT. Keeps inbox card
      // maths uniform regardless of TrueLayer's per-account sign convention.
      const signedAmountPence = isCredit
        ? Math.round(Math.abs(rawAmount) * 100)
        : -Math.round(Math.abs(rawAmount) * 100);
      const txnDate = (txn.timestamp?.split("T")[0] || endDate) as string;
      const externalId = String(txn.transaction_id || "");
      if (!externalId) continue;

      // Resolve suggestion via the Phase 2 categoriser:
      //   1. User's learned MerchantMapping (highest confidence)
      //   2. Phase 1 seed rules (platform matcher / expense categoriser)
      //   3. Low-confidence fallback ("other") - user reviews
      const platform = isCredit ? matchMerchantToPlatform(merchantName) : null;
      const suggestedKind: "earning" | "expense" =
        isCredit ? "earning" : "expense";
      const learned = await resolveMerchantSuggestion({
        userId,
        merchant: merchantName,
        kind: suggestedKind,
      });
      const suggestedCategory = learned.category;
      const suggestedConfidence = learned.confidence;

      // Auto-promote known-platform CREDITs to Earning rows. Preserves the
      // pre-inbox behaviour TrueLayer users already rely on.
      let resolvedEarningId: string | null = null;
      let status: "consumed" | "pending" = "pending";
      if (isCredit && platform) {
        try {
          const earning = await prisma.earning.create({
            data: {
              userId,
              platform,
              amountPence: Math.abs(signedAmountPence),
              periodStart: new Date(txnDate),
              periodEnd: new Date(txnDate),
              source: "open_banking",
              externalId,
              notes: connection.institutionName
                ? `Via ${connection.institutionName}`
                : null,
            },
            select: { id: true },
          });
          resolvedEarningId = earning.id;
          status = "consumed";
          imported++;
        } catch (err: any) {
          if (err?.code === "P2002") {
            // Already imported on a previous sync. The bank_transaction
            // upsert below will also no-op via the unique constraint.
            skipped++;
            continue;
          }
          throw err;
        }
      }

      // Mirror everything (auto-promoted + pending) into bank_transactions.
      // Idempotent on (userId, externalId) — re-syncing is safe.
      try {
        const created = await prisma.bankTransaction.create({
          data: {
            userId,
            plaidConnectionId: connection.id,
            externalId,
            merchant: (merchantName || "Unknown").slice(0, 200),
            descriptionRaw: txn.description ?? null,
            amountPence: signedAmountPence,
            currency: txn.currency || "GBP",
            transactionDate: new Date(txnDate),
            status,
            suggestedKind,
            suggestedCategory,
            suggestedConfidence,
            resolvedEarningId,
            reviewedAt: status === "consumed" ? new Date() : null,
          },
          select: { id: true },
        });
        if (status === "pending") {
          queued++;
          if (isCredit) newPendingCreditIds.push(created.id);
        }
      } catch (err: any) {
        if (err?.code === "P2002") {
          // bank_transactions row already exists from an earlier sync —
          // status preserved (don't re-promote, don't re-queue).
          if (status === "pending") skipped++;
          continue;
        }
        throw err;
      }
    }
  }

  // Invoice reconciliation (Get Paid Phase 4): match this sync's new
  // credits against open invoices. Never fatal to the sync itself.
  let invoiceMatches = { autoMatched: 0, suggested: 0 };
  try {
    invoiceMatches = await reconcileInvoicePayments(userId, newPendingCreditIds);
  } catch (err) {
    console.error("[openBanking] invoice reconcile failed:", err);
  }

  await prisma.plaidConnection.update({
    where: { id: connectionId },
    data: { lastSynced: new Date() },
  });

  // Legacy field name `unmatched` kept for back-compat with the existing
  // mobile UI that surfaces "X unmatched transactions". From Phase 1 on
  // those go to the inbox under `queued`; we alias for now and the mobile
  // copy can shift to "X to review" in the same release.
  return { imported, skipped, queued, unmatched: queued, invoiceMatches };
}

export async function disconnectConnection(
  userId: string,
  connectionId: string
) {
  const connection = await prisma.plaidConnection.findFirst({
    where: { id: connectionId, userId },
  });

  if (!connection) {
    throw new Error("Bank connection not found");
  }

  // TrueLayer doesn't have an explicit "remove" API — just mark as disconnected
  await prisma.plaidConnection.update({
    where: { id: connectionId },
    data: { status: "disconnected" },
  });
}
