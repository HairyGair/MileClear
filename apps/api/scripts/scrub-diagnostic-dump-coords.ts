// One-off: strip coordinates out of diagnostic dumps uploaded before the scrub.
//
// GDPR audit H2 (14 Aug 2026): phones uploaded saved home/work latitude and
// longitude in every diagnostic dump. Since 27 Aug (92de89a1) the phone stops
// sending them and the server scrubs on receipt, and each user's dump is
// overwritten on their next upload. A driver who has not opened the app since
// still has an old dump with their home pin in it. This applies the same
// scrubCoordinates the receiver uses to every stored dump.
//
// DRY RUN BY DEFAULT: prints how many dumps would change, never their content.
// Pass --apply to write.
//
//   cd ~/mileclear-app/apps/api
//   npx tsx --env-file=../../.env scripts/scrub-diagnostic-dump-coords.ts          # dry run
//   npx tsx --env-file=../../.env scripts/scrub-diagnostic-dump-coords.ts --apply  # write
//
// Rows are read one at a time by id: an orderBy over statusJson trips MySQL
// error 1038 (sort memory) on prod. Idempotent.

import { Prisma } from "@prisma/client";
import { scrubCoordinates, scrubDiagnosticEventData } from "@mileclear/shared";
import { prisma } from "../src/lib/prisma.js";

const APPLY = process.argv.includes("--apply");

type EventRow = { data?: string | null } & Record<string, unknown>;

(async () => {
  console.log(`=== diagnostic_dumps coordinate scrub (${APPLY ? "APPLY" : "dry run"}) ===`);

  const ids = await prisma.diagnosticDump.findMany({ select: { id: true } });
  let changed = 0;

  for (const { id } of ids) {
    const row = await prisma.diagnosticDump.findUnique({
      where: { id },
      select: { statusJson: true, eventsJson: true },
    });
    if (!row) continue;

    const status = scrubCoordinates(row.statusJson);
    const events = Array.isArray(row.eventsJson)
      ? (row.eventsJson as EventRow[]).map((e) =>
          e && typeof e === "object" && "data" in e
            ? { ...e, data: scrubDiagnosticEventData(e.data ?? null) }
            : e
        )
      : row.eventsJson;

    const same =
      JSON.stringify(status) === JSON.stringify(row.statusJson) &&
      JSON.stringify(events) === JSON.stringify(row.eventsJson);
    if (same) continue;

    changed++;
    if (APPLY) {
      await prisma.diagnosticDump.update({
        where: { id },
        data: {
          statusJson: status as Prisma.InputJsonValue,
          eventsJson: events as Prisma.InputJsonValue,
        },
      });
    }
  }

  console.log(`Dumps read: ${ids.length}`);
  console.log(`Dumps ${APPLY ? "scrubbed" : "that would be scrubbed"}: ${changed}`);
  if (!APPLY && changed > 0) console.log("Re-run with --apply to write the changes.");
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exit(1);
});
