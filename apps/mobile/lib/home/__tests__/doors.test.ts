import { describe, it, expect } from "vitest";
import { selectDoorRows, doorOrder, isEndOfWeek, type DoorInputs, type DoorTexts } from "../doors";
import {
  insightsDoorText,
  earningsDoorText,
  badgesDoorText,
  fuelDoorText,
  saSeasonText,
  changePhrase,
  type WeekRecapLike,
} from "../doorText";
import { parseHiddenDoorRows, withDoorRowHidden } from "../doorPrefs";

const texts = (over: Partial<DoorTexts> = {}): DoorTexts => ({
  road: null,
  tax: { text: "Tax line", route: "/(tabs)/tax" },
  insights: { text: "Insights line", route: "/insights" },
  earnings: "Earnings line",
  badges: "Badges line",
  fuel: "Fuel line",
  ...over,
});
const base = (over: Partial<DoorInputs> = {}): DoorInputs => ({
  mode: "work",
  persona: "gig",
  totalTrips: 24,
  hasFuelLogs: false,
  endOfWeek: false,
  hidden: [],
  texts: texts(),
  ...over,
});
const ids = (i: DoorInputs) => selectDoorRows(i).map((r) => r.id);

describe("door rows per persona", () => {
  it("Work gig and both: Tax, Insights, Earnings", () => {
    expect(ids(base())).toEqual(["tax", "insights", "earnings"]);
    expect(ids(base({ persona: "both" }))).toEqual(["tax", "insights", "earnings"]);
  });
  it("Work gig with no earnings gets Badges instead", () => {
    expect(ids(base({ texts: texts({ earnings: null }) }))).toEqual(["tax", "insights", "badges"]);
  });
  it("Work employee: Tax, Insights, Badges", () => {
    expect(ids(base({ persona: "employee" }))).toEqual(["tax", "insights", "badges"]);
  });
  it("Work company: Insights, Badges, and Fuel only when fuel is logged", () => {
    expect(ids(base({ persona: "company" }))).toEqual(["insights", "badges"]);
    expect(ids(base({ persona: "company", hasFuelLogs: true }))).toEqual(["insights", "badges", "fuel"]);
  });
  it("Personal mode: Insights, Badges, Fuel (fuel needs no log)", () => {
    expect(ids(base({ mode: "personal", persona: "personal" }))).toEqual(["insights", "badges", "fuel"]);
  });
  it("a row with nothing to say is skipped and the next moves up", () => {
    expect(ids(base({ texts: texts({ tax: null }) }))).toEqual(["insights", "earnings", "badges"]);
  });
  it("never more than three rows", () => {
    expect(selectDoorRows(base({ hasFuelLogs: true })).length).toBe(3);
  });
  it("an empty set returns no rows, not blanks", () => {
    expect(
      selectDoorRows(base({ texts: texts({ tax: null, insights: null, earnings: null, badges: null, fuel: null }) }))
    ).toEqual([]);
  });
});

describe("road alert and hiding", () => {
  it("a road alert takes the first row and pushes the last off", () => {
    const rows = selectDoorRows(base({ texts: texts({ road: { text: "A19 closed" } }) }));
    expect(rows.map((r) => r.id)).toEqual(["road", "tax", "insights"]);
    expect(rows[0].urgent).toBe(true);
  });
  it("a hidden row is dropped and the next moves up", () => {
    expect(ids(base({ hidden: ["tax"] }))).toEqual(["insights", "earnings", "badges"]);
  });
  it("hiding everything leaves only a road alert", () => {
    const rows = selectDoorRows(
      base({ hidden: ["tax", "insights", "earnings", "badges", "fuel"], texts: texts({ road: { text: "A19" } }) })
    );
    expect(rows.map((r) => r.id)).toEqual(["road"]);
  });
});

describe("new driver and end of week", () => {
  it("a new driver gets How MileClear works as the one door when nothing else can speak", () => {
    expect(ids(base({ totalTrips: 0, texts: texts({ tax: null, insights: null }) }))).toEqual(["help"]);
  });
  it("the Insights row leads from Sunday evening to Monday noon", () => {
    expect(ids(base({ endOfWeek: true }))).toEqual(["insights", "tax", "earnings"]);
    expect(doorOrder({ mode: "work", persona: "company", totalTrips: 5, endOfWeek: true })[0]).toBe("insights");
  });
  it("isEndOfWeek window", () => {
    expect(isEndOfWeek(new Date(2026, 9, 11, 18, 0))).toBe(true); // Sunday 18:00
    expect(isEndOfWeek(new Date(2026, 9, 11, 17, 59))).toBe(false);
    expect(isEndOfWeek(new Date(2026, 9, 12, 11, 59))).toBe(true); // Monday
    expect(isEndOfWeek(new Date(2026, 9, 12, 12, 0))).toBe(false);
    expect(isEndOfWeek(new Date(2026, 9, 14, 9, 0))).toBe(false);
  });
});

