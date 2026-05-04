// Idempotency-key purge cron
//
// Deletes IdempotencyKey rows whose expiresAt has passed. Prevents the
// table from growing unbounded — every successful mutation that includes
// an Idempotency-Key header writes a row with a 24h TTL.
//
// Audit item #3 (external_audit_may_2.md).

import { prisma } from "../lib/prisma.js";

export async function runIdempotencyPurgeJob(): Promise<void> {
  const result = await prisma.idempotencyKey.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  if (result.count > 0) {
    console.log(`[idempotencyPurge] Removed ${result.count} expired key(s).`);
  }
}
