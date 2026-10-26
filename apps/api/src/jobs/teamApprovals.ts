// Milesheet Phase 2 (24 Aug 2026): "last month is ready to
// approve" email to org admins.
//
// The design partner's stated need was to "automatically submit expenses
// each month" - the export in services/teamExport.ts is the document, this
// job is the nudge that gets an admin to open the portal and produce it.
// Runs early in the month (cron cadence set by whoever registers this),
// targets the month that JUST ended, and is safe to run more than once:
// every send is guarded by an AppEvent so a given admin is never emailed
// twice for the same org+month, mirroring the dedup pattern already used
// by jobs/activation.ts and jobs/notifications.ts.
//
// Oct 2026: approve from the email. The 26 Oct pilot numbers showed most
// driver-started teams stalled because the nominated manager never created
// an account. Two recipients now, per org:
//   (a) ACTIVE admins: the same email, now with an "Approve from this
//       email" link next to the portal link. Dedup: team.month_ready_<month>
//       per admin userId, as before.
//   (b) Orgs with NO active admin whose manager is still INVITED: the
//       invited address gets "<drivers> asked you to approve their <month>
//       mileage" with the totals and a link. Drivers counted here are the
//       active ones plus the invited ones that already have a userId (the
//       driver who nominated this manager). Dedup:
//       team.month_link_<month> with {orgId, recipient fingerprint}, since
//       there is no userId to hang it on. A nominating driver who has since
//       joined another company is never counted (services/teamDrivers.ts).
//       Capped: no more once the two previous months' links went unopened
//       (ignoredTwice), and the email carries a stop link plus one-click
//       List-Unsubscribe that switch the invited manager off.

import { prisma } from "../lib/prisma.js";
import { sendTeamApprovalRequestEmail, sendTeamMonthReadyEmail } from "../services/email.js";
import { computeTeamMonthSummary, currentLondonMonth, previousMonth } from "../services/teamExport.js";
import { createApprovalLink, emailFingerprint, hashLinkToken } from "../services/teamApprovalLinks.js";
import { teamDriverMembershipWhere } from "../services/teamDrivers.js";

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

// The invited-manager email goes to someone with no account, often for the
// first time in weeks: not at half past midnight on the 1st.
const INVITED_EARLIEST_LONDON_HOUR = 8;

function londonDayOfMonth(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric" }).format(now)
  );
}

function londonHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", hourCycle: "h23" }).format(now)
  );
}

async function alreadyNotified(userId: string, eventType: string): Promise<boolean> {
  const existing = await prisma.appEvent.findFirst({
    where: { userId, type: eventType },
    select: { id: true },
  });
  return existing !== null;
}

