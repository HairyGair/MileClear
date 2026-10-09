import type { Page, Route } from "@playwright/test";
import { API } from "./api";

// Mocks for the driving pages (vehicles, odometer, fuel, places, shifts, tools).
// Call mockSession(page, ...) first, then mockDriving(page, state). This handler is
// registered later so it wins; anything it does not know falls back to mockSession.

export interface Reading {
  id: string;
  readingMiles: number;
  readAt: string;
  source: "user" | "trip" | "fuel";
  sourceId: string;
  used: boolean;
  rejectReason: string | null;
}

export interface DrivingState {
  vehicles: Array<Record<string, unknown>>;
  /** keyed by vehicle id */
  odometer: Record<string, { current: unknown; readings: Reading[] }>;
  days: Array<Record<string, unknown>>;
  mot: unknown;
  places: Array<Record<string, unknown>>;
  suggestions: Array<Record<string, unknown>>;
  shifts: Array<Record<string, unknown>>;
  shiftSuggestions: Array<Record<string, unknown>>;
  fuelLogs: Array<Record<string, unknown>>;
  roadAlerts: unknown;
  cazCharges: Array<Record<string, unknown>>;
  /** POST /vehicles/:id/odometer-readings answers with this status and body. */
  readingResponse?: { status: number; body: unknown };
  /** Every non-GET request the page made: [method, path, parsed body]. */
  calls: Array<[string, string, unknown]>;
  tripTotal?: number;
}

export const VEHICLE = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "u-test",
  make: "Ford",
  model: "Focus",
  year: 2019,
  fuelType: "petrol",
  vehicleType: "car",
  registrationPlate: "AB12CDE",
  bluetoothName: null,
  estimatedMpg: 45,
  actualMpg: null,
  milesPerKwh: null,
  isPrimary: true,
  providedByOthers: false,
  createdAt: "2026-01-10T09:00:00.000Z",
  motExpiryDate: "2026-12-04T00:00:00.000Z",
  taxDueDate: "2026-11-01T00:00:00.000Z",
  euroStatus: "EURO 4",
  firstRegistration: "2012-03",
  dvlaPlateProblem: null,
  dvlaPlateSuggestion: null,
  cleanAirZones: {
    verdict: "non_compliant",
    confidence: "confirmed",
    summary: "May be charged",
    zeroEmission: false,
    zones: [
      { id: "london-ulez", name: "London ULEZ", city: "London", class: "ULEZ", chargesThisVehicle: true, chargePence: 1250 },
    ],
  },
  odometer: { miles: 45262, isEstimated: true },
};

export const CURRENT_ESTIMATED = {
  miles: 45262,
  isEstimated: true,
  basis: { readingMiles: 45100, readAt: "2026-10-08T17:40:00.000Z", source: "user", sourceId: "r1" },
  tripMilesSince: 162,
};

export function reading(over: Partial<Reading> = {}): Reading {
  return {
    id: "r1",
    readingMiles: 45100,
    readAt: "2026-10-08T17:40:00.000Z",
    source: "user",
    sourceId: "r1",
    used: true,
    rejectReason: null,
    ...over,
  };
}

export function drivingState(over: Partial<DrivingState> = {}): DrivingState {
  return {
    vehicles: [VEHICLE],
    odometer: { [VEHICLE.id]: { current: CURRENT_ESTIMATED, readings: [reading()] } },
    days: [],
    mot: null,
    places: [],
    suggestions: [],
    shifts: [],
    shiftSuggestions: [],
    fuelLogs: [],
    roadAlerts: { enabled: true, available: true, plannedWorksCoverage: "england", offerEligible: false, hasUsualRoads: true, current: [], upcoming: [], attribution: [], updatedAt: "2026-10-09T08:00:00.000Z" },
    cazCharges: [],
    calls: [],
    ...over,
  };
}

