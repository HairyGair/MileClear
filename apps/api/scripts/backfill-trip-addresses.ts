/**
 * Give a name back to trips that were saved without one.
 *
 * A trip with BOTH addresses null draws no route line in the trips list, so a
 * captured drive shows as a bare distance and time. Users read that as a
 * missing trip: in the week to 15 Aug 2026 there were 96 such trips across 33
 * users, and six of the people who filed missing-trip reports that week had
 * one. Hanson reported his twice, then tried to re-enter it by hand while it
 * was already saved.
 *
 * New trips are filled at create time. This is for the ones already stored.
 *
 * Dry run by default. Pass --commit to write.
 *
 *   node --env-file=/home/mileclear/mileclear-app/.env \
 *     dist/scripts/backfill-trip-addresses.js [--commit] [--days=30] [--limit=N]
 */
import { prisma } from "../src/lib/prisma.js";
import { reverseGeocode } from "../src/services/geocoding.js";

const COMMIT = process.argv.includes("--commit");
const arg = (name: string, fallback: number) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? parseInt(a.split("=")[1], 10) : fallback;
};
const DAYS = arg("days", 30);
const LIMIT = arg("limit", 500);

/** Nominatim asks for at most one request a second. Two lookups per trip. */
const PAUSE_MS = 1100;

async function main() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  const trips = await prisma.trip.findMany({
    where: {
      isPhantomTrip: false,
      startAddress: null,
      endAddress: null,
      createdAt: { gte: since },
      // 0,0 is the "no coordinates" sentinel; reverse-geocoding it lands in
      // the Atlantic, which is worse than showing nothing.
      NOT: [{ startLat: 0, startLng: 0 }],
    },
    select: {
      id: true, userId: true, startLat: true, startLng: true,
      endLat: true, endLng: true, distanceMiles: true, startedAt: true,
      classification: true,
    },
    orderBy: { startedAt: "desc" },
    take: LIMIT,
  });

  console.log(
    `${trips.length} trips with no address in the last ${DAYS} days ` +
    `(${COMMIT ? "WRITING" : "dry run"})\n`
  );

  let filled = 0;
  let unresolved = 0;

  for (const t of trips) {
    const [start, end] = await Promise.all([
      reverseGeocode(t.startLat, t.startLng),
      t.endLat != null && t.endLng != null
        ? reverseGeocode(t.endLat, t.endLng)
        : Promise.resolve(null),
    ]);

    if (!start && !end) {
      unresolved++;
      console.log(`  ?? ${t.id.slice(0, 8)} ${t.distanceMiles.toFixed(2)}mi — neither end resolved`);
      await new Promise((r) => setTimeout(r, PAUSE_MS));
      continue;
    }

    filled++;
    console.log(
      `  ${COMMIT ? "fill" : "would fill"} ${t.id.slice(0, 8)} ` +
      `${t.startedAt.toISOString().slice(0, 16)} ${t.distanceMiles.toFixed(2)}mi ${t.classification}\n` +
      `       ${start ?? "(start unresolved)"}  ->  ${end ?? "(end unresolved)"}`
    );

    if (COMMIT) {
      await prisma.trip.update({
        where: { id: t.id },
        data: {
          ...(start ? { startAddress: start } : {}),
          ...(end ? { endAddress: end } : {}),
        },
      });
    }
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  }

  console.log(
    `\n${COMMIT ? "Filled" : "Would fill"} ${filled}. Unresolved: ${unresolved}.`
  );
  if (!COMMIT) console.log("DRY RUN - pass --commit to write.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