async function alreadyLinked(orgId: string, recipient: string, eventType: string): Promise<boolean> {
  const existing = await prisma.appEvent.findFirst({
    where: {
      type: eventType,
      AND: [
        { metadata: { path: "$.orgId", equals: orgId } },
        { metadata: { path: "$.recipient", equals: recipient } },
      ],
    },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * The cap Anthony agreed (Oct 2026): an invited manager whose links for the
 * two months before this one were both sent and never opened gets no more.
 * Opening the page sets lastUsedAt, so one visit restarts the count.
 */
export async function ignoredTwice(orgId: string, email: string, month: string): Promise<boolean> {
  const prev1 = previousMonth(month);
  const prev2 = previousMonth(prev1);
  const links = await prisma.teamApprovalLink.findMany({
    where: { orgId, recipientEmail: email, month: { in: [prev1, prev2] } },
    select: { month: true, lastUsedAt: true },
  });
  const unopened = (m: string) => {
    const forMonth = links.filter((l) => l.month === m);
    return forMonth.length > 0 && forMonth.every((l) => l.lastUsedAt === null);
  };
  return unopened(prev1) && unopened(prev2);
}

/**
 * Creates the link, sends the email with it, and removes the link again if
 * the send fails, so a retry on the next tick never leaves unused link rows
 * behind (the raw token cannot be recovered from its hash to reuse it).
 */
async function sendWithLink(
  orgId: string,
  month: string,
  email: string,
  now: Date,
  send: (token: string) => Promise<void>
): Promise<void> {
  const token = await createApprovalLink(orgId, month, email, now);
  try {
    await send(token);
  } catch (err) {
    await prisma.teamApprovalLink.deleteMany({ where: { tokenHash: hashLinkToken(token) } }).catch(() => undefined);
    throw err;
  }
}

/** "Sam", "Sam and Jo", "Sam, Jo and 2 others". Unnamed drivers are counted, never invented. */
export function joinDriverNames(names: Array<string | null>): string {
  const total = names.length;
  const named = names.map((n) => n?.trim()).filter((n): n is string => !!n);
  if (named.length === 0) return total === 1 ? "Your driver" : "Your drivers";
  if (named.length === total && total <= 3) {
    return total === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[total - 1]}`;
  }
  const shown = named.slice(0, 2);
  const rest = total - shown.length;
  return `${shown.join(", ")} and ${rest} other${rest === 1 ? "" : "s"}`;
}

export async function runTeamMonthReadyJob(now: Date = new Date()): Promise<void> {
  // TEAM_MONTH_READY_DRY_RUN=1 logs who WOULD be emailed and sends
  // nothing (and creates no links), so it can be run on demand before
  // letting it loose on real admins. Mirrors ACTIVATION_LAPSED_DRY_RUN /
  // INVOICE_CHASE_DRY_RUN. Covers both the active-admin and the
  // invited-manager emails.
  const dryRun = process.env.TEAM_MONTH_READY_DRY_RUN === "1";
  const month = previousMonth(currentLondonMonth());
  const label = monthLabel(month);
  const eventType = `team.month_ready_${month}`;
  const linkEventType = `team.month_link_${month}`;

  const day = londonDayOfMonth(now);
  if (day > MONTH_READY_WINDOW_DAYS && !dryRun) return;
  const invitedWindowOpen = dryRun || londonHour(now) >= INVITED_EARLIEST_LONDON_HOUR;

  const orgs = await prisma.organisation.findMany({ select: { id: true, name: true } });

  let sent = 0;
  let invitedSent = 0;
  let cappedInvited = 0;
  let skippedOrgs = 0;

  for (const org of orgs) {
    const admins = await prisma.orgMembership.findMany({
      where: { orgId: org.id, role: "admin", status: "active", userId: { not: null } },
      select: { userId: true, user: { select: { email: true } } },
    });

    // ── (b) Nobody has accepted the manager role yet ──────────────────────
    if (admins.length === 0) {
      if (!invitedWindowOpen) continue;
      const invited = await prisma.orgMembership.findMany({
        where: { orgId: org.id, role: "admin", status: "invited" },
        select: { invitedEmail: true },
      });
      const pendingInvited: string[] = [];
      for (const m of invited) {
        const email = m.invitedEmail.trim().toLowerCase();
        if (!email) continue;
        if (await alreadyLinked(org.id, emailFingerprint(email), linkEventType)) continue;
        if (await ignoredTwice(org.id, email, month)) {
          cappedInvited++;
          continue;
        }
        pendingInvited.push(email);
      }
      if (pendingInvited.length === 0) {
        skippedOrgs++;
        continue;
      }

      // Active drivers plus the nominating driver(s): invited memberships
      // that already have a userId. Nobody else could ever approve them.
      // Same rule as the summary: not a nominating driver who has since
      // joined another company.
      const drivers = await prisma.orgMembership.count({
        where: teamDriverMembershipWhere(org.id, true),
      });
      if (drivers === 0) {
        skippedOrgs++;
        continue;
      }
      const summary = await computeTeamMonthSummary(org.id, month, { includeNominatingDrivers: true });
      const withMiles = summary.drivers.filter((d) => d.businessMiles > 0);
      if (withMiles.length === 0) {
        skippedOrgs++;
        continue;
      }

      for (const email of pendingInvited) {
        if (dryRun) {
          // No address in the log: the org id is enough to find it.
          console.log(`[jobs/teamApprovals] DRY RUN would email the invited manager of org ${org.id} for ${label}`);
          continue;
        }
        try {
          await sendWithLink(org.id, month, email, now, (token) =>
            sendTeamApprovalRequestEmail(email, {
              orgName: org.name,
              monthLabel: label,
              driverNames: joinDriverNames(withMiles.map((d) => d.displayName)),
              driverCount: withMiles.length,
              totalMiles: summary.totalMiles,
              totalAmountPence: summary.totalAmountPence,
              approveToken: token,
            })
          );
          // Awaited and direct, for the same reason as below.
          await prisma.appEvent.create({
            data: { type: linkEventType, userId: null, metadata: { orgId: org.id, month, recipient: emailFingerprint(email) } },
          });
          invitedSent++;
        } catch (err) {
          console.error(`[jobs/teamApprovals] Failed to email the invited manager of org ${org.id}:`, err);
        }
      }
      continue;
    }

    // ── (a) Active admins ────────────────────────────────────────────────
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
        await sendWithLink(org.id, month, admin.email, now, (token) =>
          sendTeamMonthReadyEmail(admin.email, org.name, label, token)
        );
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
    `[jobs/teamApprovals] Month-ready job: ${sent} admin email(s), ${invitedSent} invited-manager email(s) sent, ${cappedInvited} invited manager(s) stopped after two unopened months, ${skippedOrgs} org(s) skipped (month=${month}, dryRun=${dryRun})`
  );
}
