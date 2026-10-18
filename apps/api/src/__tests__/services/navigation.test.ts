import { describe, it, expect } from "vitest";
import {
  toNavRoute,
  stepKind,
  stepText,
  kmhToUkMph,
  navigationEnabledFor,
  parseLatLng,
  parseHeading,
  cleanTowards,
  type GraphHopperPath,
} from "../../services/navigation.js";

// The first steps of a real route from our GraphHopper (Newcastle to
// Sunderland, 18 Oct 2026), trimmed.
const PATH: GraphHopperPath = {
  distance: 23035.265,
  time: 1255817,
  points: {
    type: "LineString",
    coordinates: [
      [-1.617698, 54.97844],
      [-1.617964, 54.978504],
      [-1.617463, 54.979166],
      [-1.6171, 54.979827],
      [-1.616891, 54.980451],
    ],
  },
  instructions: [
    { distance: 18.422, sign: 0, interval: [0, 1], text: "Continue", time: 3316, street_name: "" },
    { distance: 353.146, sign: 2, interval: [1, 2], text: "Turn right onto Queen Victoria Road", time: 45404, street_name: "Queen Victoria Road" },
    { exit_number: 1, distance: 261.611, sign: 6, interval: [2, 3], text: "At roundabout, take exit 1 onto Claremont Road", time: 22307, street_name: "Claremont Road" },
    { exit_number: 4, distance: 113.291, sign: 6, interval: [3, 4], text: "At roundabout, take exit 4 onto B1318", time: 7085, street_name: "", street_ref: "B1318", street_destination: "Sunderland, Washington, Non-motorway traffic" },
    { distance: 0, sign: 4, interval: [4, 4], text: "Arrive at destination", time: 0, street_name: "" },
  ],
  details: { max_speed: [[0, 1, null], [1, 2, 32], [2, 3, 48], [3, 4, 96]] },
};

describe("toNavRoute", () => {
  const route = toNavRoute(PATH, { dataDate: "2026-10-17", profile: "car_nav", routeId: "r1" });

  it("flips GraphHopper's [lng, lat] to [lat, lng]", () => {
    expect(route.geometry[0]).toEqual([54.97844, -1.617698]);
    expect(route.geometry).toHaveLength(5);
  });

  it("words each step in plain UK English", () => {
    expect(route.steps.map((s) => s.text)).toEqual([
      "Set off",
      "Turn right onto Queen Victoria Road",
      "At the roundabout, take the 1st exit onto Claremont Road",
      "At the roundabout, take the 4th exit onto the B1318",
      "You have arrived",
    ]);
  });

  it("passes on road numbers and signposts, without the non-motorway sign text", () => {
    expect(route.steps[3]).toMatchObject({ streetName: null, roadRef: "B1318", towards: "Sunderland, Washington" });
    expect(route.steps[1]).toMatchObject({ roadRef: null, towards: null });
  });

  it("keeps where each manoeuvre happens on the line", () => {
    expect(route.steps[1]).toMatchObject({ type: "turn", modifier: "right", startIndex: 1, endIndex: 2, streetName: "Queen Victoria Road" });
    expect(route.steps[2]).toMatchObject({ type: "roundabout", exit: 1 });
    expect(route.steps[0]).toMatchObject({ type: "depart", streetName: null });
    expect(route.steps[0].modifier).toBeUndefined();
  });

  it("gives totals in metres and seconds", () => {
    expect(route.distanceMeters).toBe(23035);
    expect(route.durationSeconds).toBe(1256);
    expect(route.steps[1].durationSeconds).toBe(45);
  });

  it("turns OpenStreetMap km/h back into UK mph signs", () => {
    expect(route.speedLimitsMph).toEqual([
      { startIndex: 0, endIndex: 1, mph: null },
      { startIndex: 1, endIndex: 2, mph: 20 },
      { startIndex: 2, endIndex: 3, mph: 30 },
      { startIndex: 3, endIndex: 4, mph: 60 },
    ]);
  });
});

