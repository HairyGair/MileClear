// MileClear Teams Phase 2 (24 Aug 2026): "last month is ready to
// approve" email to org admins.
//
// Charlotte's stated need was "automatically submit expenses each
// month" - the export in services/teamExport.ts is the document, this
// job is the nudge that gets an admin to open the portal and produce it.
// Runs early in the month (cron cadence set by whoever registers this),
// targets the month that JUST ended, and is safe to run more than once:
// every send is guarded by an AppEvent so a given admin is never emailed
// twice for the same org+month, mirroring the dedup pattern already used
// by jobs/activation.ts and jobs/notifications.ts.

import { prisma } from "../lib/prisma.js";
import { sendTeamMonthReadyEmail } from "../services/email.js";
import { computeTeamMonthSummary, currentLondonMonth, previousMonth } from "../services/teamExport.js";

function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const year = Number(match[1]);
  const mon = Number(match[2]);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Only the first few days of the month. This job is registered on the
// 30-minute windowed tick (a monthly job on the 6-hour boot-anchored loop
// can miss its window entirely - that is how fuel alerts silently died in
// July 2026), so without a gate it would recompute every org's month 48
// times a day, forever.
const MONTH_READY_WINDOW_DAYS = 4;

function londonDayOfMonth(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric" }).format(now)
  );
}

async function alreadyNotified(userId: string, eventType: string): Promise<boolean> {
  const existing = await prisma.appEvent.findFirst({
    where: { userId, type: eventType },
    select: { id: true },
  });
  return existing !== null;
}

export async function runTeamMonthReadyJob(): Promise<void> {
  // TEAM_MONTH_READY_DRY_RUN=1 logs who WOULD be emailed and sends
  // nothing, so it can be run on demand before letting it loose on real
  // admins. Mirrors ACTIVATION_LAPSED_DRY_RUN / INVOICE_CHASE_DRY_RUN.
  const dryRun = process.env.TEAM_MONTH_READY_DRY_RUN === "1";
  const month = previousMonth(currentLondonMonth());
  const label = monthLabel(month);
  const eventType = `team.month_ready_${month}`;

  const day = londonDayOfMonth(new Date());
  if (day > MONTH_READY_WINDOW_DAYS && !dryRun) return;

  const orgs = await prisma.organisation.findMany({ select: { id: true, name: true } });

  let sent = 0;
  let skippedOrgs = 0;

  for (const org of orgs) {
    const admins = await prisma.orgMembership.findMany({
      where: { orgId: org.id, role: "admin", status: "active", userId: { not: null } },
      select: { userId: true, user: { select: { email: true } } },
    });

    // Work out who still needs telling BEFORE doing any expensive work. Once
    // an org's admins have all been emailed, this costs two cheap queries per
    // tick instead of a full month computation.
    const pending: { userId: string; email: string }[] = [];
    for (const admin of admins) {
      if (!admin.userId || !admin.user?.email) continue;
      if (await alreadyNotified(admin.userId, eventType)) continue;
      pending.push({ userId: admin.userId, email: admin.user.email });
    }
    if (pending.length === 0) {
      skippedOrgs++;
      continue;
    }

    const activeDrivers = await prisma.orgMembership.count({
      where: { orgId: org.id, role: "driver", status: "active" },
    });
    if (activeDrivers === 0) {
      skippedOrgs++;
      continue;
    }

    // Reuses the exact same computation the portal and the approval
    // endpoint use, so "ready to approve" never disagrees with what an
    // admin sees when they click through.
    const summary = await computeTeamMonthSummary(org.id, month);
    const anyMiles = summary.drivers.some((d) => d.businessMiles > 0);
    if (!anyMiles) {
      skippedOrgs++;
      continue;
    }

    for (const admin of pending) {
      if (dryRun) {
        console.log(`[jobs/teamApprovals] DRY RUN would email ${admin.email} for ${org.name}, ${label}`);
        continue;
      }

      try {
        await sendTeamMonthReadyEmail(admin.email, org.name, label);
        // AWAITED, and written directly rather than via logEvent(): logEvent
        // is fire-and-forget and swallows its own errors, so a failed write
        // would leave no dedup record and this admin would be emailed again
        // on the next tick, and the one after that.
        await prisma.appEvent.create({
          data: { type: eventType, userId: admin.userId, metadata: { orgId: org.id, month } },
        });
        sent++;
      } catch (err) {
        console.error(`[jobs/teamApprovals] Failed to email ${admin.email} for org ${org.id}:`, err);
      }
    }
  }

  console.log(
    `[jobs/teamApprovals] Month-ready job: ${sent} email(s) sent, ${skippedOrgs} org(s) skipped (month=${month}, dryRun=${dryRun})`
  );
}
