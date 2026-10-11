// One-off: strip National Insurance Numbers out of historical app_events rows.
//
// GDPR audit H1 (14 Aug 2026): the HMRC client logged its request path
// verbatim, and MTD paths carry the taxpayer's NINO, so app_events holds
// NINOs in `metadata.path` on rows written before the fix. New rows are
// scrubbed at write time (logEvent -> redactNinosDeep); this cleans the old.
//
// DRY RUN BY DEFAULT. It prints how many rows would change and the event
// types involved, never the NINOs themselves. Pass --apply to write.
//
//   cd ~/mileclear-app/apps/api
//   npx tsx --env-file=../../.env scripts/redact-nino-app-events.ts          # dry run
//   npx tsx --env-file=../../.env scripts/redact-nino-app-events.ts --apply  # write
//
// Idempotent: a second run finds nothing to change. Only rows whose metadata
// text looks like it could hold a NINO (two letters + six digits) are read,
// via a MySQL REGEXP prefilter, so it does not walk the whole table.

import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { redactNinosDeep } from "../src/lib/redactUrl.js";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

(async () => {
  console.log(`=== app_events NINO redaction (${APPLY ? "APPLY" : "dry run"}) ===`);

  let lastId = "";
  let scanned = 0;
  let changed = 0;
  const byType = new Map<string, number>();

  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; type: string; metadata: unknown }[]>(
      Prisma.sql`
        SELECT id, type, metadata
        FROM app_events
        WHERE id > ${lastId}
          AND metadata IS NOT NULL
          AND CAST(metadata AS CHAR) REGEXP '[A-Za-z]{2}[0-9]{6}'
        ORDER BY id
        LIMIT ${BATCH}
      `
    );
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    for (const row of rows) {
      scanned++;
      const meta =
        typeof row.metadata === "string" ? (JSON.parse(row.metadata) as unknown) : row.metadata;
      const redacted = redactNinosDeep(meta);
      if (JSON.stringify(redacted) === JSON.stringify(meta)) continue;

      changed++;
      byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
      if (APPLY) {
        await prisma.appEvent.update({
          where: { id: row.id },
          data: { metadata: redacted as Prisma.InputJsonValue },
        });
      }
    }
  }

  console.log(`Candidate rows read: ${scanned}`);
  console.log(`Rows ${APPLY ? "redacted" : "that would be redacted"}: ${changed}`);
  for (const [type, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${n}`);
  }
  if (!APPLY && changed > 0) console.log("Re-run with --apply to write the changes.");
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
