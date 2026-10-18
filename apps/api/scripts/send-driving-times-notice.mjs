// Tell existing Milesheet drivers that their manager can now see their
// driving times (first business drive to last business drive each day).
//
// Oct 2026. The portal and the payroll file only show a driver's times once
// that driver has been told: either they joined their team after the consent
// line went live (DRIVING_TIMES_NOTICE_FROM in src/services/drivingTimes.ts),
// or this script has emailed them and recorded a team.driving_times_notice
// event { orgId } for them. Drivers who are already told are skipped, so the
// script is safe to run again.
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

const { isDriverToldAboutTimes, DRIVING_TIMES_NOTICE_EVENT } = await import("../dist/services/drivingTimes.js");

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
      org: { select: { name: true } },
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
  const noticed = new Set(notices.map((n) => `${n.userId}:${n.metadata?.orgId ?? ""}`));

  const due = memberships.filter(
    (m) => m.user && !isDriverToldAboutTimes(m, noticed.has(`${m.userId}:${m.orgId}`))
  );

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
      const joined = m.acceptedAt ? m.acceptedAt.toISOString().slice(0, 10) : "unknown";
      console.log(`  ${m.user.displayName ?? "(no name)"} <${m.user.email}> joined ${joined}`);
    }
  }

  if (!SEND) {
    console.log("\nNothing sent. Run again with --send to email these drivers.");
  } else {
    // With no mail transport, deliver() only logs, and recording the event
    // would then unlock times for drivers who were never emailed.
    if (!process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY && !process.env.BREVO_SMTP_KEY) {
      console.error("No email transport configured (RESEND_API_KEY / BREVO_*). Refusing to send.");
      process.exitCode = 1;
      throw new Error("no email transport");
    }
    const { sendDrivingTimesNoticeEmail } = await import("../dist/services/email.js");
    const fromDate = new Date();
    let sent = 0;
    let failed = 0;
    for (const m of due) {
      try {
        await sendDrivingTimesNoticeEmail(m.user.email, m.user.displayName, m.org.name, fromDate, m.userId);
        // Recorded only after the email went, so a failed send leaves the
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