describe("step helpers", () => {
  it("maps every GraphHopper sign", () => {
    expect(stepKind(-3)).toEqual({ type: "turn", modifier: "sharp_left" });
    expect(stepKind(7)).toEqual({ type: "keep", modifier: "right" });
    expect(stepKind(-98)).toEqual({ type: "uturn" });
    expect(stepKind(5)).toEqual({ type: "continue", modifier: "straight" });
    expect(stepKind(42)).toEqual({ type: "continue", modifier: "straight" });
  });

  it("uses proper ordinals and no dashes", () => {
    expect(stepText("roundabout", undefined, null, 2)).toBe("At the roundabout, take the 2nd exit");
    expect(stepText("roundabout", undefined, null, 3)).toBe("At the roundabout, take the 3rd exit");
    expect(stepText("roundabout", undefined, null, 11)).toBe("At the roundabout, take the 11th exit");
    expect(stepText("keep", "left", "M1", undefined)).toBe("Keep left onto M1");
    expect(stepText("turn", "slight_right", null, undefined)).toBe("Turn slight right");
    for (const t of [stepText("uturn", undefined, null), stepText("depart", undefined, "A1")]) expect(t).not.toMatch(/[—–]| - /);
  });

  it("rounds speed limits to the UK sign", () => {
    expect(kmhToUkMph(112)).toBe(70);
    expect(kmhToUkMph(80)).toBe(50);
    expect(kmhToUkMph(null)).toBeNull();
    expect(kmhToUkMph(0)).toBeNull();
  });
});

describe("who sees navigation", () => {
  it("is off unless switched on", () => {
    expect(navigationEnabledFor({ id: "u1", isAdmin: true, isPro: true }, {})).toBe(false);
    expect(navigationEnabledFor({ id: "u1", isAdmin: true }, { NAVIGATION_ROLLOUT: "off", NAVIGATION_ENABLED: "1" })).toBe(false);
  });

  it("in the testers stage shows to admins and listed drivers only, Pro or not", () => {
    const env = { NAVIGATION_ROLLOUT: "list", NAVIGATION_USER_IDS: "u2, u3" };
    expect(navigationEnabledFor({ id: "u1", isAdmin: true }, env)).toBe(true);
    expect(navigationEnabledFor({ id: "u3", isAdmin: false }, env)).toBe(true);
    expect(navigationEnabledFor({ id: "u9", isAdmin: false, isPro: true }, env)).toBe(false);
  });

  it("keeps the first switch working as the testers stage", () => {
    expect(navigationEnabledFor({ id: "u1", isAdmin: true }, { NAVIGATION_ENABLED: "1" })).toBe(true);
    expect(navigationEnabledFor({ id: "u9", isAdmin: false, isPro: true }, { NAVIGATION_ENABLED: "1" })).toBe(false);
  });

  it("in the Pro stage shows to every Pro driver and no free driver", () => {
    const env = { NAVIGATION_ROLLOUT: "pro" };
    expect(navigationEnabledFor({ id: "u9", isAdmin: false, isPro: true }, env)).toBe(true);
    expect(navigationEnabledFor({ id: "u8", isAdmin: false, isPro: false }, env)).toBe(false);
    expect(navigationEnabledFor({ id: "u7", isAdmin: false }, env)).toBe(false);
  });
});

describe("parseLatLng", () => {
  it("accepts lat,lng and rejects nonsense", () => {
    expect(parseLatLng("54.97,-1.61")).toEqual([54.97, -1.61]);
    expect(parseLatLng("91,0")).toBeNull();
    expect(parseLatLng("abc")).toBeNull();
    expect(parseLatLng(undefined)).toBeNull();
  });
});

describe("parseHeading", () => {
  it("takes a compass heading and ignores anything else", () => {
    expect(parseHeading("90")).toBe(90);
    expect(parseHeading("359.6")).toBe(0);
    expect(parseHeading(undefined)).toBeNull();
    expect(parseHeading("")).toBeNull();
    expect(parseHeading("400")).toBeNull();
    expect(parseHeading("-5")).toBeNull();
    expect(parseHeading("north")).toBeNull();
  });
});

describe("cleanTowards", () => {
  it("drops the non-motorway sign text and empty parts", () => {
    expect(cleanTowards("Non-motorway traffic")).toBeNull();
    expect(cleanTowards("Sunderland; Washington")).toBe("Sunderland, Washington");
    expect(cleanTowards(undefined)).toBeNull();
  });
});
