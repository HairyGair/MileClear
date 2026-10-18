// READ-ONLY. Do the retention emails bring drivers back? (18 Oct 2026)
// For week one, gone quiet and win-back: of the drivers emailed vs the 1 in 10
// held back (event metadata held: true), how many recorded a trip in the 14
// days after. Only events at least 14 days old count, so every driver has had
// the full window. A difference is only worth reading once each held group has
// a few dozen people; until then the script says so.
// Run on the server from ~/mileclear-app/apps/api:
//   node --env-file=/home/mileclear/mileclear-app/.env scripts/retention-email-effect.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const WINDOW = 14 * DAY;
const cutoff = new Date(Date.now() - WINDOW);
const TYPES = [
  ["email.week_one_sent", "Week one"],
  ["email.gone_quiet_sent", "Gone quiet"],
  ["email.win_back_sent", "Win-back"],
];
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : "-");

for (const [type, label] of TYPES) {
  const events = await prisma.appEvent.findMany({
    where: { type, createdAt: { lte: cutoff }, userId: { not: null } },
    select: { userId: true, createdAt: true, metadata: true },
  });
  const pending = await prisma.appEvent.count({ where: { type, createdAt: { gt: cutoff } } });
  const groups = new Map();
  for (const e of events) {
    const m = e.metadata ?? {};
    const key = `${m.held ? "held back" : "emailed"}${m.group ? ` (${m.group})` : ""}`;
    const trip = await prisma.trip.findFirst({
      where: { userId: e.userId, isPhantomTrip: false, startedAt: { gt: e.createdAt, lte: new Date(e.createdAt.getTime() + WINDOW) } },
      select: { id: true },
    });
    const g = groups.get(key) ?? { n: 0, back: 0 };
    g.n += 1;
    if (trip) g.back += 1;
    groups.set(key, g);
  }
  console.log(`\n=== ${label}: ${events.length} with a full 14 days, ${pending} still inside it`);
  for (const [key, g] of [...groups].sort()) {
    console.log(`  ${key.padEnd(24)} ${String(g.n).padStart(5)}   recorded again within 14 days: ${g.back} (${pct(g.back, g.n)})`);
  }
  const held = [...groups].filter(([k]) => k.startsWith("held")).reduce((s, [, g]) => s + g.n, 0);
  if (held < 30) console.log(`  (only ${held} held back so far: too few to read a difference yet)`);
}

// Why drivers stopped: one-tap answers from the win-back email (latest per driver).
const answers = await prisma.appEvent.findMany({
  where: { type: "winback.reason" },
  select: { userId: true, createdAt: true, metadata: true },
  orderBy: { createdAt: "asc" },
});
const latestBy = new Map();
for (const a of answers) latestBy.set(a.userId, a.metadata ?? {});
const tally = new Map();
for (const m of latestBy.values()) {
  const k = `${m.group ?? "?"}: ${m.reason ?? "?"}`;
  tally.set(k, (tally.get(k) ?? 0) + 1);
}
console.log(`\n=== Why they stopped (win-back one-tap answers): ${latestBy.size} drivers`);
for (const [k, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(32)} ${n}`);
const deleted = await prisma.appEvent.count({ where: { type: "push.device_unregistered", createdAt: { gte: new Date(Date.now() - 30 * DAY) } } });
console.log(`\nApp removals spotted from push in the last 30 days: ${deleted}`);
await prisma.$disconnect();
