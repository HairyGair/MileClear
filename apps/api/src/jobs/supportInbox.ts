/**
 * Support inbox (Oct 2026): reads mail that the cPanel pipe forwarder drops
 * into SUPPORT_SPOOL_DIR every 30 seconds, and clears raw copies older than
 * 30 days out of done/ (the mailbox keeps the original). Off unless
 * SUPPORT_SPOOL_DIR is set.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { ingestSupportSpool } from "../services/supportInbox.js";

const EVERY_MS = 30_000;
const KEEP_DONE_MS = 30 * 86_400_000;

async function pruneDone(dir: string): Promise<void> {
  const done = path.join(dir, "done");
  const names = await fs.readdir(done).catch(() => [] as string[]);
  const cutoff = Date.now() - KEEP_DONE_MS;
  for (const n of names) {
    const f = path.join(done, n);
    const st = await fs.stat(f).catch(() => null);
    if (st && st.mtimeMs < cutoff) await fs.unlink(f).catch(() => {});
  }
}

export function startSupportInboxJobs(): void {
  const dir = process.env.SUPPORT_SPOOL_DIR;
  if (!dir) return;
  let running = false;
  let lastPrune = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await ingestSupportSpool(dir);
      if (r.stored || r.failed) console.log("[support-inbox] stored %d, failed %d", r.stored, r.failed);
      if (Date.now() - lastPrune > 86_400_000) {
        lastPrune = Date.now();
        await pruneDone(dir);
      }
    } catch (err) {
      console.error("[support-inbox] tick failed:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 5_000);
  setInterval(tick, EVERY_MS);
}
