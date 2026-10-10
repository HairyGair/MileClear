// READ-ONLY support lookup: everything needed to answer a driver, in one go.
// Run on the server (the local .env is production too, but reads from this
// Mac are blocked; the server is the reliable place):
//
//   ssh mileclear@85.234.151.224 'cd ~/mileclear-app/apps/api && \
//     node --env-file=/home/mileclear/mileclear-app/.env scripts/support-lookup.mjs <who> [days]'
//
// <who> is an email (or part of one), a name, or a user id (or its first 8
// characters). [days] is how far back to show trips and events (default 7).
// Nothing here writes: findMany / findUnique / count only. Fields are selected
// explicitly because the local schema can run ahead of production.

import { PrismaClient } from "@prisma/client";

const who = process.argv[2];
const days = Number(process.argv[3] ?? 7) || 7;
if (!who) {
  console.log("usage: support-lookup.mjs <email|name|userId> [days]");
  process.exit(1);
}

const p = new PrismaClient();
const uk = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
const ukDay = (d) =>
  new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "2-digit", month: "2-digit" });

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  fullName: true,
  createdAt: true,
  isPremium: true,
  premiumExpiresAt: true,
  subscriptionProductId: true,
  workType: true,
  employerMileageRatePence: true,
  dashboardMode: true,
  appVersion: true,
  buildNumber: true,
  bgLocationPermission: true,
  notificationPermission: true,
  lastHeartbeatAt: true,
  lastTripAt: true,
  notes: true,
};

const isId = /^[0-9a-f]{8}(-[0-9a-f-]{0,28})?$/i.test(who);
const users = await p.user.findMany({
  where: isId
    ? { id: { startsWith: who.toLowerCase() } }
    : { OR: [{ email: { contains: who } }, { displayName: { contains: who } }, { fullName: { contains: who } }] },
  select: userSelect,
  take: 10,
});

if (users.length === 0) {
  console.log(`No user matches "${who}".`);
  await p.$disconnect();
  process.exit(0);
}
if (users.length > 1) {
  console.log(`${users.length} users match "${who}"; run again with one id:`);
  for (const u of users) console.log(`  ${u.id}  ${u.email}  ${u.displayName ?? ""}  joined ${u.createdAt.toISOString().slice(0, 10)}`);
  await p.$disconnect();
  process.exit(0);
}

const u = users[0];
const since = new Date(Date.now() - days * 86_400_000);
const premiumNow = u.isPremium && (!u.premiumExpiresAt || u.premiumExpiresAt > new Date());

