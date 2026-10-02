/**
 * "Cheapest fuel near you" (2 Oct 2026): the opt-in morning push and the line
 * at the top of the fuel tab. Radius widening, stale prices, the 3p
 * threshold, not repeating yesterday's station, and which fuel a vehicle uses.
 */
import { describe, it, expect } from "vitest";
import type { FuelStation } from "@mileclear/shared";
import {
  ALERT_THRESHOLD_PENCE,
  buildEvWeeklyCopy,
  buildFuelAlertCopy,
  cheapestFuelLine,
  evRunningCostLine,
  fuelPathForVehicle,
  inEvWeeklyWindow,
  inFuelAlertWindow,
  parsePriceTimestamp,
  pickPrimaryVehicle,
  pickStartPoint,
  selectCheapestFuel,
  shortStationName,
} from "../../services/cheapestFuelRule.js";
import { pushPrefOptedIn, pushPrefEnabled } from "../../services/pushPrefs.js";

const NOW = Date.parse("2026-10-02T07:30:00Z");
const FRESH = "2026-10-02T06:00:00Z";
const STALE = "2026-09-29T06:00:00Z"; // 3.5 days old

let seq = 0;
function station(
  distanceMiles: number,
  prices: FuelStation["prices"],
  opts: { updated?: string | null; brand?: string; address?: string; siteId?: string } = {}
): FuelStation {
  const updated = opts.updated === undefined ? FRESH : opts.updated;
  const pricesUpdatedAt: FuelStation["pricesUpdatedAt"] = {};
  if (updated) for (const k of Object.keys(prices) as (keyof FuelStation["prices"])[]) pricesUpdatedAt[k] = updated;
  seq++;
  return {
    siteId: opts.siteId ?? `site-${seq}`,
    brand: opts.brand ?? "Esso",
    stationName: "x",
    address: opts.address ?? "High Street, Gateshead",
    postcode: "NE8 1AA",
    latitude: 54.95,
    longitude: -1.6,
    distanceMiles,
    prices,
    ...(updated ? { pricesUpdatedAt } : {}),
  };
}

const select = (stations: FuelStation[], extra: Partial<Parameters<typeof selectCheapestFuel>[0]> = {}) =>
  selectCheapestFuel({ stations, key: "B7", nowMs: NOW, nationalAveragePence: 150, lastAlert: null, ...extra });

describe("fuelPathForVehicle", () => {
  it("maps petrol and diesel to their pump grades", () => {
    expect(fuelPathForVehicle("petrol")).toEqual({ path: "fuel", key: "E10", label: "petrol" });
    expect(fuelPathForVehicle("diesel")).toEqual({ path: "fuel", key: "B7", label: "diesel" });
  });
  it("prices a hybrid as petrol", () => {
    expect(fuelPathForVehicle("hybrid")).toEqual({ path: "fuel", key: "E10", label: "petrol" });
  });
  it("sends electric down the EV path", () => {
    expect(fuelPathForVehicle("electric")).toEqual({ path: "ev" });
  });
  it("guesses nothing for an unknown or missing type", () => {
    expect(fuelPathForVehicle("lpg")).toBeNull();
    expect(fuelPathForVehicle(null)).toBeNull();
  });
});

describe("pickPrimaryVehicle", () => {
  it("prefers the primary, else the newest", () => {
    const a = { id: "a", isPrimary: false, createdAt: new Date("2026-01-01") };
    const b = { id: "b", isPrimary: false, createdAt: new Date("2026-05-01") };
    const c = { id: "c", isPrimary: true, createdAt: new Date("2025-01-01") };
    expect(pickPrimaryVehicle([a, b, c])?.id).toBe("c");
    expect(pickPrimaryVehicle([a, b])?.id).toBe("b");
    expect(pickPrimaryVehicle([])).toBeNull();
  });
});

describe("pickStartPoint", () => {
  const home = { latitude: 51.5, longitude: -0.1 };
  it("uses the median of recent trip starts, so one far trip does not move it", () => {
    const p = pickStartPoint({
      tripStarts: [
        { startLat: 54.95, startLng: -1.6 },
        { startLat: 54.96, startLng: -1.61 },
        { startLat: 54.97, startLng: -1.62 },
        { startLat: 50.1, startLng: -5.5 }, // one trip to Cornwall
        { startLat: 54.955, startLng: -1.605 },
      ],
      savedHome: home,
    });
    expect(p?.source).toBe("trip_starts");
    expect(p!.lat).toBeCloseTo(54.955, 3);
    expect(p!.lng).toBeCloseTo(-1.61, 2);
  });
  it("falls back to saved home with fewer than 3 usable trips", () => {
    const p = pickStartPoint({
      tripStarts: [{ startLat: 54.95, startLng: -1.6 }, { startLat: 0, startLng: 0 }],
      savedHome: home,
    });
    expect(p).toEqual({ lat: 51.5, lng: -0.1, source: "saved_home" });
  });
  it("returns null with neither", () => {
    expect(pickStartPoint({ tripStarts: [], savedHome: null })).toBeNull();
  });
});

