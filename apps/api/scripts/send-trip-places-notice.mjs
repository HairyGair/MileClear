// Tell existing Milesheet drivers that their manager's trip list will now
// show where each business trip started and ended (street, area and
// postcode, never a house number).
//
// Nov 2026. The trip list (format=trips-csv and the PDF's Business trips
// section) only shows From and To for a driver once that driver has been
// told: a team.trip_places_notice event { orgId } for that team. The web
// invite page records it when a driver accepts after seeing the consent
// line; everyone else is told by this script, which emails them and then
// records the event. Drivers who already have it for their team are
// skipped, so the script is safe to run again.
//
// DRY RUN BY DEFAULT. Nothing is sent or written without --send.
// Optional --org=<orgId> to act on one team only.
//
// Needs a build (reads the email from dist/). Run ON the server from
// ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/send-trip-places-notice.mjs --org=<id>
//   node --env-file=... scripts/send-trip-places-notice.mjs --org=<id> --send

import { PrismaClient } from "@prisma/client";
import { openSync, closeSync, unlinkSync } from "node:fs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with --env-file on the server.");
  process.exit(1);
}

const SEND = process.argv.includes("--send");
const ORG_ID = process.argv.find((a) => a.startsWith("--org="))?.slice("--org=".length) || null;
const EVENT = "team.trip_places_notice";

// One run at a time: two --send runs at once would email drivers twice
// (9 Oct 2026). The lock file is created exclusively and removed at the end.
const LOCK = "/tmp/mileclear-trip-places-notice.lock";
let lockFd = null;
if (SEND) {
  try {
    lockFd = openSync(LOCK, "wx");
  } catch {
    console.error(`Another run holds ${LOCK}. If no run is going, delete it and try again.`);
    process.exit(1);
  }
}

const prisma = new PrismaClient();

try {
  const memberships = await prisma.orgMembership.findMany({
    where: { role: "driver", status: "active", userId: { not: null }, ...(ORG_ID ? { orgId: ORG_ID } : {}) },
    select: { orgId: true, userId: true, org: { select: { name: true } }, user: { select: { email: true, displayName: true } } },
    orderBy: [{ orgId: "asc" }],
  });
  const notices = memberships.length
    ? await prisma.appEvent.findMany({
        where: { type: EVENT, userId: { in: memberships.map((m) => m.userId) } },
        select: { userId: true, metadata: true },
      })
    : [];
  const told = (m) => notices.some((n) => n.userId === m.userId && n.metadata?.orgId === m.orgId);
  const due = memberships.filter((m) => m.user && !told(m));

  console.log(`${SEND ? "SENDING" : "DRY RUN"}: ${due.length} of ${memberships.length} active team drivers have not been told yet.`);
  for (const m of due) console.log(`  ${m.org.name}: ${m.user.displayName ?? "(no name)"} <${m.user.email}>`);

  if (!SEND) {
    console.log("\nNothing sent. Run again with --send to email these drivers.");
  } else {
    const env = process.env;
    if (!env.RESEND_API_KEY && !env.BREVO_API_KEY && !(env.BREVO_SMTP_USER && env.BREVO_SMTP_KEY)) {
      process.exitCode = 1;
      throw new Error("No email transport configured. Refusing to send.");
    }
    const { sendTripPlacesNoticeEmail } = await import("../dist/services/email.js");
    let sent = 0;
    let failed = 0;
    for (const m of due) {
      try {
        const delivered = await sendTripPlacesNoticeEmail(m.user.email, m.user.displayName, m.org.name);
        if (delivered !== true) throw new Error("not sent (no mail transport)");
        // Only after a confirmed send, so a failed send keeps places hidden.
        await prisma.appEvent.create({ data: { type: EVENT, userId: m.userId, metadata: { orgId: m.orgId } } });
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
  if (lockFd !== null) {
    closeSync(lockFd);
    unlinkSync(LOCK);
  }
}
