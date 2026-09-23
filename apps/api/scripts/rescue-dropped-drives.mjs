// Rescue real drives that the old walk rule (and the walking-shape phantom
// guard) threw away.
//
// Those drops were offered back as "journeys to check" (missed_journey_proposals,
// source dropped_walk / dropped_phantom), but most drivers never open that list.
// A dry run on 23 Sep 2026 found open offers averaging 12-46 mph: drives, not
// walks. This finds every such open offer and sends each driver ONE push that
// names their biggest lost drive and opens the Trips screen, where "Journeys to
// check" sits at the top.
//
// Selection: status "proposed", source dropped_walk or dropped_phantom, the
// recording lasted at least 60 s, and recordedMiles / duration >= 12 mph.
// Offers already covered by a saved trip are skipped.
//
// Dry run by default: prints who would get what and never writes. With APPLY=1
// it sends the pushes and logs one app_event "support.rescue_push_sent" per
// send. A driver who already has that event is skipped, so a rerun never sends
// twice. Drivers with no push token are listed for a manual email.
//
// Run ON the server from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/rescue-dropped-drives.mjs
//   APPLY=1 node --env-file=/home/mileclear/mileclear-app/.env scripts/rescue-dropped-drives.mjs

import { PrismaClient } from "@prisma/client";

const APPLY = process.env.APPLY === "1";
const MIN_MPH = 12;
// Two minutes, not one: Anthony, 23 Sep 2026, left out the two shortest (0.5 mi in
// 1.6 min and 0.4 mi in 1.8 min) as the least certain to be real drives.
const MIN_SECONDS = 120;
const SOURCES = ["dropped_walk", "dropped_phantom"];
const EVENT_TYPE = "support.rescue_push_sent";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
// Same caps as GET /trips/missed-journeys and MissedJourneys.tsx, used only
// to report where the offer sits (past 3 it is behind "show more"; the API
// serves only the 20 newest, so an old offer can fall off the list entirely).
const API_MAX_RESULTS = 20;
const CLIENT_PAGE_SIZE = 3;
const CLIENT_DROPPED = new Set(["recorded", "dropped_walk", "dropped_phantom"]);
const PLACEHOLDER_EMAIL_SUFFIX = "@private.mileclear.com";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run with --env-file on the server.");
  process.exit(1);
}
const prisma = new PrismaClient();

// Built from parts: recent ICU prints September as "Sept".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ukDay = (d) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "numeric",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${parts.weekday} ${parts.day} ${MONTHS[Number(parts.month) - 1]}`;
};
const ukDateTime = (d) =>
  d.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const oneDp = (n) => (Math.round(n * 10) / 10).toFixed(1);

// The push quotes what was actually RECORDED, never the road-priced offer:
// the card's figure is a route between the two recorded points and can run
// well above the trace (one offer: 7.6 recorded, 14.2 offered).
function pushText(drives) {
  const top = drives[0];
  const miles = oneDp(top.recordedMiles);
  const day = ukDay(top.departedAt);
  const rest = drives.length - 1;
  const title = "A drive wasn't saved";
  const body =
    rest === 0
      ? `We found a ${miles}-mile drive on ${day} that wasn't saved. Tap to add it to your mileage.`
      : `We found a ${miles}-mile drive on ${day} that wasn't saved, and ${rest} more. Tap to add ${rest === 1 ? "both" : "them"} to your mileage.`;
  return { title, body };
}

