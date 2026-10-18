// Tell existing Milesheet drivers that their manager can now see their
// driving times (first business drive to last business drive each day).
//
// Oct 2026. The portal and the exports only show a driver's times once that
// driver has been told, which means a team.driving_times_notice event
// { orgId } for that team. The web invite page records it when a driver
// accepts after seeing the consent line; everyone else (drivers who joined
// before the line existed, nominating drivers, admin moves, waitlist-created
// teams) is told by this script, which emails them and then records the
// event. Drivers who already have the event for their team are skipped, so
// the script is safe to run again. Times show from the day the driver
// joined the team, and the email says so.
//
// DRY RUN BY DEFAULT: lists the active team drivers who would get the email,
// grouped by team. Nothing is sent or written without --send.
//
// Needs a build (it reads the gate and the email from dist/). Run ON the
// server from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/send-driving-times-notice.mjs
//   node --env-file=... scripts/send-driving-times-notice.mjs --send
// Optional: --org=<orgId> to act on one team only.

import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with --env-file on the server.");
  process.exit(1);
}

const SEND = process.argv.includes("--send");
const ORG_ID = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) || null;

const { isDriverToldAboutTimes, DRIVING_TIMES_NOTICE_EVENT, teamStartDate, earliestApprovalMonths } = await import(
  "../dist/services/drivingTimes.js"
);

const prisma = new PrismaClient();

try {
  const memberships = await prisma.orgMembership.findMany({
    where: {
      role: "driver",
      status: "active",
      userId: { not: null },
      ...(ORG_ID ? { orgId: ORG_ID } : {}),
    },
    select: {
      orgId: true,
      userId: true,
      acceptedAt: true,
      org: { select: { name: true, createdByUserId: true, createdAt: true } },
      user: { select: { email: true, displayName: true } },
    },
    orderBy: [{ orgId: "asc" }, { acceptedAt: "asc" }],
  });

  const userIds = memberships.map((m) => m.userId);
  const notices = userIds.length
    ? await prisma.appEvent.findMany({
        where: { type: DRIVING_TIMES_NOTICE_EVENT, userId: { in: userIds } },
        select: { userId: true, metadata: true },
      })
    : [];
  const noticesBy = new Map();
  for (const n of notices) {
    const list = noticesBy.get(n.userId) ?? [];
    list.push(n);
    noticesBy.set(n.userId, list);
  }

  const due = memberships.filter(
    (m) => m.user && !isDriverToldAboutTimes(noticesBy.get(m.userId) ?? [], m.orgId)
  );

  // The same team start the portal uses: the earlier of accepting and the
  // first month the manager approved, so the email's date matches the portal.
  const startBy = new Map();
  for (const orgId of new Set(due.map((m) => m.orgId))) {
    const ids = due.filter((m) => m.orgId === orgId).map((m) => m.userId);
    const months = await earliestApprovalMonths(orgId, ids);
    for (const m of due.filter((x) => x.orgId === orgId)) {
      const d = teamStartDate(
        m.acceptedAt,
        months.get(m.userId) ?? null,
        m.org.createdByUserId === m.userId ? m.org.createdAt : null
      );
      startBy.set(`${orgId}:${m.userId}`, d ? new Date(`${d}T12:00:00Z`) : null);
    }
  }
  const startOf = (m) => startBy.get(`${m.orgId}:${m.userId}`) ?? null;

  const byOrg = new Map();
  for (const m of due) {
    const list = byOrg.get(m.orgId) ?? { name: m.org.name, drivers: [] };
    list.drivers.push(m);
    byOrg.set(m.orgId, list);
  }

  console.log(`${SEND ? "SENDING" : "DRY RUN"}: ${due.length} of ${memberships.length} active team drivers have not been told yet.`);
  for (const [orgId, { name, drivers }] of byOrg) {
    console.log(`\n${name} (${orgId}): ${drivers.length}`);
    for (const m of drivers) {
      const joined = startOf(m) ? startOf(m).toISOString().slice(0, 10) : "unknown";
      console.log(`  ${m.user.displayName ?? "(no name)"} <${m.user.email}> joined ${joined}`);
    }
  }

  if (!SEND) {
    console.log("\nNothing sent. Run again with --send to email these drivers.");
  } else {
    // With no mail transport, deliver() only logs, and recording the event
    // would then unlock times for drivers who were never emailed. Brevo SMTP
    // needs both its user and its key.
    const env = process.env;
    const hasTransport =
      !!env.RESEND_API_KEY || !!env.BREVO_API_KEY || (!!env.BREVO_SMTP_USER && !!env.BREVO_SMTP_KEY);
    if (!hasTransport) {
      console.error(
        "No email transport configured (RESEND_API_KEY, BREVO_API_KEY, or BREVO_SMTP_USER and BREVO_SMTP_KEY). Refusing to send."
      );
      process.exitCode = 1;
      throw new Error("no email transport");
    }
    const { sendDrivingTimesNoticeEmail } = await import("../dist/services/email.js");
    let sent = 0;
    let failed = 0;
    for (const m of due) {
      try {
        // True only once a mail provider accepted the message; it throws on
        // a failed send and returns false when nothing could be sent.
        const delivered = await sendDrivingTimesNoticeEmail(
          m.user.email,
          m.user.displayName,
          m.org.name,
          startOf(m),
          m.userId
        );
        if (delivered !== true) throw new Error("not sent (no mail transport)");
        // Recorded only after a confirmed send, so a failed send leaves the
        // driver's times hidden and the next run tries again.
        await prisma.appEvent.create({
          data: { type: DRIVING_TIMES_NOTICE_EVENT, userId: m.userId, metadata: { orgId: m.orgId } },
        });
        sent++;
        console.log(`  sent ${m.user.email}`);
      } catch (err) {
        failed++;
        console.error(`  FAILED ${m.user.email}: ${err?.message ?? err}`);
      }
    }
    console.log(`\nSent ${sent}, failed ${failed}.`);
  }
} finally {
  await prisma.$disconnect();
}
