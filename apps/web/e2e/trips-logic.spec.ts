import { test, expect } from "@playwright/test";
import { shortPlaceLabel, tripEndLabel, routeTitle } from "../src/components/dashboard/trips/lib/placeLabel";
import { groupByRoute } from "../src/components/dashboard/trips/lib/routeGroups";
import { groupByDay, londonDay } from "../src/components/dashboard/trips/lib/days";
import { activeFilterCount, filterQuery, pageUrlParams, parseFilters, parseView, rangeLabel } from "../src/components/dashboard/trips/lib/filters";
import { odometerWarning, validateTrip } from "../src/components/dashboard/trips/lib/form";
import { odometerLineFor } from "../src/components/dashboard/trips/lib/odometerLine";
import { findStops, speedSeries } from "../src/components/dashboard/trips/lib/stops";
import { addTripHref, defaultTimes, isGapOffer } from "../src/components/dashboard/trips/lib/missed";

// Pure helpers behind the Trips pages. No browser involved.

test.describe("place labels", () => {
  test("skip house numbers and postcodes", () => {
    expect(shortPlaceLabel("121, Kenton Lane, Newcastle Upon Tyne, NE3 4LD")).toBe("Kenton Lane");
    expect(shortPlaceLabel("1-12, Something Road, Gosforth, NE3 1AA")).toBe("Something Road");
    expect(shortPlaceLabel("NE3 2JA, Grasmere Pl, Newcastle upon Tyne NE3 2JA")).toBe("Grasmere Pl");
    expect(shortPlaceLabel("NE3 2JA")).toBe("NE3 2JA");
    expect(shortPlaceLabel(null)).toBe("");
  });
  test("a saved place wins inside its radius", () => {
    const saved = [{ name: "Home", lat: 51.5, lng: -0.12, radiusMeters: 100 }];
    expect(tripEndLabel("5 Other St, London", 51.5001, -0.12, saved)).toBe("Home");
    expect(tripEndLabel("5 Other St, London", 51.6, -0.12, saved)).toBe("Other St");
    expect(routeTitle("Home", "Depot")).toBe("Home to Depot");
    expect(routeTitle("", "")).toBe("Trip");
  });
});

test.describe("inbox grouping", () => {
  const t = (id: string, sLat: number, eLat: number, miles = 10) => ({
    id,
    startLat: sLat,
    startLng: -0.1,
    endLat: eLat,
    endLng: -0.2,
    distanceMiles: miles,
  });
  test("groups trips whose ends are within 300 m", () => {
    const groups = groupByRoute([t("a", 51.5, 51.6), t("b", 51.5005, 51.6005), t("c", 51.6, 51.5), t("d", 51.5, 51.65)]);
    expect(groups.map((g) => g.trips.map((x) => x.id))).toEqual([["a", "b"], ["c"], ["d"]]);
    expect(groups[0].miles).toBe(20);
  });
  test("a trip with no end stays on its own", () => {
    const groups = groupByRoute([{ ...t("a", 51.5, 51.6), endLat: null }, { ...t("b", 51.5, 51.6), endLat: null }]);
    expect(groups).toHaveLength(2);
  });
});

test.describe("days", () => {
  test("groups consecutive items by London day and totals the miles", () => {
    const items = [
      { startedAt: "2026-10-09T17:00:00Z", distanceMiles: 2 },
      { startedAt: "2026-10-09T08:00:00Z", distanceMiles: 3 },
      { startedAt: "2026-10-08T08:00:00Z", distanceMiles: 4 },
    ];
    const groups = groupByDay(items);
    expect(groups.map((g) => [g.key, g.miles])).toEqual([["2026-10-09", 5], ["2026-10-08", 4]]);
    // 23:30 UTC in summer is already the next day in London.
    expect(londonDay("2026-07-01T23:30:00Z")).toBe("2026-07-02");
  });
});

test.describe("filters", () => {
  test("reads the URL and builds the API query", () => {
    const f = parseFilters((k) => ({ platform: "uber", from: "2026-04-06", to: "bad" } as Record<string, string>)[k] ?? null);
    expect(f).toEqual({ platform: "uber", from: "2026-04-06", to: "" });
    expect(activeFilterCount(f)).toBe(2);
    const q = filterQuery("business", f);
    expect(q.get("classification")).toBe("business");
    expect(q.get("platformTag")).toBe("uber");
    expect(q.get("from")).toBeTruthy();
    expect(q.get("to")).toBeNull();
    expect(parseView("nonsense")).toBe("all");
    expect(parseView("inbox")).toBe("inbox");
  });
  test("page URL only holds what differs from the defaults", () => {
    expect(pageUrlParams("all", { platform: "", from: "", to: "" }, 1)).toBe("");
    expect(pageUrlParams("inbox", { platform: "", from: "", to: "" }, 1)).toBe("?view=inbox");
    expect(pageUrlParams("all", { platform: "uber", from: "", to: "" }, 3)).toBe("?platform=uber&page=3");
  });
  test("range labels name the presets", () => {
    const now = new Date(2026, 9, 9);
    expect(rangeLabel({ platform: "", from: "2026-04-06", to: "2026-10-09" }, now)).toBe("This tax year");
    expect(rangeLabel({ platform: "", from: "2025-04-06", to: "2026-04-05" }, now)).toBe("Last tax year");
    expect(rangeLabel({ platform: "", from: "2026-10-01", to: "2026-10-05" }, now)).toBe("1 Oct to 5 Oct");
  });
});