const wk = (over: Partial<WeekRecapLike> = {}): WeekRecapLike => ({
  totalMiles: 182,
  businessMiles: 170,
  totalTrips: 5,
  deductionPence: 5800,
  earningsPence: 41200,
  longestTripMiles: 41,
  longestTripDate: new Date(2026, 9, 5, 12).toISOString(), // a Monday
  change: { totalMilesPercent: 12 },
  ...over,
});

describe("door sentences", () => {
  const w = (over: Partial<Parameters<typeof insightsDoorText>[0]> = {}) => ({
    mode: "work" as const,
    persona: "gig" as const,
    endOfWeek: false,
    lastWeek: null,
    thisWeek: wk(),
    isPro: false,
    totalTrips: 24,
    ...over,
  });
  it("Work free: trips and claim built, no comparison", () => {
    expect(insightsDoorText(w())).toBe("This week: 5 trips, £58.00 claim built");
  });
  it("Work Pro adds the comparison", () => {
    expect(insightsDoorText(w({ isPro: true }))).toBe("This week: 5 trips, £58.00 claim built, up 12% on last week");
  });
  it("company drivers get miles, not a claim", () => {
    expect(insightsDoorText(w({ persona: "company" }))).toBe("This week: 5 trips, 182 miles");
  });
  it("Personal: miles and the longest trip with its weekday", () => {
    expect(insightsDoorText(w({ mode: "personal", persona: "personal" }))).toBe(
      "This week: 182 miles, longest 41 mi on Monday"
    );
  });
  it("Monday morning looks back at last week", () => {
    expect(insightsDoorText(w({ endOfWeek: true, lastWeek: wk() }))).toBe("Last week: 182 mi, £58.00. See your week");
  });
  it("a quiet week falls back to a plain line, never zeros", () => {
    expect(insightsDoorText(w({ thisWeek: wk({ totalTrips: 0, totalMiles: 0 }) }))).toBe(
      "Your miles and claim, week by week"
    );
  });
  it("nothing for a driver with no trips", () => {
    expect(insightsDoorText(w({ totalTrips: 0 }))).toBeNull();
  });
  it("earnings door needs earnings", () => {
    expect(earningsDoorText(wk())).toBe("£412.00 earned this week · £2.42 a mile");
    expect(earningsDoorText(wk({ earningsPence: 0 }))).toBeNull();
    expect(earningsDoorText(null)).toBeNull();
  });
  it("badge and fuel doors", () => {
    expect(badgesDoorText({ label: "Explorer", progressText: "22 mi to go" })).toBe("Next badge: Explorer, 22 mi to go");
    expect(badgesDoorText(null)).toBeNull();
    expect(
      fuelDoorText({ kind: "fuel", fuel: "diesel", stationName: "Tesco Silksworth", pencePerLitre: 139.9, distanceMiles: 1.2 })
    ).toBe("Diesel 139.9p at Tesco Silksworth, 1.2 mi");
    expect(fuelDoorText({ kind: "ev" })).toBeNull();
    expect(fuelDoorText(null)).toBeNull();
  });
  it("January season line", () => {
    expect(saSeasonText({ attentionCount: 2, daysToDeadline: 52 })).toBe(
      "Ready for 31 January? 2 things to sort · 52 days"
    );
    expect(saSeasonText({ attentionCount: 1, daysToDeadline: 1 })).toBe("Ready for 31 January? 1 thing to sort · 1 day");
    expect(saSeasonText({ attentionCount: 0, daysToDeadline: -2 })).toBeNull();
  });
  it("change phrase is Pro only and skips flat weeks", () => {
    expect(changePhrase(12, false)).toBeNull();
    expect(changePhrase(-8.4, true)).toBe("down 8%");
    expect(changePhrase(0.2, true)).toBeNull();
  });
});

describe("hidden door storage", () => {
  it("parses safely", () => {
    expect(parseHiddenDoorRows(null)).toEqual([]);
    expect(parseHiddenDoorRows("not json")).toEqual([]);
    expect(parseHiddenDoorRows('{"a":1}')).toEqual([]);
    expect(parseHiddenDoorRows('["fuel","tax","road","tax"]')).toEqual(["tax", "fuel"]);
  });
  it("adds, removes and keeps a stable order", () => {
    expect(withDoorRowHidden([], "fuel", true)).toEqual(["fuel"]);
    expect(withDoorRowHidden(["fuel"], "tax", true)).toEqual(["tax", "fuel"]);
    expect(withDoorRowHidden(["tax", "fuel"], "tax", false)).toEqual(["fuel"]);
    expect(withDoorRowHidden(["tax"], "tax", true)).toEqual(["tax"]);
  });
});
