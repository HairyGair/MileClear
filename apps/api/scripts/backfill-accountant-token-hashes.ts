// Backfill tokenHash + expiresAt on accountant invites and access rows.
//
// GDPR audit, 14 Aug 2026. AccountantAccess had no expiry at all, and both
// tables stored the bearer token in plaintext. The schema migration adds
// the columns as nullable so existing emailed links keep working; this
// fills them in.
//
// Existing links continue to work after this runs: lookups match on the
// hash of whatever token the accountant presents.
//
// Run on prod, from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env \
//        --experimental-strip-types scripts/backfill-accountant-token-hashes.ts --dry-run
// then again without --dry-run. Safe to re-run.
//
// Expiry policy for rows granted before the column existed: one year from
// the ORIGINAL grant date, so a link handed over two years ago is expired
// on arrival rather than silently given another year. Anything already
// past that gets a short grace window instead of dying mid-engagement,
// because a client whose accountant is filing this month should not have
// the link die without warning. Grace is reported so you can tell the
// affected users.

import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const GRACE_MS = 30 * 24 * 60 * 60 * 1000;

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

async function main(): Promise<void> {
  const invites = await prisma.accountantInvite.findMany({
    where: { tokenHash: null },
    select: { id: true, token: true },
  });
  for (const inv of invites) {
    if (!dryRun) {
      await prisma.accountantInvite.update({
        where: { id: inv.id },
        data: { tokenHash: hash(inv.token) },
      });
    }
  }

  const accesses = await prisma.accountantAccess.findMany({
    where: { OR: [{ tokenHash: null }, { expiresAt: null }] },
    select: { id: true, token: true, createdAt: true, accountantEmail: true, userId: true },
  });

  const now = Date.now();
  let expiredOnArrival = 0;
  let givenGrace = 0;

  for (const acc of accesses) {
    const natural = acc.createdAt.getTime() + ONE_YEAR_MS;
    const expiresAt = natural > now ? new Date(natural) : new Date(now + GRACE_MS);
    if (natural > now) expiredOnArrival++;
    else givenGrace++;

    if (!dryRun) {
      await prisma.accountantAccess.update({
        where: { id: acc.id },
        data: { tokenHash: hash(acc.token), expiresAt },
      });
    }
  }

  console.log(`invites hashed:        ${invites.length}`);
  console.log(`access rows updated:   ${accesses.length}`);
  console.log(`  within a year:       ${expiredOnArrival} (expire on their natural date)`);
  console.log(`  older than a year:   ${givenGrace} (given ${GRACE_MS / 86_400_000} days grace)`);
  if (givenGrace > 0) {
    console.log(
      "\nThose grace-period grants are links that would otherwise have died today.\n" +
        "Worth telling those users their accountant link now has an expiry date."
    );
  }
  if (dryRun) console.log("\n(dry run — nothing written)");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
