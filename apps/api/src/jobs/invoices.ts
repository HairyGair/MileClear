// Invoice auto-chase scheduler (Get Paid Milestone E, Jul 2026).
//
// Two-pass design, hourly tick, fires inside a 08:00–10:00 UTC window
// (09:00–11:00 UK in summer — mornings get invoices paid, and the pass
// runs AFTER the Phase-F bank sync so an overnight payment suppresses
// that morning's chase):
//
//   WARN pass — 24h before a chase is due, push the USER: "auto-chase
//   goes out tomorrow — open to cancel". Product decision: no chase is
//   ever a surprise. The fire pass requires the warning to be ≥20h old,
//   which guarantees the window even when auto-chase is enabled on an
//   already-overdue invoice.
//
//   FIRE pass — due chases: re-verify premium (lapsed Pro PAUSES, the
//   config survives), re-verify unpaid, send via sendInvoiceEmail with
//   the shared statutory-interest template, advance to the next stage.
//
// Brevo safety: invoice email traffic is capped at 100/day (counted off
// InvoiceEmail.createdAt). Over the cap → defer, nextChaseAt untouched,
// the next run retries. Set INVOICE_CHASE_DRY_RUN=1 to log would-sends
// without sending (first prod deploy ran with this on).

import { prisma } from "../lib/prisma.js";
import { runJob } from "../services/jobRun.js";
import { sendPushToUser } from "../lib/push.js";
import { logEvent } from "../services/appEvents.js";
import { sendInvoiceEmail, type InvoiceEmailKind } from "../services/email.js";
import { generateInvoicePdf } from "../services/export.js";
import { resolvePremiumStatus } from "../services/referral.js";
import {
  invoiceChaseStages,
  buildInvoiceChaseEmail,
  buildInvoicePreDueEmail,
  formatInvoiceNumber,
} from "@mileclear/shared";

const DAILY_INVOICE_EMAIL_CEILING = 100;
const WARN_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
// Slightly under 24h so a warning sent at 09:40 doesn't push the fire
// past the next day's window.
const WARN_MIN_AGE_MS = 20 * 60 * 60 * 1000;

function inSendWindow(now: Date): boolean {
  // Test hook: lets an operator force a fire pass outside the window
  // (one-off verification scripts). Never set in normal operation.
  if (process.env.INVOICE_CHASE_FORCE_WINDOW === "1") return true;
  const h = now.getUTCHours();
  return h >= 8 && h < 10;
}

async function invoiceEmailsSentToday(): Promise<number> {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  return prisma.invoiceEmail.count({
    where: { createdAt: { gte: midnight }, status: "sent" },
  });
}

/** The stage whose scheduled time matches nextChaseAt (we always store a
 *  stage time verbatim), plus the following stage — or the LAST past
 *  stage when auto-chase was enabled on an already-old invoice. */
function currentAndNextStage(dueAt: Date, nextChaseAt: Date) {
  const stages = invoiceChaseStages(dueAt);
  let idx = stages.findIndex((s) => s.at.getTime() === nextChaseAt.getTime());
  if (idx === -1) {
    // Enabled late: nextChaseAt was set to "now-ish". Send the most
    // recent stage the invoice has already passed.
    const passed = stages.filter((s) => s.at.getTime() <= nextChaseAt.getTime());
    idx = Math.max(0, passed.length - 1);
  }
  return {
    stage: stages[idx],
    next: stages[idx + 1] ?? null,
  };
}

