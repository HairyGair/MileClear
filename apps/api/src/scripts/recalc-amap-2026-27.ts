/**
 * One-time recalc for the 45p -> 55p AMAP rate change.
 *
 * Tax year 2026-27 started 6 April 2026; the HMRC rate rose to 55p that
 * same day. MileageSummary rows for 2026-27 that were created or updated
 * BEFORE today's tax-year-aware deploy still hold deductionPence values
 * calculated at 45p. Every future trip create/update/delete will refresh
 * the summary correctly, but users who don't touch a trip between now
 * and tax season would see a stale figure.
 *
 * This script walks every 2026-27 MileageSummary and calls
 * upsertMileageSummary(userId, "2026-27") so the cached deductionPence
 * gets recomputed at the right rate. Idempotent - safe to re-run.
 *
 * Run on production:
 *   cd ~/mileclear-app && npx tsx apps/api/src/scripts/recalc-amap-2026-27.ts
 */

import { prisma } from "../lib/prisma.js";
import { upsertMileageSummary } from "../services/mileage.js";

const TARGET_TAX_YEAR = "2026-27";

async function main() {
  const summaries = await prisma.mileageSummary.findMany({
    where: { taxYear: TARGET_TAX_YEAR },
    select: {
      userId: true,
      businessMiles: true,
      deductionPence: true,
    },
  });

  console.log(
    `Found ${summaries.length} MileageSummary rows for tax year ${TARGET_TAX_YEAR}.`
  );
  if (summaries.length === 0) {
    await prisma.$disconnect();
    return;
  }

  let recalculated = 0;
  let unchanged = 0;
  let failed = 0;
  let totalDeltaPence = 0;

  for (const s of summaries) {
    const beforePence = s.deductionPence;
    try {
      await upsertMileageSummary(s.userId, TARGET_TAX_YEAR);
      const after = await prisma.mileageSummary.findUnique({
        where: { userId_taxYear: { userId: s.userId, taxYear: TARGET_TAX_YEAR } },
        select: { deductionPence: true },
      });
      const afterPence = after?.deductionPence ?? 0;
      const delta = afterPence - beforePence;
      if (delta === 0) {
        unchanged++;
      } else {
        recalculated++;
        totalDeltaPence += delta;
        console.log(
          `  user=${s.userId.slice(0, 8)}... miles=${s.businessMiles.toFixed(1)}` +
            ` before=£${(beforePence / 100).toFixed(2)} ` +
            `after=£${(afterPence / 100).toFixed(2)} ` +
            `delta=${delta > 0 ? "+" : ""}£${(delta / 100).toFixed(2)}`
        );
      }
    } catch (err) {
      failed++;
      console.log(`  user=${s.userId.slice(0, 8)}... FAILED: ${err}`);
    }
  }

  console.log("");
  console.log(`Done.`);
  console.log(`  Recalculated with delta: ${recalculated}`);
  console.log(`  Already up to date:      ${unchanged}`);
  console.log(`  Failed:                  ${failed}`);
  console.log(
    `  Total deduction delta:   ${totalDeltaPence >= 0 ? "+" : ""}£${(totalDeltaPence / 100).toFixed(2)} across all users`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
