import { describe, it, expect } from "vitest";
import type { NavigationStep } from "@mileclear/shared";
import {
  arrivalClock,
  arrivedPhrase,
  bannerAccessibilityLabel,
  bannerAction,
  bannerStreet,
  dataDateWords,
  departPhrase,
  displayDistance,
  durationWords,
  followPhrase,
  glyphFor,
  inDistancePhrase,
  milesShort,
  nowPhrase,
  ordinal,
  ordinalWord,
  shortPhrase,
  spokenDistance,
  thenPhrase,
} from "../phrases";
import { MANOEUVRE_GLYPHS } from "../../../components/directions/glyphData";

const MILE = 1609.344;
const YARD = 0.9144;

function step(p: Partial<NavigationStep>): NavigationStep {
  return { type: "turn", streetName: null, text: "", distanceMeters: 100, durationSeconds: 10, startIndex: 0, endIndex: 1, ...p };
}

describe("spoken distance (DESIGN 3.2)", () => {
  it.each([
    [2.2 * MILE, "2 miles"],
    [3.6 * MILE, "4 miles"],
    [1.5 * MILE, "one and a half miles"],
    [1.0 * MILE, "1 mile"],
    [0.7 * MILE, "three quarters of a mile"],
    [0.5 * MILE, "half a mile"],
    [0.25 * MILE, "a quarter of a mile"],
    [300 * YARD, "300 yards"],
    [160 * YARD, "150 yards"],
    [60 * YARD, "50 yards"],
    [10 * YARD, "50 yards"],
  ])("%f m says %s", (m, words) => expect(spokenDistance(m)).toBe(words));

  it("never metres or kilometres", () => {
    for (let m = 5; m < 40000; m += 37) expect(spokenDistance(m)).not.toMatch(/metre|km/);
  });
});

describe("banner distance (DESIGN 3.2)", () => {
  it.each([
    [12.3 * MILE, "12 mi"],
    [3.24 * MILE, "3.2 mi"],
    [0.4 * MILE, "0.4 mi"],
    [300 * YARD, "300 yd"],
    [160 * YARD, "150 yd"],
    [83 * YARD, "80 yd"],
    [15 * YARD, "Now"],
  ])("%f m shows %s", (m, shown) => expect(displayDistance(m)).toBe(shown));

  it("under 2 seconds away is Now", () => {
    expect(displayDistance(40, 25)).toBe("Now");
    expect(displayDistance(40, 10)).toBe("40 yd");
  });
});

describe("ordinals", () => {
  it("banner digits, spoken words", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st"]);
    expect([1, 2, 3, 4, 5, 6].map(ordinalWord)).toEqual(["first", "second", "third", "fourth", "fifth", "sixth"]);
  });
});