describe("selectCheapestFuel: radius", () => {
  it("stays at 5 miles when 3 or more stations there have fresh prices", () => {
    const sel = select([
      station(1, { B7: 150 }),
      station(2, { B7: 146 }),
      station(4, { B7: 152 }),
      station(8, { B7: 130 }), // cheaper but outside 5 miles
    ]);
    expect(sel.radiusMiles).toBe(5);
    expect(sel.stationCount).toBe(3);
    expect(sel.cheapest?.pencePerLitre).toBe(146);
  });
  it("widens to 10 miles when fewer than 3 are within 5", () => {
    const sel = select([station(1, { B7: 150 }), station(6, { B7: 152 }), station(9, { B7: 144 })]);
    expect(sel.radiusMiles).toBe(10);
    expect(sel.stationCount).toBe(3);
    expect(sel.cheapest?.pencePerLitre).toBe(144);
  });
  it("gives up when fewer than 3 even at 10 miles", () => {
    const sel = select([station(1, { B7: 150 }), station(9, { B7: 140 }), station(12, { B7: 130 })]);
    expect(sel.decision).toBe("too_few_stations");
    expect(sel.cheapest).toBeNull();
  });
  it("counts only stations that sell the driver's fuel", () => {
    const sel = select([station(1, { E10: 140 }), station(2, { E10: 141 }), station(3, { B7: 150 })]);
    expect(sel.decision).toBe("too_few_stations");
  });
});

describe("selectCheapestFuel: stale prices", () => {
  it("ignores a price older than 48 hours, however cheap", () => {
    const sel = select([
      station(1, { B7: 150 }),
      station(2, { B7: 151 }),
      station(3, { B7: 149 }),
      station(1.5, { B7: 120 }, { updated: STALE }),
    ]);
    expect(sel.cheapest?.pencePerLitre).toBe(149);
    expect(sel.stationCount).toBe(3);
  });
  it("treats a price with no timestamp as stale", () => {
    const sel = select([
      station(1, { B7: 150 }),
      station(2, { B7: 151 }),
      station(3, { B7: 120 }, { updated: null }),
    ]);
    expect(sel.decision).toBe("too_few_stations");
  });
  it("stale stations do not count toward the 3 needed at 5 miles", () => {
    const sel = select([
      station(1, { B7: 150 }),
      station(2, { B7: 151 }, { updated: STALE }),
      station(3, { B7: 152 }),
      station(7, { B7: 148 }),
    ]);
    expect(sel.radiusMiles).toBe(10);
  });
  it("reads the retailer feeds' day-first timestamps", () => {
    expect(parsePriceTimestamp("02/10/2026 09:56:30")).toBe(Date.UTC(2026, 9, 2, 9, 56, 30));
    expect(parsePriceTimestamp("2026-10-02T06:00:00Z")).toBe(Date.parse(FRESH));
    expect(parsePriceTimestamp("not a date")).toBeNull();
    expect(parsePriceTimestamp(undefined)).toBeNull();
  });
  it("drops prices outside a plausible pence-per-litre band", () => {
    const sel = select([station(1, { B7: 150 }), station(2, { B7: 151 }), station(3, { B7: 152 }), station(1, { B7: 1.45 })]);
    expect(sel.cheapest?.pencePerLitre).toBe(150);
  });
});

describe("selectCheapestFuel: threshold", () => {
  it(`sends at ${ALERT_THRESHOLD_PENCE}p or more under the local average`, () => {
    const sel = select([station(1, { B7: 150 }), station(2, { B7: 147 }), station(3, { B7: 152 })]);
    expect(sel.localAveragePence).toBe(150);
    expect(sel.underLocalPence).toBe(3);
    expect(sel.decision).toBe("send");
  });
  it("stays quiet when the cheapest is under 3p below the average", () => {
    const sel = select([station(1, { B7: 150 }), station(2, { B7: 147.1 }), station(3, { B7: 152 })]);
    expect(sel.underLocalPence).toBe(2.9);
    expect(sel.decision).toBe("below_threshold");
    // ...but the fuel tab still has a line to show
    expect(cheapestFuelLine("diesel", sel)).toBe(
      "Cheapest diesel near you today: 147.1p at Esso Gateshead, 2.9p under the local average."
    );
  });
  it("a tie on price goes to the nearer station", () => {
    const sel = select([
      station(4, { B7: 140 }, { siteId: "far" }),
      station(1, { B7: 140 }, { siteId: "near" }),
      station(2, { B7: 150 }),
      station(3, { B7: 151 }),
    ]);
    expect(sel.cheapest?.siteId).toBe("near");
  });
});