async function main() {
  const proposals = await prisma.missedJourneyProposal.findMany({
    where: { status: "proposed", source: { in: SOURCES }, recordedMiles: { not: null } },
    select: {
      id: true,
      userId: true,
      source: true,
      departedAt: true,
      arrivedAt: true,
      recordedMiles: true,
      estimatedMiles: true,
      createdAt: true,
    },
  });

  const fast = [];
  for (const p of proposals) {
    const seconds = (p.arrivedAt.getTime() - p.departedAt.getTime()) / 1000;
    if (seconds < MIN_SECONDS) continue;
    const mph = p.recordedMiles / (seconds / 3600);
    if (mph < MIN_MPH) continue;
    fast.push({ ...p, seconds, mph });
  }

  const userIds = [...new Set(fast.map((p) => p.userId))];
  if (userIds.length === 0) {
    console.log("No open dropped drives at or above the threshold.");
    return;
  }

  const [users, offeredEvents, sentEvents] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        displayName: true,
        email: true,
        pushToken: true,
        platformsSeen: true,
        signupPlatform: true,
        buildNumber: true,
      },
    }),
    prisma.appEvent.findMany({
      where: { type: "trip.discarded_recording_offered", userId: { in: userIds } },
      select: { userId: true, createdAt: true, metadata: true },
    }),
    prisma.appEvent.findMany({
      where: { type: EVENT_TYPE, userId: { in: userIds } },
      select: { userId: true, createdAt: true },
    }),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const alreadySent = new Set(sentEvents.map((e) => e.userId));

  // Walk reason: the offered event logged within 120 s of the row's creation
  // with the same recordedMiles.
  function walkReasonFor(p) {
    let best = null;
    for (const e of offeredEvents) {
      if (e.userId !== p.userId) continue;
      const dt = Math.abs(e.createdAt.getTime() - p.createdAt.getTime());
      if (dt > 120_000) continue;
      const m = e.metadata ?? {};
      if (typeof m.recordedMiles !== "number" || Math.abs(m.recordedMiles - p.recordedMiles) > 1e-6) continue;
      if (!best || dt < best.dt) best = { dt, reason: m.walkReason ?? null };
    }
    return best ? best.reason : "(no event)";
  }

  // Where the offer sits in the list the app shows: the API returns the 20
  // newest open offers by arrivedAt, the app then puts dropped recordings
  // after the rest and shows 3 before "show more".
  const openAll = await prisma.missedJourneyProposal.findMany({
    where: { userId: { in: userIds }, status: "proposed" },
    select: { id: true, userId: true, source: true, arrivedAt: true },
    orderBy: { arrivedAt: "desc" },
  });
  const positionById = new Map();
  for (const uid of userIds) {
    const served = openAll.filter((r) => r.userId === uid).slice(0, API_MAX_RESULTS);
    const ordered = [
      ...served.filter((r) => !CLIENT_DROPPED.has(r.source)),
      ...served.filter((r) => CLIENT_DROPPED.has(r.source)),
    ];
    ordered.forEach((r, i) => positionById.set(r.id, i + 1));
  }

  const byUser = new Map();
  let coveredCount = 0;
  for (const p of fast) {
    const covered = await prisma.trip.findFirst({
      where: {
        userId: p.userId,
        isPhantomTrip: false,
        startedAt: { lte: p.arrivedAt },
        OR: [{ endedAt: { gte: p.departedAt } }, { endedAt: null }],
      },
      select: { id: true },
    });
    if (covered) {
      coveredCount++;
      continue;
    }
    p.walkReason = walkReasonFor(p);
    p.position = positionById.get(p.id) ?? null;
    const list = byUser.get(p.userId) ?? [];
    list.push(p);
    byUser.set(p.userId, list);
  }

  const groups = [...byUser.entries()]
    .map(([uid, drives]) => {
      drives.sort((a, b) => b.recordedMiles - a.recordedMiles);
      return { user: userById.get(uid), drives };
    })
    .sort((a, b) => b.drives[0].recordedMiles - a.drives[0].recordedMiles);

  console.log(
    `${APPLY ? "APPLY" : "DRY RUN"}: ${fast.length} open offers >= ${MIN_MPH} mph and >= ${MIN_SECONDS} s ` +
      `(of ${proposals.length} open ${SOURCES.join("/")}), ${coveredCount} already covered by a trip, ` +
      `${groups.length} drivers.\n`,
  );

  const toPush = [];
  const toEmail = [];
  for (const g of groups) {
    const u = g.user;
    const total = g.drives.reduce((s, d) => s + d.recordedMiles, 0);
    const platform = u.platformsSeen ?? u.signupPlatform ?? "?";
    console.log(
      `${u.id.slice(0, 8)}  ${u.displayName ?? "(no name)"}  <${u.email}>  platform=${platform}  ` +
        `build=${u.buildNumber ?? "?"}  push=${u.pushToken ? "yes" : "NO"}  ` +
        `${g.drives.length} drive(s), ${oneDp(total)} mi recorded` +
        (alreadySent.has(u.id) ? "  [ALREADY SENT, skipped]" : ""),
    );
    for (const d of g.drives) {
      const mins = oneDp(d.seconds / 60);
      console.log(
        `    ${ukDateTime(d.departedAt)}  ${d.source}  recorded ${oneDp(d.recordedMiles)} mi, ` +
          `offered ${oneDp(d.estimatedMiles)} mi, ${mins} min, ${Math.round(d.mph)} mph, ` +
          `walkReason=${d.walkReason ?? "null"}, list position ${d.position ?? "beyond 20"}`,
      );
    }
    if (alreadySent.has(u.id)) continue;
    const text = pushText(g.drives);
    if (u.pushToken) {
      console.log(`    push: "${text.title}" / "${text.body}"`);
      toPush.push({ user: u, drives: g.drives, text });
    } else {
      const reachable = !u.email.endsWith(PLACEHOLDER_EMAIL_SUFFIX);
      console.log(`    no push token: ${reachable ? "email by hand" : "UNREACHABLE (placeholder email)"}`);
      toEmail.push({ user: u, drives: g.drives, reachable });
    }
    console.log("");
  }

  console.log(`Would push: ${toPush.length}. Manual email: ${toEmail.length}.`);
  if (toEmail.length) {
    console.log("\nManual email list:");
    for (const e of toEmail) {
      const top = e.drives[0];
      console.log(
        `  ${e.user.id.slice(0, 8)}  ${e.user.displayName ?? "(no name)"}  <${e.user.email}>  ` +
          `${oneDp(top.recordedMiles)} mi on ${ukDay(top.departedAt)}` +
          (e.drives.length > 1 ? ` + ${e.drives.length - 1} more` : "") +
          (e.reachable ? "" : "  (placeholder email, cannot be reached)"),
      );
    }
  }

  if (!APPLY) {
    console.log("\nDry run. Nothing sent. Rerun with APPLY=1 to send.");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const t of toPush) {
    // Re-check right before sending, in case another run got there first.
    const prior = await prisma.appEvent.findFirst({
      where: { type: EVENT_TYPE, userId: t.user.id },
      select: { id: true },
    });
    if (prior) {
      console.log(`skip ${t.user.id.slice(0, 8)}: already sent`);
      continue;
    }
    let ticket = null;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          to: t.user.pushToken,
          title: t.text.title,
          body: t.text.body,
          sound: "default",
          data: { action: "open_trips" },
        }),
      });
      ticket = res.ok ? (await res.json()).data ?? null : { status: "error", message: `http_${res.status}` };
    } catch (err) {
      ticket = { status: "error", message: String(err?.message ?? err) };
    }
    const status = ticket?.status ?? "no_ticket";
    if (status === "ok") ok++;
    else failed++;
    // Logged whatever the outcome, so a rerun never pages the same driver twice.
    await prisma.appEvent.create({
      data: {
        type: EVENT_TYPE,
        userId: t.user.id,
        metadata: {
          proposalIds: t.drives.map((d) => d.id),
          topMiles: Math.round(t.drives[0].recordedMiles * 10) / 10,
          body: t.text.body,
          ticketStatus: status,
          ticketMessage: ticket?.message ?? ticket?.details?.error ?? null,
        },
      },
    });
    console.log(`${status === "ok" ? "sent" : "FAILED"} ${t.user.id.slice(0, 8)}: ${status}`);
  }
  console.log(`\nDone. Sent ${ok}, failed ${failed}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