export async function runInvoiceChaseJob(): Promise<{
  warned: number;
  sent: number;
  deferred: number;
  skipped: number;
}> {
  const now = new Date();
  const dryRun = process.env.INVOICE_CHASE_DRY_RUN === "1";
  const result = { warned: 0, sent: 0, deferred: 0, skipped: 0 };

  // ── WARN pass (any hour — the warning itself can go out whenever the
  //    24h-lookahead first sees the chase; pushes at sane times only).
  const warnWindowOk = now.getUTCHours() >= 8 && now.getUTCHours() < 20;
  if (warnWindowOk) {
    const upcoming = await prisma.invoice.findMany({
      where: {
        autoChaseEnabled: true,
        paidAt: null,
        status: { not: "written_off" },
        chaseWarnedAt: null,
        nextChaseAt: { lte: new Date(now.getTime() + WARN_LOOKAHEAD_MS) },
      },
      select: {
        id: true,
        userId: true,
        company: true,
        invoiceNumber: true,
        nextChaseAt: true,
      },
      take: 200,
    });
    for (const inv of upcoming) {
      const ref = inv.invoiceNumber != null ? formatInvoiceNumber(inv.invoiceNumber) : "your invoice";
      if (!dryRun) {
        await sendPushToUser(
          inv.userId,
          "Payment reminder goes out tomorrow",
          `${ref} to ${inv.company} will be chased by email tomorrow morning. Open MileClear to cancel or mark it paid.`,
          { action: "open_app" }
        );
      }
      await prisma.invoice.update({
        where: { id: inv.id },
        data: { chaseWarnedAt: now },
      });
      result.warned++;
    }
  }

  // ── FIRE pass (window-gated).
  if (!inSendWindow(now)) return result;

  const due = await prisma.invoice.findMany({
    where: {
      autoChaseEnabled: true,
      paidAt: null,
      status: { not: "written_off" },
      nextChaseAt: { lte: now },
      chaseWarnedAt: { lte: new Date(now.getTime() - WARN_MIN_AGE_MS) },
    },
    include: {
      client: { select: { email: true } },
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
          fullName: true,
          tradingName: true,
          isPremium: true,
          premiumExpiresAt: true,
          referralProUntil: true,
        },
      },
    },
    take: 100,
  });

  for (const inv of due) {
    // Lapsed Pro pauses chasing without destroying the config.
    if (!resolvePremiumStatus(inv.user).active) {
      result.skipped++;
      continue;
    }
    const toEmail = inv.clientEmail ?? inv.client?.email ?? null;
    if (!toEmail || inv.user.email.endsWith("@private.mileclear.com")) {
      result.skipped++;
      continue;
    }
    if ((await invoiceEmailsSentToday()) >= DAILY_INVOICE_EMAIL_CEILING) {
      // Defer: nextChaseAt untouched, tomorrow's run retries.
      logEvent("invoice.chase_deferred_cap", inv.userId, { invoiceId: inv.id });
      result.deferred++;
      continue;
    }

    const invoiceNumber = inv.invoiceNumber ?? 0;
    const { stage, next } = currentAndNextStage(inv.dueAt, inv.nextChaseAt!);
    const chaseArgs = {
      company: inv.company,
      reference: inv.reference,
      amountPence: inv.amountPence,
      sentAt: inv.sentAt.toISOString().slice(0, 10),
      dueAt: inv.dueAt.toISOString().slice(0, 10),
    };
    const senderName = inv.user.tradingName || inv.user.fullName || inv.user.displayName;
    const text =
      stage.kind === "chase_pre_due"
        ? buildInvoicePreDueEmail(chaseArgs, senderName).body
        : buildInvoiceChaseEmail(chaseArgs, senderName).body;

    if (dryRun) {
      console.log(`[invoice-chase DRY RUN] would send ${stage.kind} for ${inv.id} to ${toEmail}`);
      result.sent++;
      continue;
    }

    try {
      const { buffer } = await generateInvoicePdf(inv.userId, inv.id);
      const { subject } = await sendInvoiceEmail({
        user: inv.user,
        invoice: {
          company: inv.company,
          invoiceNumber,
          amountPence: inv.amountPence,
          sentAt: inv.sentAt,
          dueAt: inv.dueAt,
          reference: inv.reference,
        },
        toEmail,
        pdf: buffer,
        kind: stage.kind as InvoiceEmailKind,
        chaseBodyText: text,
      });
      await prisma.$transaction([
        prisma.invoiceEmail.create({
          data: {
            invoiceId: inv.id,
            userId: inv.userId,
            kind: stage.kind,
            toEmail,
            subject,
            status: "sent",
          },
        }),
        prisma.invoice.update({
          where: { id: inv.id },
          data: {
            chaseCount: { increment: 1 },
            nextChaseAt: next?.at ?? null,
            chaseWarnedAt: null,
          },
        }),
      ]);
      logEvent("invoice.auto_chased", inv.userId, {
        invoiceId: inv.id,
        kind: stage.kind,
      });
      await sendPushToUser(
        inv.userId,
        "Payment reminder sent",
        `${inv.invoiceNumber != null ? formatInvoiceNumber(inv.invoiceNumber) : "Your invoice"} — reminder emailed to ${inv.company}.`,
        { action: "open_app" }
      );
      result.sent++;
      // Gentle pacing between SMTP sends.
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.error(`[invoice-chase] send failed for ${inv.id}:`, err);
      await prisma.invoiceEmail.create({
        data: {
          invoiceId: inv.id,
          userId: inv.userId,
          kind: stage.kind,
          toEmail,
          subject: "Auto-chase failed",
          status: "failed",
          error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        },
      });
      // Leave nextChaseAt in place — tomorrow retries.
      result.deferred++;
    }
  }

  return result;
}

