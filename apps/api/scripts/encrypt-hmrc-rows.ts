// One-shot migration: encrypt every existing HmrcConnection row.
//
// Walks every HmrcConnection. For each, decryptIfEncrypted on
// accessToken / refreshToken / nino — if any returned unchanged
// (i.e. legacy plaintext), re-encrypt and write back. Idempotent —
// running twice is a no-op.
//
// Run on the production server with both env files loaded so
// MTD_TOKEN_KEY is available alongside DATABASE_URL:
//
//   cd ~/mileclear-app/apps/api
//   npx tsx --env-file=../../.env --env-file=.env scripts/encrypt-hmrc-rows.ts
//
// Output: row count + before/after status of each row's three columns.

import { prisma } from "../src/lib/prisma.js";
import { encrypt, isEncrypted } from "../src/lib/encryption.js";

interface RowReport {
  id: string;
  userId: string;
  accessTokenWasEncrypted: boolean;
  refreshTokenWasEncrypted: boolean;
  ninoWasEncrypted: boolean | null; // null = nino was empty
  changed: boolean;
}

(async () => {
  console.log("=== HmrcConnection encryption migration ===");
  console.log("Started at:", new Date().toISOString());

  const rows = await prisma.hmrcConnection.findMany({
    select: { id: true, userId: true, accessToken: true, refreshToken: true, nino: true },
  });
  console.log(`Found ${rows.length} HmrcConnection row(s).`);
  if (rows.length === 0) {
    console.log("Nothing to migrate. Exiting cleanly.");
    process.exit(0);
  }

  const reports: RowReport[] = [];

  for (const row of rows) {
    const accessEnc = isEncrypted(row.accessToken);
    const refreshEnc = isEncrypted(row.refreshToken);
    const ninoEnc = row.nino == null || row.nino === "" ? null : isEncrypted(row.nino);

    // Skip if everything's already encrypted (or empty for nino).
    if (accessEnc && refreshEnc && (ninoEnc === null || ninoEnc === true)) {
      reports.push({
        id: row.id,
        userId: row.userId,
        accessTokenWasEncrypted: true,
        refreshTokenWasEncrypted: true,
        ninoWasEncrypted: ninoEnc,
        changed: false,
      });
      continue;
    }

    const data: Record<string, string> = {};
    if (!accessEnc && row.accessToken) data.accessToken = encrypt(row.accessToken);
    if (!refreshEnc && row.refreshToken) data.refreshToken = encrypt(row.refreshToken);
    if (ninoEnc === false && row.nino) data.nino = encrypt(row.nino);

    if (Object.keys(data).length === 0) {
      reports.push({
        id: row.id,
        userId: row.userId,
        accessTokenWasEncrypted: accessEnc,
        refreshTokenWasEncrypted: refreshEnc,
        ninoWasEncrypted: ninoEnc,
        changed: false,
      });
      continue;
    }

    await prisma.hmrcConnection.update({
      where: { id: row.id },
      data,
    });

    reports.push({
      id: row.id,
      userId: row.userId,
      accessTokenWasEncrypted: accessEnc,
      refreshTokenWasEncrypted: refreshEnc,
      ninoWasEncrypted: ninoEnc,
      changed: true,
    });
  }

  const changed = reports.filter((r) => r.changed).length;
  const skipped = reports.length - changed;

  console.log(`\n--- Summary ---`);
  console.log(`Changed: ${changed}`);
  console.log(`Skipped (already encrypted): ${skipped}`);
  console.log(`\n--- Per-row report ---`);
  for (const r of reports) {
    console.log(
      `  ${r.id} (user ${r.userId}): access=${r.accessTokenWasEncrypted ? "enc" : "PLAIN"} refresh=${r.refreshTokenWasEncrypted ? "enc" : "PLAIN"} nino=${r.ninoWasEncrypted === null ? "empty" : r.ninoWasEncrypted ? "enc" : "PLAIN"}${r.changed ? " → encrypted" : ""}`
    );
  }
  console.log("\nFinished at:", new Date().toISOString());
  process.exit(0);
})();
