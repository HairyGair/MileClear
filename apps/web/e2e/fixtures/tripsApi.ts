import type { Page, Route } from "@playwright/test";
import { API } from "./api";

// Fixtures for the Trips pages (package B). Registered AFTER mockSession so these
// handlers win for the trips endpoints and everything else falls through to it.
// Nothing here talks to a real server: every call is answered from `state`.

export interface TripFx {
  id: string;
  vehicleId: string | null;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  startedAt: string;
  endedAt: string | null;
  isManualEntry: boolean;
  classification: "business" | "personal" | "unclassified";
  platformTag: string | null;
  businessPurpose: string | null;
  category: string | null;
  notes: string | null;
  projectLabel: string | null;
  odometerStart: number | null;
  odometerEnd: number | null;
  autoClassifiedAt: string | null;
  possibleDuplicateOfId: string | null;
  coordinateCount: number;
  confidence: { level: "high" | "medium" | "low"; reasons: string[] };
  suggestion: unknown;
  [k: string]: unknown;
}

/** An ISO time `daysAgo` days back at local HH:MM. */
export function at(daysAgo: number, hm: string): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const [h, m] = hm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Same wording as the dashboard: "Thu 9 Oct" (year when not this year). */
export function dayText(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
}

let seq = 1;
export function trip(over: Partial<TripFx> = {}): TripFx {
  const n = seq++;
  const id = over.id ?? `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    id,
    vehicleId: "v1",
    startLat: 51.5,
    startLng: -0.12,
    endLat: 51.52,
    endLng: -0.1,
    startAddress: "1 Home Road, London, N1 1AA",
    endAddress: "Tesco Extra, High Street, London, N1 2BB",
    distanceMiles: 12.4,
    startedAt: at(0, "08:12"),
    endedAt: at(0, "08:41"),
    isManualEntry: false,
    classification: "business",
    platformTag: null,
    businessPurpose: null,
    category: null,
    notes: null,
    projectLabel: null,
    odometerStart: null,
    odometerEnd: null,
    autoClassifiedAt: null,
    possibleDuplicateOfId: null,
    coordinateCount: 40,
    confidence: { level: "high", reasons: [] },
    suggestion: null,
    ...over,
  } as TripFx;
}

export interface Proposal {
  id: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  fromAddress: string | null;
  toAddress: string | null;
  departedAt: string;
  arrivedAt: string;
  estimatedMiles: number;
  source?: string;
}

export function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: `p-${seq++}`,
    fromLat: 51.5,
    fromLng: -0.12,
    toLat: 51.6,
    toLng: -0.2,
    fromAddress: "Depot Way, London",
    toAddress: "Station Road, Watford",
    departedAt: at(1, "07:07"),
    arrivedAt: at(1, "17:30"),
    estimatedMiles: 9.5,
    source: "gap",
    ...over,
  };
}

export interface TripsState {
  trips: TripFx[];
  missed: Proposal[];
  vehicles: { id: string; make: string; model: string; isPrimary: boolean }[];
  places: unknown[];
  odometerDays: unknown[];
  /** Per-trip extras for GET /trips/:id. */
  detail: Record<string, Record<string, unknown>>;
  splitSuggestions: Record<string, unknown[]>;
  projectTotals: unknown;
  importPreview: unknown;
  /** Every non-GET call the page made. */
  calls: { method: string; path: string; body: unknown }[];
  /** Force a status for a method+path, e.g. "GET /trips" -> 500. */
  fail: Record<string, number>;
}

export function newState(over: Partial<TripsState> = {}): TripsState {
  return {
    trips: [],
    missed: [],
    vehicles: [{ id: "v1", make: "Ford", model: "Transit", isPrimary: true }],
    places: [],
    odometerDays: [],
    detail: {},
    splitSuggestions: {},
    projectTotals: { taxYear: "2026-27", projects: [], totals: { trips: 0, miles: 0, valuePence: 0 }, labels: [] },
    importPreview: null,
    calls: [],
    fail: {},
    ...over,
  };
}

export async function mockTrips(page: Page, state: TripsState): Promise<void> {
  await page.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    if (method === "OPTIONS") return route.fallback();
    const url = new URL(req.url());
    const path = url.pathname;
    const q = url.searchParams;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });

    const forced = state.fail[`${method} ${path}`];
    if (forced) return json({ error: "Something went wrong on our side" }, forced);

    let body: unknown = null;
    if (method !== "GET") {
      try {
        body = req.postDataJSON();
      } catch {
        body = null;
      }
      state.calls.push({ method, path, body });
    }

    const find = (id: string) => state.trips.find((t) => t.id === id);

    // ---- collections ----
    if (path === "/trips" && method === "GET") {
      let rows = [...state.trips].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const c = q.get("classification");
      if (c) rows = rows.filter((t) => t.classification === c);
      const p = q.get("platformTag");
      if (p) rows = rows.filter((t) => t.platformTag === p);
      const from = q.get("from");
      if (from) rows = rows.filter((t) => t.startedAt >= new Date(from).toISOString());
      const to = q.get("to");
      if (to) rows = rows.filter((t) => t.startedAt <= new Date(to).toISOString());
      const pageNo = Number(q.get("page") ?? 1);
      const size = Number(q.get("pageSize") ?? 20);
      return json({
        data: rows.slice((pageNo - 1) * size, pageNo * size),
        total: rows.length,
        page: pageNo,
        pageSize: size,
        totalPages: Math.max(1, Math.ceil(rows.length / size)),
      });
    }
    if (path === "/trips" && method === "POST") {
      const b = body as Record<string, unknown>;
      const created = trip({ ...(b as Partial<TripFx>), id: "11111111-1111-4111-8111-111111111111" });
      state.trips.unshift(created);
      return json({ data: created }, 201);
    }
    if (path === "/trips/unclassified/count") {
      return json({ count: state.trips.filter((t) => t.classification === "unclassified").length });
    }
    if (path === "/trips/missed-journeys") return json({ proposals: state.missed });
    const resolve = path.match(/^\/trips\/missed-journeys\/([^/]+)\/resolve$/);
    if (resolve && method === "POST") {
      state.missed = state.missed.filter((p) => p.id !== resolve[1]);
      return json({ ok: true });
    }
    if (path === "/trips/summary") {
      let rows = state.trips;
      const p = q.get("platformTag");
      if (p) rows = rows.filter((t) => t.platformTag === p);
      const from = q.get("from");
      if (from) rows = rows.filter((t) => t.startedAt >= new Date(from).toISOString());
      const to = q.get("to");
      if (to) rows = rows.filter((t) => t.startedAt <= new Date(to).toISOString());
      const sum = (cl: string) => rows.filter((t) => t.classification === cl).reduce((s, t) => s + t.distanceMiles, 0);
      const cnt = (cl: string) => rows.filter((t) => t.classification === cl).length;
      return json({
        data: {
          totalTrips: rows.length,
          totalMiles: rows.reduce((s, t) => s + t.distanceMiles, 0),
          businessTrips: cnt("business"),
          businessMiles: sum("business"),
          personalTrips: cnt("personal"),
          personalMiles: sum("personal"),
        },
      });
    }
    if (path === "/trips/project-totals") return json({ data: state.projectTotals });
    if (path === "/trips/project-labels") return json({ data: { labels: ["Acme refit"] } });
    if (path === "/trips/route-distance") return json({ data: { distanceMiles: 12.4, durationSecs: 1500 } });
    if (path === "/trips/report-missing") return json({ ok: true });
    if (path === "/trips/import/preview") return json({ data: state.importPreview });
    if (path === "/trips/import/confirm") {
      return json({ data: { imported: 2, skippedDuplicates: 1, skippedErrors: 0, totalMiles: 30.5 } });
    }
    if (path === "/trips/merge") {
      const b = body as { tripIds: string[] };
      state.trips = state.trips.filter((t) => !b.tripIds.includes(t.id));
      const merged = trip({ id: "22222222-2222-4222-8222-222222222222" });
      state.trips.unshift(merged);
      return json({ data: merged }, 201);
    }

    // ---- one trip ----
    const one = path.match(/^\/trips\/([0-9a-f-]{36})$/);
    if (one) {
      const t = find(one[1]);
      if (!t) return json({ error: "Trip not found" }, 404);
      if (method === "GET") {
        return json({
          data: {
            ...t,
            coordinates: [],
            matchedCoordinates: null,
            vehicle: { id: "v1", make: "Ford", model: "Transit" },
            mergeSuggestion: null,
            cleanAirZones: null,
            diversion: null,
            ...(state.detail[t.id] ?? {}),
          },
        });
      }
      if (method === "PATCH") {
        Object.assign(t, body as object);
        return json({ data: t });
      }
      if (method === "DELETE") {
        state.trips = state.trips.filter((x) => x.id !== t.id);
        return json({ message: "Trip deleted" });
      }
    }
    const sub = path.match(/^\/trips\/([0-9a-f-]{36})\/([a-z-]+)$/);
    if (sub) {
      const t = find(sub[1]);
      if (!t) return json({ error: "Trip not found" }, 404);
      switch (sub[2]) {
        case "undo-classification":
          t.classification = "unclassified";
          t.autoClassifiedAt = null;
          return json({ data: t });
        case "recalc":
          return json({ data: { changed: true, oldMiles: t.distanceMiles, newMiles: 14.2, source: "routing" } });
        case "split-suggestions":
          return json({ data: { suggestions: state.splitSuggestions[t.id] ?? [], coordCount: 50 } });
        case "split":
          state.trips = state.trips.filter((x) => x.id !== t.id);
          return json({ data: { deletedTripId: t.id, trips: [] } }, 201);
        case "anomaly":
          return json({ data: { id: "a1" } }, 201);
      }
    }

    // ---- neighbours ----
    if (path === "/saved-locations" && method === "GET") return json({ data: state.places });
    if (path === "/vehicles" && method === "GET") return json({ data: state.vehicles });
    if (path === "/odometer/days") return json({ data: state.odometerDays });
    if (path === "/expenses" && method === "POST") return json({ data: { id: "e1" } }, 201);
    if (/^\/ticket-defender\/caz-charges\/[^/]+\/paid$/.test(path) && method === "POST") return json({ data: { paid: true } });
    if (path === "/geocode/autocomplete") {
      return json({ data: [{ placeId: "pl1", primary: "10 Downing Street", secondary: "London SW1A 2AA" }] });
    }
    if (path === "/geocode/place") return json({ data: { lat: 51.5034, lng: -0.1276, address: "10 Downing Street, London SW1A 2AA" } });
    if (path === "/geocode/search") return json({ data: [] });

    return route.fallback();
  });
}

export function calls(state: TripsState, method: string, path: string | RegExp) {
  return state.calls.filter((c) => c.method === method && (typeof path === "string" ? c.path === path : path.test(c.path)));
}
