// Reseed the App Review demo account (demo@mileclear.com) to a clean, recent,
// canonical dataset. Idempotent — safe to re-run before any submission.
//
// Run: cd apps/api && npx tsx --env-file=../../.env scripts/reseed-demo.ts
//
// Profile: userIntent/workType "both", Pro, employer rate 40p/25p, other
// income £50k. Data: 18 trips (mixed business/personal incl. a freelance tag),
// 6 earnings, 2 fuel logs, 2 saved locations — all dated within the last ~12
// days so a reviewer always sees fresh activity.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_EMAIL = "demo@mileclear.com";
const DAY = 86_400_000;

function at(daysAgo: number, hour: number, minute = 0): Date {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Named points around Sunderland / Newcastle.
const P = {
  home: { lat: 54.9063, lng: -1.3835, name: "Home, Sunderland" },
  centre: { lat: 54.9069, lng: -1.3838, name: "Sunderland City Centre" },
  retail: { lat: 54.9142, lng: -1.4103, name: "The Bridges Retail Park" },
  newcastle: { lat: 54.9783, lng: -1.6178, name: "Newcastle City Centre" },
  quayside: { lat: 54.9698, lng: -1.6, name: "Newcastle Quayside" },
  airport: { lat: 55.0375, lng: -1.6916, name: "Newcastle Airport" },
  gym: { lat: 54.9005, lng: -1.4005, name: "PureGym Sunderland" },
  tesco: { lat: 54.9121, lng: -1.4, name: "Tesco Extra" },
};

type Pt = { lat: number; lng: number; name: string };
interface TripSpec {
  daysAgo: number;
  hour: number;
  durationMin: number;
  miles: number;
  classification: "business" | "personal";
  platformTag: string | null;
  from: Pt;
  to: Pt;
}

const TRIPS: TripSpec[] = [
  { daysAgo: 0, hour: 8, durationMin: 22, miles: 7.4, classification: "business", platformTag: "uber", from: P.home, to: P.newcastle },
  { daysAgo: 0, hour: 12, durationMin: 14, miles: 3.1, classification: "business", platformTag: "deliveroo", from: P.newcastle, to: P.quayside },
  { daysAgo: 1, hour: 9, durationMin: 28, miles: 9.2, classification: "business", platformTag: "amazon_flex", from: P.home, to: P.airport },
  { daysAgo: 1, hour: 18, durationMin: 12, miles: 2.6, classification: "personal", platformTag: null, from: P.home, to: P.gym },
  { daysAgo: 2, hour: 11, durationMin: 19, miles: 5.8, classification: "business", platformTag: "just_eat", from: P.centre, to: P.retail },
  { daysAgo: 2, hour: 13, durationMin: 16, miles: 4.3, classification: "business", platformTag: "stuart", from: P.retail, to: P.centre },
  { daysAgo: 3, hour: 10, durationMin: 31, miles: 10.7, classification: "business", platformTag: "freelance", from: P.home, to: P.newcastle },
  { daysAgo: 3, hour: 16, durationMin: 9, miles: 1.8, classification: "personal", platformTag: null, from: P.home, to: P.tesco },
  { daysAgo: 4, hour: 8, durationMin: 24, miles: 8.1, classification: "business", platformTag: "uber", from: P.home, to: P.newcastle },
  { daysAgo: 4, hour: 19, durationMin: 13, miles: 3.4, classification: "business", platformTag: "deliveroo", from: P.newcastle, to: P.centre },
  { daysAgo: 5, hour: 9, durationMin: 21, miles: 6.9, classification: "business", platformTag: "just_eat", from: P.home, to: P.retail },
  { daysAgo: 6, hour: 12, durationMin: 27, miles: 9.6, classification: "business", platformTag: "amazon_flex", from: P.home, to: P.airport },
  { daysAgo: 6, hour: 17, durationMin: 11, miles: 2.3, classification: "personal", platformTag: null, from: P.gym, to: P.home },
  { daysAgo: 7, hour: 10, durationMin: 18, miles: 5.2, classification: "business", platformTag: "stuart", from: P.centre, to: P.quayside },
  { daysAgo: 8, hour: 8, durationMin: 23, miles: 7.7, classification: "business", platformTag: "uber", from: P.home, to: P.newcastle },
  { daysAgo: 9, hour: 14, durationMin: 15, miles: 4.0, classification: "personal", platformTag: null, from: P.home, to: P.tesco },
  { daysAgo: 10, hour: 11, durationMin: 29, miles: 10.1, classification: "business", platformTag: "freelance", from: P.home, to: P.newcastle },
  { daysAgo: 11, hour: 9, durationMin: 20, miles: 6.4, classification: "business", platformTag: "deliveroo", from: P.home, to: P.retail },
];

async function main() {
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) throw new Error(`Demo user ${DEMO_EMAIL} not found`);
  const userId = user.id;

  // 1. Profile — canonical "both" Pro driver with employer rate + other income.
  await prisma.user.update({
    where: { id: userId },
    data: {
      displayName: "Demo",
      fullName: "Demo Driver",
      emailVerified: true,
      isPremium: true,
      premiumExpiresAt: new Date(Date.now() + 365 * DAY),
      userIntent: "both",
      workType: "both",
      dashboardMode: "both",
      employerMileageRatePence: 40,
      employerMileageRatePenceAfter10k: 25,
      otherAnnualIncomePence: 5_000_000, // £50,000
      weeklyEarningsGoalPence: 50_000, // £500
    },
  });

  // 2. Wipe existing data (trips cascade to coordinates). Keep the vehicle.
  await prisma.trip.deleteMany({ where: { userId } });
  await prisma.shift.deleteMany({ where: { userId } });
  await prisma.earning.deleteMany({ where: { userId } });
  await prisma.fuelLog.deleteMany({ where: { userId } });
  await prisma.savedLocation.deleteMany({ where: { userId } });

  // 3. Primary vehicle (reuse if present, else create a Prius).
  let vehicle = await prisma.vehicle.findFirst({ where: { userId, isPrimary: true } });
  if (!vehicle) {
    vehicle = await prisma.vehicle.create({
      data: {
        userId,
        make: "Toyota",
        model: "Prius",
        year: 2021,
        fuelType: "hybrid",
        vehicleType: "car",
        registrationPlate: "MC21 DEM",
        estimatedMpg: 60,
        isPrimary: true,
      },
    });
  }

  // 4. Trips.
  let lastTripAt = new Date(0);
  for (const t of TRIPS) {
    const startedAt = at(t.daysAgo, t.hour);
    const endedAt = new Date(startedAt.getTime() + t.durationMin * 60_000);
    if (endedAt > lastTripAt) lastTripAt = endedAt;
    await prisma.trip.create({
      data: {
        userId,
        vehicleId: vehicle.id,
        startLat: t.from.lat,
        startLng: t.from.lng,
        endLat: t.to.lat,
        endLng: t.to.lng,
        startAddress: t.from.name,
        endAddress: t.to.name,
        distanceMiles: t.miles,
        startedAt,
        endedAt,
        isManualEntry: false,
        classification: t.classification,
        platformTag: t.platformTag,
        syncedAt: endedAt,
      },
    });
  }

  // 5. Earnings — one per platform, recent weekly periods.
  const earnings: Array<{ platform: string; pounds: number; daysAgo: number }> = [
    { platform: "uber", pounds: 142.5, daysAgo: 1 },
    { platform: "deliveroo", pounds: 88.2, daysAgo: 2 },
    { platform: "just_eat", pounds: 64.75, daysAgo: 3 },
    { platform: "amazon_flex", pounds: 96.0, daysAgo: 5 },
    { platform: "stuart", pounds: 51.4, daysAgo: 6 },
    { platform: "freelance", pounds: 120.0, daysAgo: 8 },
  ];
  for (const e of earnings) {
    const periodStart = at(e.daysAgo, 0);
    await prisma.earning.create({
      data: {
        userId,
        platform: e.platform,
        amountPence: Math.round(e.pounds * 100),
        periodStart,
        periodEnd: periodStart,
        source: "manual",
      },
    });
  }

  // 6. Fuel logs.
  await prisma.fuelLog.create({
    data: { userId, vehicleId: vehicle.id, litres: 28.4, costPence: 3835, stationName: "Shell Sunderland", odometerReading: 41250, latitude: P.tesco.lat, longitude: P.tesco.lng, loggedAt: at(2, 17) },
  });
  await prisma.fuelLog.create({
    data: { userId, vehicleId: vehicle.id, litres: 26.1, costPence: 3520, stationName: "Tesco Extra", odometerReading: 41510, latitude: P.tesco.lat, longitude: P.tesco.lng, loggedAt: at(9, 10) },
  });

  // 7. Saved locations.
  await prisma.savedLocation.create({
    data: { userId, name: "Home", locationType: "home", latitude: P.home.lat, longitude: P.home.lng, radiusMeters: 100, geofenceEnabled: true },
  });
  await prisma.savedLocation.create({
    data: { userId, name: "Work", locationType: "work", latitude: P.newcastle.lat, longitude: P.newcastle.lng, radiusMeters: 120, geofenceEnabled: true },
  });

  await prisma.user.update({ where: { id: userId }, data: { lastTripAt } });

  const counts = {
    trips: await prisma.trip.count({ where: { userId } }),
    earnings: await prisma.earning.count({ where: { userId } }),
    fuel: await prisma.fuelLog.count({ where: { userId } }),
    locations: await prisma.savedLocation.count({ where: { userId } }),
  };
  console.log("Demo reseed complete:", JSON.stringify(counts), "lastTrip:", lastTripAt.toISOString());
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
