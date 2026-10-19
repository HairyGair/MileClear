// The nearby fuel list for one grade (19 Oct 2026, Matt: "only show specific
// fuel types" and "sort by price, lowest first"). Pure so it can be tested
// without the screen.

import type { FuelStation, NationalAveragePrices } from "@mileclear/shared";
import type { MapFuel } from "./mapFuel";

export type StationSort = "nearest" | "cheapest";

/**
 * Stations that sell this grade, nearest first or cheapest first. Cheapest
 * breaks ties by distance, so of two stations at the same price the closer
 * one comes first.
 */
export function stationsFor(
  stations: FuelStation[],
  fuel: MapFuel,
  sort: StationSort
): FuelStation[] {
  const withPrice = stations.filter((s) => s.prices[fuel.key] != null);
  return withPrice.sort((a, b) => {
    if (sort === "cheapest") {
      const diff = (a.prices[fuel.key] as number) - (b.prices[fuel.key] as number);
      if (diff !== 0) return diff;
    }
    return a.distanceMiles - b.distanceMiles;
  });
}

/**
 * What a price is coloured against. Unleaded and diesel use the UK average,
 * as before. There is no UK average for super unleaded or premium diesel, so
 * those use the middle price of that grade nearby: green is cheap for here,
 * red is dear for here. Null when there is nothing to compare with.
 */
export function priceBenchmark(
  fuel: MapFuel,
  nationalAvg: NationalAveragePrices | null,
  stations: FuelStation[]
): number | null {
  if (fuel.key === "E10") return nationalAvg?.petrolPencePerLitre ?? null;
  if (fuel.key === "B7") return nationalAvg?.dieselPencePerLitre ?? null;
  const prices = stations
    .map((s) => s.prices[fuel.key])
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b);
  if (prices.length < 3) return null;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
}