export async function mockDriving(page: Page, state: DrivingState): Promise<void> {
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });
    if (method === "OPTIONS") return route.fallback();
    if (method !== "GET") {
      let body: unknown = null;
      try {
        body = req.postDataJSON();
      } catch {
        body = null;
      }
      state.calls.push([method, path + url.search, body]);
    }

    const odo = path.match(/^\/vehicles\/([^/]+)\/odometer$/);
    if (odo && method === "GET") {
      const o = state.odometer[odo[1]];
      return o ? json({ data: o }) : json({ data: { current: null, readings: [] } });
    }
    if (path.match(/^\/vehicles\/[^/]+\/odometer-readings$/) && method === "POST") {
      const r = state.readingResponse;
      if (r) return json(r.body, r.status);
      return json({ data: { reading: { id: "new", vehicleId: VEHICLE.id, readingMiles: 1, readAt: new Date().toISOString(), source: "user" }, estimatedMiles: 45262, current: CURRENT_ESTIMATED } }, 201);
    }
    if (path.match(/^\/vehicles\/[^/]+\/odometer-readings\/[^/]+$/) && method === "DELETE") return json({ message: "Reading deleted" });
    if (path.match(/^\/vehicles\/[^/]+\/mot-history$/)) return json({ data: state.mot });
    if (path === "/vehicles/lookup" && method === "POST") {
      return json({ data: { registrationNumber: "NU71ABC", make: "VOLKSWAGEN", yearOfManufacture: 2021, fuelType: "electric", euroStatus: null, firstRegistration: "2021-09" } });
    }
    if (path === "/vehicles" && method === "POST") {
      return json({ data: { ...VEHICLE, id: "22222222-2222-4222-8222-222222222222" } }, 201);
    }
    if (path.match(/^\/vehicles\/[^/]+$/) && (method === "PATCH" || method === "DELETE")) return json({ data: VEHICLE, message: "ok" });
    if (path === "/vehicles") return json({ data: state.vehicles });

    if (path === "/odometer/days") return json({ data: state.days });

    if (path === "/saved-locations" && method === "GET") return json({ data: state.places });
    if (path === "/saved-locations/suggestions") return json({ data: state.suggestions });
    if (path === "/saved-locations/recommended-radius") {
      return json({ data: { locationType: "home", recommendedRadiusMeters: 140, fallbackRadiusMeters: 200, sampleSize: 40 } });
    }
    if (path === "/saved-locations" && method === "POST") return json({ data: { id: "p-new" } }, 201);
    const pl = path.match(/^\/saved-locations\/([^/]+)$/);
    if (pl && method === "GET") {
      const p = state.places.find((x) => x.id === pl[1]);
      return p ? json({ data: p }) : json({ error: "Saved location not found" }, 404);
    }
    if (pl) return json({ data: {}, message: "ok" });

    if (path === "/geocode/autocomplete") return json({ data: [{ placeId: "gp1", primary: "10 Downing Street", secondary: "London" }] });
    if (path === "/geocode/place") return json({ data: { lat: 51.5034, lng: -0.1276, address: "10 Downing Street, London" } });
    if (path === "/geocode/search") return json({ data: [{ lat: 54.97, lng: -1.61, address: "Newcastle" }] });

    if (path === "/shifts" && method === "GET") {
      return json({ data: state.shifts, total: state.shifts.length, page: 1, pageSize: 20, totalPages: 1 });
    }
    if (path === "/shifts/suggestions") return json({ suggestions: state.shiftSuggestions });
    if (path.match(/^\/shifts\/suggestions\/[^/]+\/resolve$/)) return json({ ok: true });
    const sh = path.match(/^\/shifts\/([^/]+)$/);
    if (sh) {
      const s = state.shifts.find((x) => x.id === sh[1]);
      return s ? json({ data: s }) : json({ error: "Shift not found" }, 404);
    }
    if (path === "/gamification/scorecard") {
      return json({ data: { shiftId: "s1", startedAt: "2026-10-07T17:00:00.000Z", endedAt: "2026-10-07T20:00:00.000Z", durationSeconds: 10800, tripsCompleted: 4, totalMiles: 42.5, businessMiles: 40, deductionPence: 2200, isPersonalBestMiles: false, isPersonalBestTrips: false, newAchievements: [] } });
    }
    if (path === "/business-insights") return json({ data: { recentShifts: [{ shiftId: "s1", earningsPence: 8000, grade: "B" }, { shiftId: "s2", earningsPence: 0, grade: "F" }] } });
    if (path.startsWith("/business-insights/shift-pnl/")) {
      return json({ data: { grossEarningsPence: 8000, expensesPence: 500, fuelPence: 1200, netPence: 6300 } });
    }
    if (path === "/trips" && !url.searchParams.get("shiftId")) {
      return json({ data: [{ id: "t1" }], total: state.tripTotal ?? 5, page: 1, pageSize: 1, totalPages: 1 });
    }
    if (path.match(/^\/trips\/[^/]+$/) && method === "GET" && path !== "/trips/summary") {
      return json({ data: { id: path.split("/")[2], startedAt: "2026-10-07T17:05:00.000Z", vehicleId: VEHICLE.id } });
    }
    if (path === "/trips" && url.searchParams.get("shiftId")) {
      return json({ data: [{ id: "t1", startedAt: "2026-10-07T17:05:00.000Z", endedAt: "2026-10-07T17:30:00.000Z", startAddress: "Depot", endAddress: "High Street", distanceMiles: 8.3, classification: "business" }] });
    }

    if (path === "/fuel/logs" && method === "GET") {
      return json({ data: state.fuelLogs, total: state.fuelLogs.length, page: 1, pageSize: 20, totalPages: 1 });
    }
    if (path === "/fuel/logs" && method === "POST") return json({ data: { id: "f-new" } }, 201);
    if (path.startsWith("/fuel/logs/")) return json({ data: {}, message: "ok" });
    if (path === "/fuel/cheapest-today") return json({ data: { kind: "fuel", line: "Asda Gosforth has petrol at 139.9p, 4p under the local average." } });
    if (path === "/trips/summary") return json({ data: { totalMiles: 400 } });
    if (path === "/fuel/prices") {
      return json({ stations: [{ siteId: "st1", brand: "Asda", stationName: "Asda Gosforth", address: "x", postcode: "NE3", latitude: 55, longitude: -1.6, distanceMiles: 1.2, prices: { E10: 139.9, B7: 146.9 } }], nationalAverage: { petrolPencePerLitre: 143.2, dieselPencePerLitre: 150.1, date: "2026-10-09" }, lastUpdated: "2026-10-09T07:00:00.000Z" });
    }
    if (path === "/charging/electricity-rate") return json({ data: { pencePerKwh: 24.5, source: "default", region: null, asOf: "2026-10-09" } });
    if (path === "/charging/nearby") return json({ chargers: [], attribution: "Data from Open Charge Map" });

    if (path === "/gamification/achievements") {
      return json({ data: [{ id: "a1", type: "first_trip", achievedAt: "2026-02-01T10:00:00.000Z", label: "Ignition", description: "x", emoji: "x" }, { id: "a2", type: "miles_100", achievedAt: "2026-03-01T10:00:00.000Z", label: "Century", description: "x", emoji: "x" }] });
    }
    if (path === "/gamification/stats") {
      return json({ data: { taxYear: "2026-27", totalMiles: 620, businessMiles: 400, deductionPence: 0, currentStreakDays: 2, longestStreakDays: 5, totalTrips: 40, totalShifts: 6, todayMiles: 0, todayTrips: 0, weekMiles: 10, personalRecords: { mostMilesInDay: 88.4, mostMilesInDayDate: "2026-09-03T00:00:00.000Z", mostTripsInShift: 9, mostTripsInShiftDate: null, longestSingleTrip: 41.2, longestSingleTripDate: null, longestStreakDays: 5 } } });
    }

    if (path === "/road-alerts" && method === "GET") return json({ data: state.roadAlerts });
    if (path === "/road-alerts/dismiss") return json({ ok: true });

    if (path === "/ticket-defender/lookup") {
      return json({ data: { at: "2026-10-07T17:12:00.000Z", windowMinutes: 15, status: "recorded", location: null, vehicle: null, trips: [{ id: "t1", startedAt: "2026-10-07T17:05:00.000Z", endedAt: "2026-10-07T17:30:00.000Z", startAddress: "Depot", endAddress: "High Street", distanceMiles: 8.3, isManualEntry: false, pointsInWindow: 12, vehicleLabel: "Ford Focus" }], nearestInTime: null, nearestToLocation: null, gaps: [], accuracy: { medianMetres: 8, worstMetres: 20 }, rows: [], before: null, after: null, summary: ["MileClear recorded a trip in your Ford Focus at that time."], caveats: ["This is a record of where your phone was. It does not prove anything on its own."] } });
    }
    if (path === "/ticket-defender/pack") {
      return route.fulfill({ status: 200, contentType: "application/pdf", headers: { "access-control-allow-origin": "*", "content-disposition": 'attachment; filename="mileclear-journey-record-test.pdf"' }, body: "%PDF-1.4 test" });
    }
    if (path === "/ticket-defender/caz-charges" && method === "GET") return json({ data: state.cazCharges });
    if (path.match(/^\/ticket-defender\/caz-charges\/[^/]+\/paid$/)) return json({ data: { key: "k", paid: true } });

    if (path.startsWith("/exports/odometer-log")) {
      return route.fulfill({ status: 200, contentType: "text/csv", headers: { "access-control-allow-origin": "*", "content-disposition": 'attachment; filename="odometer.csv"' }, body: "Date\n2026-10-08\n" });
    }
    return route.fallback();
  });
}

/** True when the page scrolls sideways. */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

export function callsTo(state: DrivingState, method: string, pathPart: string) {
  return state.calls.filter(([m, p]) => m === method && p.includes(pathPart));
}