const [vehicles, tripCount, trips, events, dump, shifts] = await Promise.all([
  p.vehicle.findMany({ where: { userId: u.id }, select: { make: true, model: true, fuelType: true, vehicleType: true, isPrimary: true } }),
  p.trip.count({ where: { userId: u.id } }),
  p.trip.findMany({
    where: { userId: u.id, startedAt: { gte: since } },
    select: {
      id: true, startedAt: true, endedAt: true, createdAt: true, distanceMiles: true, isManualEntry: true,
      classification: true, platformTag: true, shiftId: true, startAddress: true, endAddress: true,
    },
    orderBy: { startedAt: "asc" },
  }),
  p.appEvent.findMany({
    where: { userId: u.id, createdAt: { gte: since }, NOT: { type: "screen.viewed" } },
    select: { type: true, metadata: true, buildNumber: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 400,
  }),
  p.diagnosticDump.findUnique({
    where: { userId: u.id },
    select: { capturedAt: true, platform: true, osVersion: true, appVersion: true, buildNumber: true, verdict: true, statusJson: true, eventsJson: true },
  }),
  p.shift.findMany({ where: { userId: u.id, startedAt: { gte: since } }, select: { startedAt: true, endedAt: true, status: true }, orderBy: { startedAt: "asc" } }),
]);

console.log(`== ${u.displayName ?? "(no name)"}  ${u.email}`);
console.log(`id ${u.id}  joined ${uk(u.createdAt)}`);
console.log(
  `plan: ${premiumNow ? "PRO" : "free"}${u.premiumExpiresAt ? ` (expires ${uk(u.premiumExpiresAt)})` : ""}${u.subscriptionProductId ? ` ${u.subscriptionProductId}` : ""}`
);
console.log(
  `work: ${u.workType}${u.employerMileageRatePence != null ? ` employer ${u.employerMileageRatePence}p/mi` : ""}  mode ${u.dashboardMode}`
);
console.log(
  `app ${u.appVersion ?? "?"} (${u.buildNumber ?? "?"})  location ${u.bgLocationPermission ?? "?"}  notifications ${u.notificationPermission ?? "?"}  last heartbeat ${uk(u.lastHeartbeatAt)}`
);
console.log(`vehicles: ${vehicles.map((v) => `${v.make} ${v.model} ${v.fuelType}${v.isPrimary ? " (primary)" : ""}`).join("; ") || "none"}`);
console.log(`trips ever: ${tripCount}  last trip ${uk(u.lastTripAt)}`);
if (u.notes) console.log(`notes: ${u.notes}`);

if (dump) {
  let s = {};
  let ev = [];
  try { s = typeof dump.statusJson === "string" ? JSON.parse(dump.statusJson) : dump.statusJson ?? {}; } catch {}
  try { ev = typeof dump.eventsJson === "string" ? JSON.parse(dump.eventsJson) : dump.eventsJson ?? []; } catch {}
  const bs = s.device?.batterySeries ?? [];
  const lpm = bs.length ? Math.round((100 * bs.filter((r) => r[3] === 1).length) / bs.length) : null;
  const starts = ev.filter((e) => e.event === "native_recording_started").map((e) => { try { return JSON.parse(e.data).reason; } catch { return "?"; } });
  console.log(
    `\nphone report ${uk(dump.capturedAt)}: ${dump.platform} ${dump.osVersion} app ${dump.appVersion} (${dump.buildNumber}) verdict ${dump.verdict}`
  );
  console.log(
    `  automatic trips ${s.enabled}  background ${s.backgroundPermission}  motion ${s.motionPermission}  low power now ${s.device?.lowPowerMode}${lpm != null ? ` (on ${lpm}% of samples)` : ""}  battery ${s.device?.batteryLevel != null ? Math.round(s.device.batteryLevel * 100) + "%" : "?"}`
  );
  if (starts.length) console.log(`  recordings started: ${starts.length} (${starts.filter((r) => r === "speed").length} only once up to speed)`);
}

console.log(`\nTRIPS, last ${days} days (UK time)`);
const byDay = new Map();
for (const t of trips) {
  const k = ukDay(t.startedAt);
  const v = byDay.get(k) ?? { auto: 0, added: 0, n: 0 };
  if (t.isManualEntry) v.added += t.distanceMiles; else v.auto += t.distanceMiles;
  v.n++;
  byDay.set(k, v);
}
for (const [k, v] of byDay) console.log(`  ${k}: recorded ${v.auto.toFixed(1)} mi, added by hand ${v.added.toFixed(1)} mi, ${v.n} trips`);
for (const t of trips) {
  const lagMin = t.endedAt ? Math.round((t.createdAt - t.endedAt) / 60000) : null;
  console.log(
    `  ${uk(t.startedAt)}-${t.endedAt ? uk(t.endedAt).slice(-5) : "?"} ${t.distanceMiles.toFixed(2)} mi ${t.isManualEntry ? "ADDED" : "auto"} ${t.classification}${t.shiftId ? " shift" : ""}${lagMin != null && lagMin > 30 ? ` (saved ${lagMin} min after it ended)` : ""}  ${(t.startAddress ?? "").slice(0, 30)} > ${(t.endAddress ?? "").slice(0, 30)}  ${t.id.slice(0, 8)}`
  );
}
if (shifts.length) {
  console.log(`\nSHIFTS`);
  for (const s of shifts) console.log(`  ${uk(s.startedAt)} -> ${s.endedAt ? uk(s.endedAt).slice(-5) : "open"} ${s.status}`);
}

console.log(`\nEVENTS, last ${days} days (screen views left out)`);
for (const e of events) console.log(`  ${uk(e.createdAt)} ${e.type} ${e.metadata ? JSON.stringify(e.metadata).slice(0, 140) : ""}`);

await p.$disconnect();