describe("voice templates (DESIGN 3.3)", () => {
  const T = (p: Partial<NavigationStep>) => step(p);
  it.each([
    [T({ modifier: "left", streetName: "Grange Road" }), "In 300 yards, turn left onto Grange Road", "Turn left now onto Grange Road", "Turn left"],
    [T({ modifier: "slight_right", streetName: "Mill Lane" }), "In 300 yards, bear right onto Mill Lane", "Bear right now onto Mill Lane", "Bear right"],
    [T({ modifier: "sharp_left", streetName: "Hill Street" }), "In 300 yards, take the sharp left onto Hill Street", "Take the sharp left now onto Hill Street", "Sharp left"],
    [T({ modifier: "straight", streetName: "High Street" }), "In 300 yards, go straight on onto High Street", "Go straight on now", "Straight on"],
    [T({ type: "keep", modifier: "left", streetName: "A1231" }), "In 300 yards, keep left onto the A one two three one", "Keep left now onto the A one two three one", "Keep left"],
    [T({ type: "roundabout", exit: 2, streetName: "Claremont Road" }), "In 300 yards, at the roundabout, take the second exit onto Claremont Road", "Now take the second exit onto Claremont Road", "2nd exit"],
    [T({ type: "roundabout", streetName: "Bath Road" }), "In 300 yards, at the roundabout, take the exit onto Bath Road", "Now take the exit onto Bath Road", "Roundabout"],
    [T({ type: "uturn", streetName: "Kings Road" }), "In 300 yards, turn around when it is safe", "Turn around when it is safe", "Turn around"],
    [T({ type: "continue", streetName: "Coast Road (A1058)" }), "In 300 yards, carry straight on onto Coast Road", "Carry straight on onto Coast Road", "Straight on"],
  ])("%#", (s, inPhrase, now, action) => {
    expect(inDistancePhrase(300 * YARD, s)).toBe(inPhrase);
    expect(nowPhrase(s)).toBe(now);
    expect(bannerAction(s)).toBe(action);
  });

  it("the spec's lead example", () => {
    expect(inDistancePhrase(0.5 * MILE, T({ modifier: "right", streetName: "Park Lane" }))).toBe("In half a mile, turn right onto Park Lane");
  });

  it("no street: the onto part is left out", () => {
    expect(inDistancePhrase(200, T({ modifier: "left" }))).toBe("In 200 yards, turn left");
    expect(nowPhrase(T({ type: "roundabout", exit: 1 }))).toBe("Now take the first exit");
  });

  it("arrive with and without a name", () => {
    const a = T({ type: "arrive" });
    expect(inDistancePhrase(300 * YARD, a, { arriveName: "Home" })).toBe("In 300 yards, you will arrive at Home");
    expect(inDistancePhrase(300 * YARD, a)).toBe("In 300 yards, you will arrive at your destination");
    expect(arrivedPhrase("Home")).toBe("You have arrived at Home");
    expect(arrivedPhrase(null)).toBe("You have arrived");
  });

  it("depart, follow and then", () => {
    expect(departPhrase(T({ type: "depart", streetName: "Station Road" }), 400)).toBe("Head along Station Road");
    expect(departPhrase(T({ type: "depart", streetName: "A19" }), 3.2 * MILE)).toBe("Head along the A nineteen, then follow the road for 3 miles");
    expect(departPhrase(T({ type: "depart" }), 400)).toBe("Follow the route on the screen");
    expect(followPhrase("A1", 6.2 * MILE)).toBe("Follow the A one for 6 miles");
    expect(followPhrase(null, 6.2 * MILE)).toBe("Follow the road for 6 miles");
    expect(thenPhrase(T({ modifier: "right" }))).toBe(", then turn right");
    expect(thenPhrase(T({ type: "roundabout", exit: 1 }))).toBe(", then take the first exit");
    expect(thenPhrase(T({ type: "keep", modifier: "left" }))).toBe(", then keep left");
    expect(shortPhrase(T({ type: "uturn" }))).toBe("turn around");
  });

  it("no em dashes, no exclamation marks, no 'recalculating' or 'please'", () => {
    const all: string[] = [];
    for (const type of ["depart", "continue", "turn", "keep", "roundabout", "uturn", "arrive"] as const) {
      for (const modifier of ["left", "right", "slight_left", "slight_right", "sharp_left", "sharp_right", "straight", undefined] as const) {
        const s = T({ type, modifier, exit: 3, streetName: "Front Street" });
        all.push(inDistancePhrase(400, s), nowPhrase(s), bannerAction(s), shortPhrase(s));
      }
    }
    const text = all.join(" | ");
    expect(text).not.toMatch(/—|!|recalculat|please/i);
  });
});

describe("banner", () => {
  it("street shown in full, arrival shows the name", () => {
    expect(bannerStreet(step({ streetName: "Coast Road (A1058)" }))).toBe("Coast Road (A1058)");
    expect(bannerStreet(step({ type: "arrive" }), "Home")).toBe("Home");
    expect(bannerStreet(step({}))).toBeNull();
  });
  it("a screen-reader label built from the data", () => {
    expect(
      bannerAccessibilityLabel(step({ type: "roundabout", exit: 2, streetName: "Claremont Road" }), 300 * YARD, step({ modifier: "left" }))
    ).toBe("In 300 yards, at the roundabout, take the second exit onto Claremont Road. Then turn left.");
  });
  it("every step has a glyph from the graphics set", () => {
    for (const type of ["depart", "continue", "turn", "keep", "roundabout", "uturn", "arrive"] as const) {
      for (const modifier of ["left", "right", "slight_left", "slight_right", "sharp_left", "sharp_right", "straight", undefined] as const) {
        for (const exit of [undefined, 1, 4, 6, 7]) {
          expect(MANOEUVRE_GLYPHS[glyphFor(step({ type, modifier, exit }))]).toBeDefined();
        }
      }
    }
    expect(glyphFor(step({ type: "roundabout", exit: 2 }))).toBe("roundabout-exit-2");
    expect(glyphFor(step({ type: "roundabout", exit: 8 }))).toBe("roundabout");
    expect(glyphFor(step({ type: "uturn" }))).toBe("uturn");
  });
  it("times, miles and the map data date", () => {
    expect(arrivalClock(new Date(2026, 9, 18, 14, 32))).toBe("14:32");
    expect(durationWords(30)).toBe("Under a minute");
    expect(durationWords(18 * 60)).toBe("18 min");
    expect(durationWords(65 * 60)).toBe("1 hr 5 min");
    expect(milesShort(6.3 * MILE)).toBe("6.3 mi");
    expect(milesShort(12.6 * MILE)).toBe("13 mi");
    expect(dataDateWords("2026-05-09")).toBe("9 May 2026");
  });
});