test.describe("trip form rules", () => {
  const ok = { fromLabel: "A", toLabel: "B", date: "2026-10-08", startTime: "09:00", endTime: "09:30", distance: "12.4", classification: "business" as const, odometerStart: "", odometerEnd: "" };
  const now = new Date(2026, 9, 9, 12, 0);
  test("a complete form has no errors", () => {
    expect(validateTrip(ok, { requireClassification: true, now })).toEqual({});
  });
  test("each missing piece has its own message", () => {
    const e = validateTrip({ ...ok, fromLabel: "", toLabel: " ", startTime: "", endTime: "", distance: "", classification: "" }, { requireClassification: true, now });
    expect(e).toMatchObject({
      from: "Add where the trip started.",
      to: "Add where the trip ended.",
      startTime: "Add the start time.",
      endTime: "Add the end time.",
      distance: "Add the distance in miles.",
      classification: "Choose Business or Personal.",
    });
  });
  test("end before start, future start and long distance", () => {
    expect(validateTrip({ ...ok, endTime: "08:00" }, { requireClassification: true, now }).endTime).toBe("End time can't be before the start time.");
    expect(validateTrip({ ...ok, date: "2026-10-10" }, { requireClassification: true, now }).startTime).toBe("Start time can't be in the future.");
    expect(validateTrip({ ...ok, distance: "2500" }, { requireClassification: true, now }).distance).toBe("That's over the 2,000 mile limit.");
    expect(validateTrip({ ...ok, classification: "" }, { requireClassification: false, now }).classification).toBeUndefined();
  });
  test("odometer warning only when more than 20% off", () => {
    expect(odometerWarning("1000", "1013", "12.4")).toBeNull();
    expect(odometerWarning("1000", "1030", "12.4")).toBe("Your odometer difference is 30 mi but the trip measures 12.4 mi. Check the readings.");
    expect(odometerWarning("", "1030", "12.4")).toBeNull();
  });
});

test.describe("odometer day line", () => {
  const rows = [{ date: "2026-10-09", vehicleId: "v1", opening: 45210, openingRecorded: false, closing: 45262, closingRecorded: false }];
  test("est. when estimated, (recorded) when both are readings, none for mixed vehicles", () => {
    expect(odometerLineFor("2026-10-09", [{ vehicleId: "v1" }], rows)?.text).toBe("Odometer 45,210 to 45,262 est.");
    expect(odometerLineFor("2026-10-09", [{ vehicleId: "v1" }], [{ ...rows[0], openingRecorded: true, closingRecorded: true }])?.text).toBe("Odometer 45,210 to 45,262 (recorded)");
    expect(odometerLineFor("2026-10-09", [{ vehicleId: "v1" }, { vehicleId: "v2" }], rows)).toBeNull();
    expect(odometerLineFor("2026-10-08", [{ vehicleId: "v1" }], rows)).toBeNull();
    expect(odometerLineFor("2026-10-09", [{ vehicleId: null }], rows)?.vehicleId).toBe("v1");
  });
});

test.describe("stops and speed", () => {
  const crumb = (min: number, lat: number, speed: number | null = null) => ({ lat, lng: -0.1, speed, recordedAt: new Date(Date.UTC(2026, 9, 9, 8, min)).toISOString() });
  test("finds a stop of two minutes or more, including a gap with no fixes", () => {
    const crumbs = [crumb(0, 51.5), crumb(1, 51.505), crumb(2, 51.51), crumb(3, 51.51001), crumb(7, 51.51002), crumb(8, 51.52)];
    const stops = findStops(crumbs);
    expect(stops).toHaveLength(1);
    expect(stops[0].durationSec).toBe(300);
  });
  test("speed needs ten points", () => {
    expect(speedSeries([crumb(0, 51.5, 5), crumb(1, 51.51, 5)])).toEqual([]);
    const many = Array.from({ length: 12 }, (_, i) => crumb(i, 51.5 + i * 0.003, 10));
    const s = speedSeries(many);
    expect(s).toHaveLength(12);
    expect(Math.round(s[0].mph)).toBe(22);
  });
});

test.describe("missed journeys", () => {
  const p = {
    id: "p1",
    fromLat: 51.5,
    fromLng: -0.1,
    toLat: 51.6,
    toLng: -0.2,
    fromAddress: null,
    toAddress: "Station Rd",
    departedAt: "2026-10-08T07:07:00Z",
    arrivedAt: "2026-10-08T17:30:00Z",
    estimatedMiles: 10,
    source: "gap",
  };
  test("a gap offer starts at the window and lasts as long as the drive", () => {
    expect(isGapOffer(p)).toBe(true);
    const t = defaultTimes(p);
    expect(t.startedAt).toBe("2026-10-08T07:07:00.000Z");
    expect(new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime()).toBe(30 * 60_000);
  });
  test("a recorded drive keeps its own times", () => {
    const t = defaultTimes({ ...p, source: "recorded", arrivedAt: "2026-10-08T07:25:00Z" });
    expect(t.endedAt).toBe("2026-10-08T07:25:00.000Z");
  });
  test("the Add trip link carries the places and the offer", () => {
    const href = addTripHref(p);
    expect(href).toContain("/dashboard/trips/new?missedId=p1");
    expect(href).toContain("toAddress=Station+Rd");
    expect(href).not.toContain("fromAddress");
    expect(href).toContain("gap=1");
  });
});
