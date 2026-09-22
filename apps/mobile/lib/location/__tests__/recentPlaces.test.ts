import { describe, it, expect } from "vitest";
import { haversineDistance } from "@mileclear/shared";
import { matchSavedPlaces, selectPickerPlaces, type RecentTripRow, type SavedPlaceRow } from "../recentPlaces";

// 0.0009 degrees of latitude is about 100 m; 0.0003 is about 33 m.
const BASE_LAT = 51.63;
const BASE_LNG = -0.78;

function trip(overrides: Partial<RecentTripRow> & { started_at: string }): RecentTripRow {
  return {
    ended_at: null,
    start_lat: null,
    start_lng: null,
    start_address: null,
    end_lat: null,
    end_lng: null,
    end_address: null,
    ...overrides,
  };
}

function run(trips: RecentTripRow[], savedPlaces: SavedPlaceRow[] = []) {
  return selectPickerPlaces({ trips, savedPlaces, haversine: haversineDistance });
}

describe("selectPickerPlaces", () => {
  it("lists the newest trip ends first", () => {
    const { recent } = run([
      trip({ started_at: "2026-09-10T08:00:00Z", start_lat: BASE_LAT, start_lng: BASE_LNG, start_address: "Old Street" }),
      trip({ started_at: "2026-09-16T08:00:00Z", start_lat: BASE_LAT + 0.01, start_lng: BASE_LNG, start_address: "New Street" }),
    ]);
    expect(recent.map((r) => r.label)).toEqual(["New Street", "Old Street"]);
  });

  it("treats points within 75 m as one place and keeps the newest label", () => {
    const { recent } = run([
      trip({ started_at: "2026-09-10T08:00:00Z", start_lat: BASE_LAT, start_lng: BASE_LNG, start_address: "307 West Wycombe Road" }),
      trip({ started_at: "2026-09-16T08:00:00Z", start_lat: BASE_LAT + 0.0003, start_lng: BASE_LNG, start_address: "304 West Wycombe Road" }),
      trip({ started_at: "2026-09-12T08:00:00Z", start_lat: BASE_LAT + 0.002, start_lng: BASE_LNG, start_address: "Further along" }),
    ]);
    expect(recent.map((r) => r.label)).toEqual(["304 West Wycombe Road", "Further along"]);
  });

  it("skips points with no address or no coordinates", () => {
    const { recent } = run([
      trip({ started_at: "2026-09-16T08:00:00Z", start_lat: BASE_LAT, start_lng: BASE_LNG, start_address: null }),
      trip({ started_at: "2026-09-15T08:00:00Z", start_lat: BASE_LAT + 0.01, start_lng: BASE_LNG, start_address: "   " }),
      trip({ started_at: "2026-09-14T08:00:00Z", end_lat: null, end_lng: null, end_address: "No pin" }),
      trip({ started_at: "2026-09-13T08:00:00Z", start_lat: BASE_LAT + 0.02, start_lng: BASE_LNG, start_address: "Kept" }),
    ]);
    expect(recent.map((r) => r.label)).toEqual(["Kept"]);
  });

  it("leaves out trip ends within 75 m of a saved place", () => {
    const { saved, recent } = run(
      [
        trip({ started_at: "2026-09-16T08:00:00Z", start_lat: BASE_LAT + 0.0002, start_lng: BASE_LNG, start_address: "12 Home Lane" }),
        trip({ started_at: "2026-09-15T08:00:00Z", start_lat: BASE_LAT + 0.01, start_lng: BASE_LNG, start_address: "The depot" }),
      ],
      [{ id: "h", name: "Home", latitude: BASE_LAT, longitude: BASE_LNG }]
    );
    expect(saved.map((s) => s.label)).toEqual(["Home"]);
    expect(recent.map((r) => r.label)).toEqual(["The depot"]);
  });

  it("caps recent places at 8 and returns every saved place", () => {
    const trips = Array.from({ length: 12 }, (_, i) =>
      trip({
        started_at: `2026-09-${String(i + 1).padStart(2, "0")}T08:00:00Z`,
        start_lat: BASE_LAT + i * 0.01,
        start_lng: BASE_LNG,
        start_address: `Place ${i + 1}`,
      })
    );
    const savedPlaces = Array.from({ length: 9 }, (_, i) => ({
      id: String(i),
      name: `Saved ${i + 1}`,
      latitude: BASE_LAT - 1 - i * 0.01,
      longitude: BASE_LNG,
    }));
    const { saved, recent } = run(trips, savedPlaces);
    expect(saved).toHaveLength(9);
    expect(recent).toHaveLength(8);
    expect(recent[0].label).toBe("Place 12");
  });

  // Chris Saunders, 22 Sep 2026: only the first six saved places, A to Z after
  // Home, could be picked.
  it("puts home and work first, then saved places by most recent visit, then the rest A to Z", () => {
    const savedPlaces: SavedPlaceRow[] = [
      { id: "a", name: "Archers Way", latitude: BASE_LAT + 0.1, longitude: BASE_LNG },
      { id: "b", name: "Beechlands", latitude: BASE_LAT + 0.2, longitude: BASE_LNG },
      { id: "w", name: "Wycombe Hospital", latitude: BASE_LAT + 0.3, longitude: BASE_LNG },
      { id: "x", name: "Xmas Market", latitude: BASE_LAT + 0.4, longitude: BASE_LNG },
      { id: "o", name: "Office", latitude: BASE_LAT + 0.5, longitude: BASE_LNG, location_type: "work" },
      { id: "h", name: "Home", latitude: BASE_LAT, longitude: BASE_LNG, location_type: "home" },
    ];
    const { saved } = run(
      [
        // Within 150 m of Wycombe Hospital, newest.
        trip({ started_at: "2026-09-20T08:00:00Z", start_lat: BASE_LAT + 0.3 + 0.001, start_lng: BASE_LNG, start_address: "Queen Alexandra Road" }),
        trip({ started_at: "2026-09-10T08:00:00Z", start_lat: BASE_LAT + 0.4, start_lng: BASE_LNG, start_address: "Market Square" }),
      ],
      savedPlaces
    );
    expect(saved.map((s) => s.label)).toEqual([
      "Home",
      "Office",
      "Wycombe Hospital",
      "Xmas Market",
      "Archers Way",
      "Beechlands",
    ]);
  });

  it("considers both the start and the end of a trip, the end being newer", () => {
    const { recent } = run([
      trip({
        started_at: "2026-09-16T08:00:00Z",
        ended_at: "2026-09-16T08:30:00Z",
        start_lat: BASE_LAT,
        start_lng: BASE_LNG,
        start_address: "Pickup",
        end_lat: BASE_LAT + 0.05,
        end_lng: BASE_LNG,
        end_address: "Drop-off",
      }),
    ]);
    expect(recent.map((r) => r.label)).toEqual(["Drop-off", "Pickup"]);
  });
});

describe("matchSavedPlaces", () => {
  const places = ["Home", "Archers Way", "Wycombe Hospital", "High Wycombe Station", "Chiltern View"].map(
    (label, i) => ({ key: String(i), label, lat: 0, lng: 0 })
  );
  const labels = (q: string) => matchSavedPlaces(places, q).map((p) => p.label);

  it("matches from the first letter, ignoring case", () => {
    // "Chiltern View" only contains a w, so it comes last.
    expect(labels("w")).toEqual(["Wycombe Hospital", "Archers Way", "High Wycombe Station", "Chiltern View"]);
    expect(labels("CHIL")).toEqual(["Chiltern View"]);
  });

  it("puts a name that starts with the text before one with a later word that does, then plain contains", () => {
    expect(labels("wy")).toEqual(["Wycombe Hospital", "High Wycombe Station"]);
    expect(labels("ay")).toEqual(["Archers Way"]);
  });

  it("returns nothing for blank text or no match", () => {
    expect(labels("  ")).toEqual([]);
    expect(labels("zzz")).toEqual([]);
  });

  it("offers at most five", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ key: String(i), label: `Site ${i}`, lat: 0, lng: 0 }));
    expect(matchSavedPlaces(many, "site")).toHaveLength(5);
  });
});
