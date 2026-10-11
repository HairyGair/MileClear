import { describe, it, expect } from "vitest";
import { haversineDistance } from "@mileclear/shared";
import { placeChips, type PickerPlaces } from "../recentPlaces";

// Demo places only: Home, Depot, Office and two recent ends.
const places: PickerPlaces = {
  saved: [
    { key: "saved:h", label: "Home", lat: 54.99, lng: -1.61 },
    { key: "saved:d", label: "Depot", lat: 54.94, lng: -1.6 },
    { key: "saved:o", label: "Office", lat: 54.97, lng: -1.65 },
  ],
  recent: [
    { key: "trip:0:end", label: "Tesco Extra, Kingston Park", lat: 55.01, lng: -1.67 },
    { key: "trip:1:end", label: "Gosforth High Street", lat: 55.0, lng: -1.62 },
    { key: "trip:2:end", label: "Metrocentre", lat: 54.96, lng: -1.67 },
  ],
};
const types = { h: "home", d: "depot", o: "custom" };

describe("placeChips", () => {
  it("lists saved places with their kind, then two recent places", () => {
    const chips = placeChips({ places, types, haversine: haversineDistance });
    expect(chips.map((c) => [c.label, c.kind])).toEqual([
      ["Home", "home"],
      ["Depot", "depot"],
      ["Office", "custom"],
      ["Tesco Extra, Kingston Park", "recent"],
      ["Gosforth High Street", "recent"],
    ]);
  });

  it("puts the place picked at the other end last", () => {
    const chips = placeChips({ places, types, otherEnd: { lat: 54.99, lng: -1.61 }, haversine: haversineDistance });
    expect(chips[0].label).toBe("Depot");
    expect(chips[chips.length - 1].label).toBe("Home");
  });

  it("offers only recent places to a driver with no saved places", () => {
    const chips = placeChips({ places: { saved: [], recent: places.recent }, types: {}, haversine: haversineDistance });
    expect(chips).toHaveLength(2);
    expect(chips.every((c) => c.kind === "recent")).toBe(true);
  });
});
