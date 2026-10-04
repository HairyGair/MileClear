// Milesheet free trial reminders (4 Oct 2026). Every 6 hours (the runAll
// loop in jobs/notifications.ts): for each team on an active free trial with
// no subscription, email its admins 7 days and 1 day before the trial ends.
// The stage rule is trialReminderStage in services/teamTrial.ts (tested);
// each (team, stage) is sent once, deduped on the AppEvent
// "team.trial_reminder_sent" so a restart cannot send it twice.
//
// Gate: MILESHEET_TRIAL_EMAILS. Nothing sends unless it is exactly "1".
// Unset, the job logs what it would have sent and writes nothing. Trials
// only exist once MILESHEET_NEW_TEAMS is "open", so today it finds nothing.

import { prisma } from "../lib/prisma.js";
import { logEvent } from "../services/appEvents.js";
import { sendMilesheetTrialEndingEmail } from "../services/email.js";
import {
  trialDaysLeft,
  trialEmailsEnabled,
  trialReminderStage,
} from "../services/teamTrial.js";

export const TRIAL_REMINDER_EVENT = "team.trial_reminder_sent";
const DAY_MS = 24 * 60 * 60 * 1000;

function metaOf(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export async function runMilesheetTrialRemindersJob(): Promise<void> {
  const now = new Date();
  const live = trialEmailsEnabled();

  // Trials ending within the next 7 days and not yet over.
  const orgs = await prisma.organisation.findMany({
    where: {
      pilotFree: false,
      stripeSubscriptionId: null,
      trialEndsAt: { gt: now, lte: new Date(now.getTime() + 7 * DAY_MS) },
    },
    select: { id: true, name: true, pilotFree: true, stripeSubscriptionId: true, trialEndsAt: true },
  });
  if (orgs.length === 0) return;

  const sentRows = await prisma.appEvent.findMany({
    where: { type: TRIAL_REMINDER_EVENT, createdAt: { gte: new Date(now.getTime() - 40 * DAY_MS) } },
    select: { metadata: true },
  });
  const sent = new Set(
    sentRows
      .map((r) => metaOf(r.metadata))
      .filter((m): m is Record<string, unknown> => !!m)
      .map((m) => `${m.orgId}:${m.stage}`)
  );

  let wouldSend = 0;
  for (const org of orgs) {
    const stage = trialReminderStage(org, now);
    if (stage == null || sent.has(`${org.id}:${stage}`)) continue;

    const admins = await prisma.orgMembership.findMany({
      where: { orgId: org.id, role: "admin", status: "active" },
      select: { invitedEmail: true, user: { select: { email: true } } },
    });
    const emails = [...new Set(admins.map((a) => (a.user?.email ?? a.invitedEmail).toLowerCase()))];
    if (emails.length === 0) continue;
    const daysLeft = trialDaysLeft(org.trialEndsAt, now) ?? stage;

    if (!live) {
      wouldSend += emails.length;
      console.log(`[milesheet-trial] DRY RUN: would email ${emails.length} admin(s) of ${org.name} (${stage}-day reminder, ${daysLeft} day(s) left)`);
      continue;
    }

    let delivered = 0;
    for (const email of emails) {
      try {
        await sendMilesheetTrialEndingEmail(email, org.name, daysLeft, org.trialEndsAt!);
        delivered += 1;
      } catch (err) {
        console.error(`[milesheet-trial] reminder to ${email} for org ${org.id} failed:`, err);
      }
    }
    // Recorded once at least one admin got it, so a total failure is retried
    // on the next run rather than silently skipped.
    if (delivered > 0) {
      logEvent(TRIAL_REMINDER_EVENT, null, { orgId: org.id, stage, recipients: delivered, daysLeft });
    }
  }
  if (!live && wouldSend > 0) {
    console.log(`[milesheet-trial] DRY RUN total: ${wouldSend} email(s). Set MILESHEET_TRIAL_EMAILS=1 to send.`);
  }
}
