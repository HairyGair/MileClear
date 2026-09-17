import { describe, it, expect } from "vitest";
import { haversineDistance } from "@mileclear/shared";
import { selectPickerPlaces, type RecentTripRow, type SavedPlaceRow } from "../recentPlaces";

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

  it("caps recent places at 8 and saved places at 6", () => {
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
    expect(saved).toHaveLength(6);
    expect(recent).toHaveLength(8);
    expect(recent[0].label).toBe("Place 12");
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