describe("selectCheapestFuel: not the same as yesterday", () => {
  const stations = () => [
    station(1, { B7: 150 }),
    station(2, { B7: 139.9 }, { siteId: "tesco-gateshead" }),
    station(3, { B7: 152 }),
  ];
  it("skips the same station at the same price", () => {
    const sel = select(stations(), { lastAlert: { siteId: "tesco-gateshead", pencePerLitre: 139.9 } });
    expect(sel.decision).toBe("same_as_last_alert");
  });
  it("sends when the same station's price has moved", () => {
    const sel = select(stations(), { lastAlert: { siteId: "tesco-gateshead", pencePerLitre: 141.9 } });
    expect(sel.decision).toBe("send");
  });
  it("sends when a different station is cheapest", () => {
    const sel = select(stations(), { lastAlert: { siteId: "asda-metro", pencePerLitre: 139.9 } });
    expect(sel.decision).toBe("send");
  });
});

describe("copy", () => {
  it("matches the agreed shape, plain English, no em dashes", () => {
    const sel = select([
      station(1, { B7: 146 }),
      station(2, { B7: 139.9 }, { brand: "TESCO", address: "Trinity Square, Gateshead, NE8 1AG" }),
      station(3, { B7: 148 }),
    ]);
    expect(sel.decision).toBe("send");
    const copy = buildFuelAlertCopy("diesel", sel)!;
    expect(copy.title).toBe("Cheapest diesel near you today");
    expect(copy.body).toBe(
      "139.9p at Tesco Gateshead, 6.1p under the local average and 10.1p under the UK average. About £3.05 less on 50 litres."
    );
    expect(cheapestFuelLine("diesel", sel)).toBe(
      "Cheapest diesel near you today: 139.9p at Tesco Gateshead, 6.1p under the local average."
    );
    expect(copy.body + copy.title).not.toMatch(/—/);
  });
  it("uses a full tank when the size is known, and leaves out a UK average it does not beat", () => {
    const sel = select([station(1, { B7: 150 }), station(2, { B7: 146 }), station(3, { B7: 152 })], {
      nationalAveragePence: 146.5,
    });
    expect(buildFuelAlertCopy("diesel", sel, 60)!.body).toBe(
      "146.0p at Esso Gateshead, 4p under the local average. About £2.40 less on a full tank (60 litres)."
    );
  });
  it("shortStationName keeps the brand when there is no usable town", () => {
    expect(shortStationName("Asda", "Abbey Park - North London Road, Coventry")).toBe("Asda Coventry");
    expect(shortStationName("BP", "")).toBe("BP");
    expect(shortStationName("Shell", "A1 Services, NE11 0AA")).toBe("Shell");
  });
});

describe("EV", () => {
  it("costs last week at home and on public rapid chargers", () => {
    const copy = buildEvWeeklyCopy({
      miles: 142,
      milesPerKwh: 3.5,
      homePencePerKwh: 24.5,
      publicPencePerKwh: 77,
      vehicleName: "Tesla Model 3",
    })!;
    expect(copy.title).toBe("Your EV running costs last week");
    expect(copy.body).toBe(
      "142 miles in your Tesla Model 3: about £9.94 charged at home (7p a mile), or £31.24 on public rapid chargers at 77p/kWh."
    );
  });
  it("sends nothing for a week without driving", () => {
    expect(
      buildEvWeeklyCopy({ miles: 0.4, milesPerKwh: 3.5, homePencePerKwh: 24.5, publicPencePerKwh: 77, vehicleName: null })
    ).toBeNull();
  });
  it("fuel tab line", () => {
    expect(evRunningCostLine({ milesPerKwh: 3.5, homePencePerKwh: 24.5, publicPencePerKwh: 77 })).toBe(
      "Charging at home costs about 7p a mile. On a public rapid charger at 77p/kWh it is about 22p a mile."
    );
  });
});

describe("windows", () => {
  it("morning alert goes 08:00-09:59 UK, after quiet hours end", () => {
    expect(inFuelAlertWindow(7)).toBe(false);
    expect(inFuelAlertWindow(8)).toBe(true);
    expect(inFuelAlertWindow(9)).toBe(true);
    expect(inFuelAlertWindow(10)).toBe(false);
  });
  it("EV summary on Monday mornings only", () => {
    expect(inEvWeeklyWindow({ year: 2026, month: 10, day: 5, hour: 9 })).toBe(true); // Mon
    expect(inEvWeeklyWindow({ year: 2026, month: 10, day: 5, hour: 11 })).toBe(false);
    expect(inEvWeeklyWindow({ year: 2026, month: 10, day: 6, hour: 9 })).toBe(false); // Tue
  });
});

describe("opt-in prefs", () => {
  it("is off unless explicitly true", () => {
    expect(pushPrefOptedIn(null, "cheapestFuelDaily")).toBe(false);
    expect(pushPrefOptedIn({}, "cheapestFuelDaily")).toBe(false);
    expect(pushPrefOptedIn({ cheapestFuelDaily: false }, "cheapestFuelDaily")).toBe(false);
    expect(pushPrefOptedIn({ cheapestFuelDaily: true }, "cheapestFuelDaily")).toBe(true);
    expect(pushPrefOptedIn({ evWeeklySummary: true }, "cheapestFuelDaily")).toBe(false);
    // the opt-out keys keep their old meaning
    expect(pushPrefEnabled({}, "fuelAlert")).toBe(true);
  });
});
