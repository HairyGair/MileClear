import crypto from "crypto";
import { CountryCode, Products } from "plaid";
import { plaidClient } from "../lib/plaid.js";
import { prisma } from "../lib/prisma.js";
import { MERCHANT_PLATFORM_MAP } from "@mileclear/shared";

// AES-256-GCM encryption for Plaid access tokens at rest
const PLAID_ENCRYPTION_KEY = process.env.PLAID_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  // Derive a 32-byte key from the secret using SHA-256
  return crypto.createHash("sha256").update(PLAID_ENCRYPTION_KEY).digest();
}

function encryptPlaidToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  // Format: iv:tag:ciphertext
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decryptPlaidToken(encrypted: string): string {
  // Support unencrypted legacy tokens (no colons = raw token)
  if (!encrypted.includes(":")) return encrypted;
  const [ivHex, tagHex, ciphertext] = encrypted.split(":");
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Sort merchant keys longest-first so "amazon flex" matches before "amazon"
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

export async function createLinkToken(userId: string): Promise<string> {
  if (!plaidClient) throw new Error("Plaid not configured");

  const response = await plaidClient.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "MileClear",
    products: [Products.Transactions],
    country_codes: [CountryCode.Gb],
    language: "en",
  });

  return response.data.link_token;
}

export async function exchangePublicToken(
  userId: string,
  publicToken: string,
  institutionId?: string,
  institutionName?: string
) {
  if (!plaidClient) throw new Error("Plaid not configured");

  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });

  const { access_token, item_id } = response.data;

  // Verify ownership before reconnecting — prevent cross-user connection hijacking
  const existing = await prisma.plaidConnection.findUnique({ where: { itemId: item_id } });
  if (existing && existing.userId !== userId) {
    throw new Error("This bank connection belongs to another account");
  }

  // Encrypt access token before storage
  const encryptedToken = encryptPlaidToken(access_token);

  // Upsert — handles reconnection of same bank
  const connection = await prisma.plaidConnection.upsert({
    where: { itemId: item_id },
    create: {
      userId,
      accessToken: encryptedToken,
      itemId: item_id,
      institutionId: institutionId || null,
      institutionName: institutionName || null,
      status: "active",
    },
    update: {
      accessToken: encryptedToken,
      status: "active",
      institutionId: institutionId || undefined,
      institutionName: institutionName || undefined,
    },
  });

  return {
    id: connection.id,
    institutionName: connection.institutionName,
    status: connection.status,
  };
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

export async function syncTransactions(
  userId: string,
  connectionId: string,
  fromDate?: string,
  toDate?: string
) {
  if (!plaidClient) throw new Error("Plaid not configured");

  const connection = await prisma.plaidConnection.findFirst({
    where: { id: connectionId, userId, status: "active" },
  });

  if (!connection) {
    throw new Error("Bank connection not found or disconnected");
  }

  // Default to last 90 days
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 90);

  const startDate = fromDate || defaultFrom.toISOString().split("T")[0];
  const endDate = toDate || now.toISOString().split("T")[0];

  // Fetch transactions (handles pagination)
  let allTransactions: any[] = [];
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const response = await plaidClient.transactionsGet({
      access_token: decryptPlaidToken(connection.accessToken),
      start_date: startDate,
      end_date: endDate,
      options: { count: 500, offset },
    });

    allTransactions = allTransactions.concat(response.data.transactions);
    const totalTransactions = response.data.total_transactions;
    offset = allTransactions.length;
    hasMore = allTransactions.length < totalTransactions;
  }

  // Filter: income transactions (positive amount in Plaid = money out; negative = money in)
  // Plaid uses positive = debit (money out), negative = credit (money in)
  // We want credits (income), which have negative amounts
  const incomeTransactions = allTransactions.filter((t) => t.amount < 0);

  let imported = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const txn of incomeTransactions) {
    const merchantName = txn.merchant_name || txn.name || "";
    const platform = matchMerchantToPlatform(merchantName);

    if (!platform) {
      unmatched++;
      continue;
    }

    const amountPence = Math.round(Math.abs(txn.amount) * 100);
    const txnDate = txn.date; // YYYY-MM-DD

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

  // Update lastSynced
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

  // Try to remove from Plaid if client is available
  if (plaidClient) {
    try {
      await plaidClient.itemRemove({
        access_token: decryptPlaidToken(connection.accessToken),
      });
    } catch {
      // Non-fatal — still mark as disconnected locally
    }
  }

  await prisma.plaidConnection.update({
    where: { id: connectionId },
    data: { status: "disconnected" },
  });
}
