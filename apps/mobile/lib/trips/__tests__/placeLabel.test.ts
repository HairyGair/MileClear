import { describe, it, expect } from "vitest";
import { shortPlaceLabel, savedPlaceAt, tripEndLabel } from "../placeLabel";

describe("shortPlaceLabel", () => {
  it("skips a house number that is its own part", () => {
    expect(shortPlaceLabel("121, Kenton Lane, Newcastle Upon Tyne, NE3 4LD")).toBe("Kenton Lane");
  });

  it("skips a house-number range (the 'Home → 1-12' row, 4 Oct 2026)", () => {
    expect(shortPlaceLabel("1-12, Something Road, Gosforth, NE3 1AA")).toBe("Something Road");
    expect(shortPlaceLabel("1–12, Something Road")).toBe("Something Road");
  });

  it("keeps a business name ahead of its street", () => {
    expect(shortPlaceLabel("Pepe's, 129-131 High St, Gosforth, Newcastle upon Tyne NE3 1HA")).toBe("Pepe's");
  });

  it("skips a leading postcode", () => {
    expect(shortPlaceLabel("NE3 2JA, Grasmere Pl, Newcastle upon Tyne NE3 2JA")).toBe("Grasmere Pl");
  });

  it("drops a house number that leads the street", () => {
    expect(shortPlaceLabel("67 Durham Road, Sunderland, SR1 2NY")).toBe("Durham Road");
    expect(shortPlaceLabel("12a Front Street, Consett")).toBe("Front Street");
    expect(shortPlaceLabel("129-131 High St, Gosforth")).toBe("High St");
  });

  it("keeps numbered names that are not house numbers", () => {
    expect(shortPlaceLabel("1st Avenue, Team Valley")).toBe("1st Avenue");
    expect(shortPlaceLabel("A1, Gateshead")).toBe("A1");
  });

  it("skips Unnamed Road", () => {
    expect(shortPlaceLabel("Unnamed Road, Kielder, NE48 1ER")).toBe("Kielder");
  });

  it("passes a saved-place style name through", () => {
    expect(shortPlaceLabel("Home")).toBe("Home");
    expect(shortPlaceLabel("St Roberts School")).toBe("St Roberts School");
  });

  it("never returns a bare number", () => {
    expect(shortPlaceLabel("1-12")).toBe("");
    expect(shortPlaceLabel("121")).toBe("");
    expect(shortPlaceLabel("121, 4")).toBe("");
  });

  it("falls back to a postcode when that is all there is", () => {
    expect(shortPlaceLabel("12, ne3 2ja")).toBe("NE3 2JA");
  });

  it("handles empty input", () => {
    expect(shortPlaceLabel(null)).toBe("");
    expect(shortPlaceLabel(undefined)).toBe("");
    expect(shortPlaceLabel("   ")).toBe("");
  });

  it("shortens a long name", () => {
    const label = shortPlaceLabel("Newcastle International Airport Long Stay, Woolsington");
    expect(label.length).toBeLessThanOrEqual(22);
    expect(label.endsWith("…")).toBe(true);
  });
});

describe("savedPlaceAt / tripEndLabel", () => {
  const saved = [
    { name: "Home", lat: 55.0, lng: -1.6, radiusMeters: 150 },
    { name: "Depot", lat: 55.01, lng: -1.6, radiusMeters: 50 },
  ];

  it("prefers a saved place the trip end sits inside", () => {
    // ~55 m north of Home
    expect(tripEndLabel("1-12, Something Road", 55.0005, -1.6, saved)).toBe("Home");
  });

  it("counts a small saved radius as at least 100 m", () => {
    // ~89 m from Depot, outside its 50 m radius
    expect(savedPlaceAt(saved, 55.0108, -1.6)).toBe("Depot");
  });

  it("uses the address when no saved place is near", () => {
    expect(tripEndLabel("121, Kenton Lane, NE3 4LD", 55.1, -1.6, saved)).toBe("Kenton Lane");
  });

  it("ignores missing or 0,0 coordinates", () => {
    expect(savedPlaceAt(saved, null, null)).toBeNull();
    expect(savedPlaceAt([{ name: "Null Island", lat: 0, lng: 0, radiusMeters: 150 }], 0, 0)).toBeNull();
  });
});
