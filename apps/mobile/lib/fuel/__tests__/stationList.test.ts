import { describe, it, expect } from "vitest";
import type { FuelStation } from "@mileclear/shared";
import { priceBenchmark, stationsFor } from "../stationList";
import { DIESEL, PREMIUM_DIESEL, SUPER_UNLEADED, UNLEADED, fuelByKey } from "../mapFuel";

function station(siteId: string, distanceMiles: number, prices: FuelStation["prices"]): FuelStation {
  return { siteId, brand: siteId, address: "", postcode: "", latitude: 0, longitude: 0, distanceMiles, prices } as FuelStation;
}

const near = station("near", 0.5, { E10: 175.9, B7: 199.9 });
const mid = station("mid", 1.2, { E10: 169.9, E5: 189.9, B7: 195.9 });
const far = station("far", 3.0, { E10: 171.9, E5: 191.9, B7: 196.9, SDV: 220.9 });
const tie = station("tie", 2.0, { E10: 169.9 });

describe("stationsFor: the fuel tab list for one grade", () => {
  it("only lists stations that sell the chosen grade", () => {
    expect(stationsFor([near, mid, far], SUPER_UNLEADED, "nearest").map((s) => s.siteId)).toEqual(["mid", "far"]);
    expect(stationsFor([near, mid, far], PREMIUM_DIESEL, "nearest").map((s) => s.siteId)).toEqual(["far"]);
  });

  it("sorts nearest first by default", () => {
    expect(stationsFor([far, near, mid], UNLEADED, "nearest").map((s) => s.siteId)).toEqual(["near", "mid", "far"]);
  });

  it("sorts cheapest first, closer station first on the same price", () => {
    expect(stationsFor([near, far, tie, mid], UNLEADED, "cheapest").map((s) => s.siteId)).toEqual(["mid", "tie", "far", "near"]);
    expect(stationsFor([near, far, mid], DIESEL, "cheapest").map((s) => s.siteId)).toEqual(["mid", "far", "near"]);
  });

  it("does not reorder the list it was given", () => {
    const input = [far, near];
    stationsFor(input, UNLEADED, "nearest");
    expect(input.map((s) => s.siteId)).toEqual(["far", "near"]);
  });
});

describe("priceBenchmark: what prices are coloured against", () => {
  const avg = { petrolPencePerLitre: 172.4, dieselPencePerLitre: 196.1 } as never;

  it("uses the UK average for unleaded and diesel", () => {
    expect(priceBenchmark(UNLEADED, avg, [near])).toBe(172.4);
    expect(priceBenchmark(DIESEL, avg, [near])).toBe(196.1);
    expect(priceBenchmark(UNLEADED, null, [near])).toBeNull();
  });

  it("uses the middle nearby price for super unleaded and premium diesel", () => {
    const a = station("a", 1, { E5: 180 });
    const b = station("b", 1, { E5: 190 });
    const c = station("c", 1, { E5: 200 });
    const d = station("d", 1, { E5: 210 });
    expect(priceBenchmark(SUPER_UNLEADED, avg, [a, b, c])).toBe(190);
    expect(priceBenchmark(SUPER_UNLEADED, avg, [a, b, c, d])).toBe(195);
  });

  it("has nothing to compare with when fewer than 3 nearby prices", () => {
    expect(priceBenchmark(PREMIUM_DIESEL, avg, [near, mid, far])).toBeNull();
  });
});

describe("fuelByKey", () => {
  it("finds the four grades and nothing else", () => {
    expect(fuelByKey("E5")).toEqual(SUPER_UNLEADED);
    expect(fuelByKey("SDV")).toEqual(PREMIUM_DIESEL);
    expect(fuelByKey("LPG")).toBeNull();
    expect(fuelByKey(null)).toBeNull();
  });
});
