/**
 * Support inbox (Oct 2026): every minute, collects new mail from the
 * collection mailbox that support@ forwards to. Off unless SUPPORT_POP3_USER
 * and SUPPORT_POP3_PASS are set. Runs only in the first pm2 instance so two
 * processes never share a POP3 mailbox (POP3 locks it anyway).
 */

import { collectSupportMail } from "../services/supportInbox.js";

const EVERY_MS = 60_000;

export function startSupportInboxJobs(): void {
  const user = process.env.SUPPORT_POP3_USER;
  const pass = process.env.SUPPORT_POP3_PASS;
  if (!user || !pass) return;
  if (process.env.NODE_APP_INSTANCE && process.env.NODE_APP_INSTANCE !== "0") return;

  const opts = {
    host: process.env.SUPPORT_POP3_HOST || "127.0.0.1",
    port: Number(process.env.SUPPORT_POP3_PORT || 995),
    servername: process.env.SUPPORT_POP3_SERVERNAME || "mail.mileclear.com",
    user,
    pass,
  };
  let running = false;
  let lastErrorAt = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await collectSupportMail(opts);
      if (r.stored || r.failed) console.log("[support-inbox] stored %d, duplicate %d, failed %d", r.stored, r.duplicate, r.failed);
    } catch (err) {
      // Log at most once an hour so a wrong password can't flood the logs.
      if (Date.now() - lastErrorAt > 3_600_000) {
        lastErrorAt = Date.now();
        console.error("[support-inbox] collect failed:", err instanceof Error ? err.message : err);
      }
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 10_000);
  setInterval(tick, EVERY_MS);
}
