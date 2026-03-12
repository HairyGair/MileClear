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

  let imported = 0;
  let skipped = 0;
  let unmatched = 0;

  // Fetch transactions for each account
  for (const account of accounts) {
    const txnUrl = `${TRUELAYER_API_BASE}/data/v1/accounts/${account.account_id}/transactions?from=${startDate}&to=${endDate}`;
    const txnRes = await fetch(txnUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!txnRes.ok) continue;

    const txnData = await txnRes.json() as any;
    const transactions = txnData.results || [];

    // Filter: CREDIT transactions = income (money in)
    const incomeTransactions = transactions.filter(
      (t: any) => t.transaction_type === "CREDIT"
    );

    for (const txn of incomeTransactions) {
      const merchantName = txn.merchant_name || txn.description || "";
      const platform = matchMerchantToPlatform(merchantName);

      if (!platform) {
        unmatched++;
        continue;
      }

      const amountPence = Math.round(Math.abs(txn.amount) * 100);
      const txnDate = txn.timestamp?.split("T")[0] || endDate;

      try {
        await prisma.earning.create({
          data: {
            userId,
            platform,
            amountPence,
            periodStart: new Date(txnDate),
            periodEnd: new Date(txnDate),
            source: "open_banking",
            externalId: txn.transaction_id,
            notes: connection.institutionName
              ? `Via ${connection.institutionName}`
              : null,
          },
        });
        imported++;
      } catch (err: any) {
        if (err?.code === "P2002") {
          skipped++;
        } else {
          throw err;
        }
      }
    }
  }

  await prisma.plaidConnection.update({
    where: { id: connectionId },
    data: { lastSynced: new Date() },
  });

  return { imported, skipped, unmatched };
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
