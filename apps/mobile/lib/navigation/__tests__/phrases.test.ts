import { describe, it, expect } from "vitest";
import type { NavigationStep } from "@mileclear/shared";
import {
  arrivalClock,
  arrowIcon,
  bannerSubtitle,
  bannerTitle,
  displayDistance,
  durationWords,
  followPhrase,
  inDistancePhrase,
  manoeuvrePhrase,
  milesWords,
  nowPhrase,
  ordinal,
  spokenDistance,
  thenPhrase,
} from "../phrases";

const MILE = 1609.344;
const YARD = 0.9144;

function step(p: Partial<NavigationStep>): NavigationStep {
  return {
    type: "turn",
    streetName: null,
    text: "",
    distanceMeters: 100,
    durationSeconds: 10,
    startIndex: 0,
    endIndex: 1,
    ...p,
  };
}

describe("spokenDistance", () => {
  it.each([
    [80 * YARD, "80 yards"],
    [12 * YARD, "10 yards"],
    [300 * YARD, "300 yards"],
    [312 * YARD, "300 yards"],
    [430 * YARD, "450 yards"],
    [0.3 * MILE, "a quarter of a mile"],
    [0.5 * MILE, "half a mile"],
    [0.75 * MILE, "three quarters of a mile"],
    [1 * MILE, "1 mile"],
    [1.5 * MILE, "1 and a half miles"],
    [2.1 * MILE, "2 miles"],
    [12.4 * MILE, "12 and a half miles"],
  ])("%f m is %s", (m, words) => {
    expect(spokenDistance(m)).toBe(words);
  });

  it("never uses kilometres or metres", () => {
    for (let m = 5; m < 30000; m += 37) expect(spokenDistance(m)).not.toMatch(/metre|km/);
  });
});

describe("displayDistance", () => {
  it("yards under a quarter mile, miles above", () => {
    expect(displayDistance(300 * YARD)).toBe("300 yd");
    expect(displayDistance(47 * YARD)).toBe("50 yd");
    expect(displayDistance(0.4 * MILE)).toBe("0.4 mi");
    expect(displayDistance(12.3 * MILE)).toBe("12 mi");
  });
});

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
  ])("%i is %s", (n, s) => expect(ordinal(n)).toBe(s));
});

describe("manoeuvre wording", () => {
  it("the spec's examples", () => {
    expect(inDistancePhrase(0.5 * MILE, step({ modifier: "right", streetName: "Park Lane" }))).toBe(
      "In half a mile, turn right onto Park Lane"
    );
    expect(
      inDistancePhrase(300 * YARD, step({ type: "roundabout", exit: 2, streetName: "Claremont Road" }))
    ).toBe("In 300 yards, at the roundabout, take the 2nd exit onto Claremont Road");
    expect(nowPhrase(step({ modifier: "right", streetName: "Park Lane" }), { saidBefore: true })).toBe("Turn right now");
  });

  it("UK verbs for each modifier", () => {
    expect(manoeuvrePhrase(step({ modifier: "slight_left" }))).toBe("bear left");
    expect(manoeuvrePhrase(step({ modifier: "sharp_right" }))).toBe("turn sharp right");
    expect(manoeuvrePhrase(step({ modifier: "straight" }))).toBe("go straight on");
    expect(manoeuvrePhrase(step({ type: "keep", modifier: "slight_right" }))).toBe("keep right");
    expect(manoeuvrePhrase(step({ type: "uturn", streetName: "High Street" }))).toBe("make a U-turn");
    expect(manoeuvrePhrase(step({ type: "roundabout" }))).toBe("at the roundabout, go round");
  });

  it("a road name at the start is never lower-cased", () => {
    expect(inDistancePhrase(200, step({ modifier: "left", streetName: "A40" }))).toBe("In 200 yards, turn left onto A40");
  });

  it("at the turn the street is said only if nothing was said before", () => {
    const s = step({ modifier: "left", streetName: "Oxford Road" });
    expect(nowPhrase(s, { saidBefore: false })).toBe("Turn left now onto Oxford Road");
    expect(nowPhrase(step({ type: "roundabout", exit: 3 }), { saidBefore: true })).toBe(
      "At the roundabout, take the 3rd exit"
    );
    expect(nowPhrase(step({ type: "uturn" }), { saidBefore: true })).toBe("Make a U-turn now");
  });

  it("follow and then", () => {
    expect(followPhrase(3 * MILE)).toBe("Continue for 3 miles");
    expect(thenPhrase(step({ modifier: "left", streetName: "X Road" }))).toBe(", then turn left");
    expect(thenPhrase(step({ type: "arrive" }))).toBe(", then you will arrive at your destination");
  });

  it("no em dashes anywhere", () => {
    const all = [
      inDistancePhrase(400, step({ type: "keep", modifier: "left" })),
      nowPhrase(step({ type: "arrive" }), { saidBefore: false }),
      bannerTitle(step({ type: "roundabout", exit: 1 })),
    ].join(" ");
    expect(all).not.toContain("—");
  });
});

describe("banner", () => {
  it("title, street and arrow", () => {
    const rb = step({ type: "roundabout", exit: 2, streetName: "Bath Road" });
    expect(bannerTitle(rb)).toBe("Take the 2nd exit");
    expect(bannerSubtitle(rb)).toBe("At the roundabout, onto Bath Road");
    expect(arrowIcon(rb)).toBe("rotate-right");
    const t = step({ modifier: "left", streetName: "Kings Road" });
    expect(bannerTitle(t)).toBe("Turn left");
    expect(bannerSubtitle(t)).toBe("Kings Road");
    expect(arrowIcon(t)).toBe("arrow-left-top");
    expect(arrowIcon(step({ type: "uturn" }))).toBe("arrow-u-right-top");
    expect(arrowIcon(step({ type: "arrive" }))).toBe("flag-checkered");
  });

  it("times and distances", () => {
    expect(arrivalClock(new Date(2026, 9, 18, 8, 5))).toBe("08:05");
    expect(durationWords(30)).toBe("Under a minute");
    expect(durationWords(23 * 60)).toBe("23 min");
    expect(durationWords(65 * 60)).toBe("1 hr 5 min");
    expect(milesWords(MILE)).toBe("1 mile");
    expect(milesWords(12.44 * MILE)).toBe("12 miles");
    expect(milesWords(3.24 * MILE)).toBe("3.2 miles");
  });
});