// ── Daily background bank sync (Get Paid Phase 4) ────────────────────
// Pulls the last 7 days of transactions for premium users who have an
// active bank connection AND at least one open invoice, so overnight
// payments reconcile BEFORE the chase window — a client who paid at
// 11pm never gets chased at 9am. Window-gated 06:00–08:00 UTC (07:00–
// 09:00 UK in summer), i.e. strictly before the 08:00–10:00 fire pass.

function inBankSyncWindow(now: Date): boolean {
  if (process.env.INVOICE_CHASE_FORCE_WINDOW === "1") return true;
  const h = now.getUTCHours();
  return h >= 6 && h < 8;
}

export async function runInvoiceBankSyncJob(): Promise<{
  synced: number;
  failed: number;
  autoMatched: number;
  suggested: number;
}> {
  const result = { synced: 0, failed: 0, autoMatched: 0, suggested: 0 };
  // Reconcile kill-switch: no background bank syncing while the
  // TrueLayer arrangement is unsettled (see invoiceReconcile.ts).
  const { invoiceReconcileEnabled } = await import("../services/invoiceReconcile.js");
  if (!invoiceReconcileEnabled()) return result;
  const now = new Date();
  if (!inBankSyncWindow(now)) return result;

  // Once per day: skip if a run already synced in the last 20h. The
  // hourly tick would otherwise sync twice inside the 2h window.
  const twentyHoursAgo = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const recentRun = await prisma.jobRun.findFirst({
    where: {
      jobName: "invoice_bank_sync",
      status: "success",
      startedAt: { gte: twentyHoursAgo },
      // Only count runs that actually did work (metadata records synced>0
      // or there was nothing to do — either way the day is covered).
    },
    orderBy: { startedAt: "desc" },
  });
  if (recentRun) return result;

  const users = await prisma.user.findMany({
    where: {
      plaidConnections: { some: { status: "active" } },
      invoices: { some: { paidAt: null, status: { in: ["sent", "overdue"] } } },
    },
    select: {
      id: true,
      isPremium: true,
      premiumExpiresAt: true,
      referralProUntil: true,
      plaidConnections: {
        where: { status: "active" },
        select: { id: true },
      },
    },
    take: 200,
  });

  const { syncTransactions } = await import("../services/openBanking.js");
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  for (const user of users) {
    if (!resolvePremiumStatus(user).active) continue;
    for (const conn of user.plaidConnections) {
      try {
        const res = await syncTransactions(user.id, conn.id, from);
        result.synced++;
        result.autoMatched += res.invoiceMatches?.autoMatched ?? 0;
        result.suggested += res.invoiceMatches?.suggested ?? 0;
      } catch (err) {
        result.failed++;
        console.error(`[invoice-bank-sync] sync failed for user ${user.id}:`, err);
      }
      // Gentle pacing against the TrueLayer API.
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return result;
}

export function startInvoiceJobs(): void {
  const INITIAL_DELAY_MS = 90 * 1000;
  const INTERVAL_MS = 60 * 60 * 1000; // hourly tick; jobs self-gate by window

  setTimeout(() => {
    void runJob("invoice_bank_sync", runInvoiceBankSyncJob);
    void runJob("invoice_chase", runInvoiceChaseJob);
    setInterval(() => {
      // Bank sync first so a fresh payment suppresses today's chase.
      void runJob("invoice_bank_sync", runInvoiceBankSyncJob);
      void runJob("invoice_chase", runInvoiceChaseJob);
    }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}
