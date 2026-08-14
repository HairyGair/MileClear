// Re-encrypt stored TrueLayer bank tokens under MTD_TOKEN_KEY.
//
// Background (GDPR audit, 14 Aug 2026): these tokens were encrypted with
// a key derived from JWT_SECRET, because TRUELAYER_TOKEN_ENCRYPTION_KEY
// was never set in production. That coupled bank-credential secrecy to
// the JWT signing secret, so rotating one would have broken the other.
// openBanking.ts now uses lib/encryption.ts (`enc:v1:`) for writes and
// accepts the legacy format on read; this script moves the existing rows
// across so the legacy read path can eventually be deleted.
//
// Run on prod, from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env \
//        --experimental-strip-types scripts/reencrypt-truelayer-tokens.ts --dry-run
// then again without --dry-run. Safe to re-run: rows already at enc:v1:
// are skipped.
//
// IMPORTANT: run this with the SAME JWT_SECRET that encrypted the rows.
// If JWT_SECRET has been rotated since a row was written, that row cannot
// be recovered and the user must reconnect their bank; the script reports
// those separately rather than guessing.

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { encrypt, isEncrypted } from "../src/lib/encryption.js";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const LEGACY_KEY_SOURCE =
  process.env.TRUELAYER_TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || "";

function decryptLegacy(value: string): string | null {
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  const [ivHex, tagHex, ciphertext] = parts;
  try {
    const key = crypto.createHash("sha256").update(LEGACY_KEY_SOURCE).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return decipher.update(ciphertext, "hex", "utf8") + decipher.final("utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!process.env.MTD_TOKEN_KEY) {
    throw new Error("MTD_TOKEN_KEY is not set — nothing to re-encrypt into.");
  }
  if (!LEGACY_KEY_SOURCE) {
    throw new Error(
      "Neither TRUELAYER_TOKEN_ENCRYPTION_KEY nor JWT_SECRET is set — cannot read the existing rows."
    );
  }

  const connections = await prisma.plaidConnection.findMany({
    select: { id: true, userId: true, accessToken: true, refreshToken: true, status: true },
  });

  let alreadyDone = 0;
  let migrated = 0;
  const unreadable: string[] = [];

  for (const conn of connections) {
    const accessDone = isEncrypted(conn.accessToken);
    const refreshDone = !conn.refreshToken || isEncrypted(conn.refreshToken);
    if (accessDone && refreshDone) {
      alreadyDone++;
      continue;
    }

    const access = accessDone ? conn.accessToken : decryptLegacy(conn.accessToken);
    const refresh =
      !conn.refreshToken || refreshDone
        ? conn.refreshToken
        : decryptLegacy(conn.refreshToken);

    // A null here means the ciphertext did not authenticate under the
    // legacy key. Do not overwrite: a wrong guess destroys the only copy.
    if (access === null || refresh === null) {
      unreadable.push(`${conn.id} (user ${conn.userId.slice(0, 8)}, status ${conn.status})`);
      continue;
    }

    if (!dryRun) {
      await prisma.plaidConnection.update({
        where: { id: conn.id },
        data: {
          accessToken: accessDone ? conn.accessToken : encrypt(access),
          refreshToken: refresh && !refreshDone ? encrypt(refresh) : conn.refreshToken,
        },
      });
    }
    migrated++;
  }

  console.log(`connections:      ${connections.length}`);
  console.log(`already enc:v1:   ${alreadyDone}`);
  console.log(`${dryRun ? "would migrate:    " : "migrated:         "}${migrated}`);
  console.log(`unreadable:       ${unreadable.length}`);
  for (const u of unreadable) console.log(`  ! ${u}`);
  if (unreadable.length > 0) {
    console.log(
      "\nUnreadable rows were left untouched. Those users must reconnect their bank;\n" +
        "disconnect them rather than leaving a token nothing can decrypt."
    );
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
