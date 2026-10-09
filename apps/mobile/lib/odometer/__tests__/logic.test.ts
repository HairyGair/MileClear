import { describe, it, expect } from "vitest";
import {
  formatOdo,
  parseReadingInput,
  sanitiseReadingInput,
  checkReading,
  saveOutcomeMessage,
  basisText,
  oldReadingText,
  vehicleCardMeta,
  dayLineText,
  dayLineA11y,
  selectDayLines,
  loadedRange,
  differenceLine,
  differenceAlert,
  mileageRowParts,
  periodRange,
  validateCustomRange,
  shouldShowOdometerPrompt,
  latestAcceptedBefore,
  pickMotHint,
  motHintText,
  isNetworkError,
  digitGroups,
  fitsDigitCells,
  splitShares,
  liveHint,
  classifyConflict,
  higherThanLaterAlert,
} from "../logic";
import type { OdometerCurrent, OdometerDay, OdometerReadingRow } from "../../api/odometer";

const NOW = new Date(2026, 9, 9, 12, 0); // Fri 9 Oct 2026, 12:00 local

function reading(over: Partial<OdometerReadingRow>): OdometerReadingRow {
  return {
    id: "r1",
    readingMiles: 45100,
    readAt: new Date(2026, 9, 8, 18, 40).toISOString(),
    source: "user",
    sourceId: "r1",
    used: true,
    rejectReason: null,
    ...over,
  };
}

function day(over: Partial<OdometerDay>): OdometerDay {
  return {
    date: "2026-10-09",
    vehicleId: "v1",
    opening: 45210,
    openingRecorded: false,
    closing: 45262,
    closingRecorded: false,
    businessMiles: 40.1,
    personalMiles: 11.8,
    notSortedMiles: 0,
    tripCount: 3,
    difference: 0,
    openingDifference: 0,
    ...over,
  };
}

const base = (over: Partial<Parameters<typeof checkReading>[0]> = {}) => ({
  text: "45262",
  readAt: NOW,
  now: NOW,
  estimateMiles: null,
  readings: [] as OdometerReadingRow[],
  mot: null,
  ...over,
});

describe("formatOdo", () => {
  it("groups thousands and rounds to whole miles", () => {
    expect(formatOdo(45262.4)).toBe("45,262");
    expect(formatOdo(999)).toBe("999");
    expect(formatOdo(1234567)).toBe("1,234,567");
    expect(formatOdo(45137.6)).toBe("45,138");
  });
});

describe("reading input", () => {
  it("strips everything but digits and one decimal point", () => {
    expect(sanitiseReadingInput("45,262 mi")).toBe("45262");
    expect(sanitiseReadingInput("45.2.6")).toBe("45.26");
  });
  it("parses empty, invalid and ok", () => {
    expect(parseReadingInput("  ").kind).toBe("empty");
    expect(parseReadingInput("0").kind).toBe("invalid");
    expect(parseReadingInput("1000000").kind).toBe("invalid");
    expect(parseReadingInput("abc").kind).toBe("empty");
    expect(parseReadingInput("45100.5")).toEqual({ kind: "ok", miles: 45100.5 });
  });
});

describe("checkReading", () => {
  it("rejects empty and nonsense with the spec copy", () => {
    expect(checkReading(base({ text: "" }))).toEqual({
      kind: "error",
      message: "Type the reading from your dashboard.",
    });
    expect(checkReading(base({ text: "0" }))).toEqual({
      kind: "error",
      message: "That doesn't look like an odometer reading. Check it and try again.",
    });
  });

  it("rejects a time in the future", () => {
    const r = checkReading(base({ readAt: new Date(NOW.getTime() + 60_000) }));
    expect(r).toEqual({ kind: "error", message: "That time hasn't happened yet." });
  });

  it("blocks a reading lower than the latest earlier one", () => {
    const r = checkReading(base({ text: "45000", readings: [reading({})] }));
    expect(r.kind).toBe("blocked");
  });

  it("ignores unused readings and readings after the chosen time", () => {
    const unused = reading({ used: false });
    const later = reading({ id: "r2", readAt: new Date(2026, 9, 9, 18, 0).toISOString() });
    const r = checkReading(base({ text: "45000", readings: [unused, later] }));
    expect(r.kind).toBe("ok");
  });

  it("confirms a reading more than 1,000 miles above the estimate", () => {
    const r = checkReading(base({ text: "85774", estimateMiles: 45262.4, readings: [reading({})] }));
    expect(r).toEqual({
      kind: "confirm",
      title: "That's 40,512 miles more than we expected",
      body: "We estimated about 45,262. Is 85,774 right?",
    });
  });

  it("accepts exactly 1,000 above the estimate", () => {
    expect(checkReading(base({ text: "46262", estimateMiles: 45262 })).kind).toBe("ok");
  });

  it("accepts a reading below the estimate but not below the last reading", () => {
    const r = checkReading(base({ text: "45150", estimateMiles: 45166, readings: [reading({})] }));
    expect(r.kind).toBe("ok");
  });

  const mot = { date: new Date(2026, 2, 12), miles: 41230 };

  it("checks a first reading against the MOT", () => {
    expect(checkReading(base({ text: "4123", mot }))).toEqual({
      kind: "confirm",
      title: "That's lower than your last MOT",
      body: "Your MOT on 12 Mar 2026 recorded 41,230 miles. Is 4,123 right?",
    });
    expect(checkReading(base({ text: "412300", mot }))).toEqual({
      kind: "confirm",
      title: "That's a lot more than your last MOT",
      body: "Your MOT on 12 Mar 2026 recorded 41,230 miles. Is 412,300 right?",
    });
    expect(checkReading(base({ text: "45100", mot })).kind).toBe("ok");
  });

  it("skips the MOT check once an earlier reading exists", () => {
    expect(checkReading(base({ text: "45200", mot, readings: [reading({})] })).kind).toBe("ok");
  });

  it("picks the latest accepted reading before a time", () => {
    const a = reading({ id: "a", readAt: new Date(2026, 9, 1).toISOString(), readingMiles: 100 });
    const b = reading({ id: "b", readAt: new Date(2026, 9, 5).toISOString(), readingMiles: 200 });
    expect(latestAcceptedBefore([b, a], NOW)?.id).toBe("b");
    expect(latestAcceptedBefore([b, a], new Date(2026, 9, 3))?.id).toBe("a");
  });
});

describe("saveOutcomeMessage", () => {
  it("covers the four cases", () => {
    expect(saveOutcomeMessage(null, 45100)).toBe("Saved. Your trips will be added from here.");
    expect(saveOutcomeMessage(45262, 45262.5)).toBe("Saved. That matches your trips.");
    expect(saveOutcomeMessage(45138, 45146)).toBe(
      "Saved. That's 8 miles more than your trips. Your log uses it from then on."
    );
    expect(saveOutcomeMessage(45166, 45160)).toBe(
      "Saved. That's 6 miles less than your trips. Your log uses it from then on."
    );
  });
});

describe("basisText and old reading", () => {
  const current = (over: Partial<OdometerCurrent> = {}): OdometerCurrent => ({
    miles: 45138.2,
    isEstimated: true,
    basis: {
      readingMiles: 45100,
      readAt: new Date(2026, 9, 8, 18, 40).toISOString(),
      source: "user",
      sourceId: "r1",
    },
    tripMilesSince: 38.2,
    ...over,
  });

  it("explains a typed reading plus trips", () => {
    expect(basisText(current())).toBe("Your reading of 45,100 on Thu 8 Oct, plus 38 miles of trips since.");
  });
  it("explains a recorded reading with nothing since", () => {
    expect(basisText(current({ isEstimated: false, tripMilesSince: 0, miles: 45100 }))).toBe(
      "Your reading on Thu 8 Oct, 18:40."
    );
  });
  it("names fuel and trip sources", () => {
    const fuel = current({ basis: { ...current().basis, source: "fuel" } });
    const trip = current({ basis: { ...current().basis, source: "trip" } });
    expect(basisText(fuel)).toBe("From your fuel log on Thu 8 Oct, plus 38 miles of trips since.");
    expect(basisText(trip)).toBe("From a trip on Thu 8 Oct, plus 38 miles of trips since.");
  });
  it("says 1 mile, not 1 miles", () => {
    expect(basisText(current({ tripMilesSince: 1.2 }))).toContain("plus 1 mile of trips since.");
  });
  it("flags readings older than 60 days only", () => {
    const old = current({ basis: { ...current().basis, readAt: new Date(2026, 6, 27).toISOString() } });
    expect(oldReadingText(old, NOW)).toBe(
      "Last reading was 74 days ago. Worth checking it against your dashboard."
    );
    expect(oldReadingText(current(), NOW)).toBeNull();
  });
});

describe("vehicleCardMeta", () => {
  it("marks estimates", () => {
    expect(vehicleCardMeta({ miles: 45262.3, isEstimated: true })).toBe("45,262 mi est.");
    expect(vehicleCardMeta({ miles: 45140, isEstimated: false })).toBe("45,140 mi");
    expect(vehicleCardMeta(null)).toBeNull();
  });
});

describe("Trips day line", () => {
  it("words estimated and recorded days", () => {
    expect(dayLineText(day({}))).toBe("Odometer 45,210 to 45,262 est.");
    expect(dayLineText(day({ openingRecorded: true }))).toBe("Odometer 45,210 to 45,262 est.");
    expect(dayLineText(day({ openingRecorded: true, closingRecorded: true }))).toBe(
      "Odometer 45,210 to 45,262 (recorded)"
    );
    expect(dayLineA11y(day({}))).toContain("estimated");
    expect(dayLineA11y(day({}))).not.toContain("est.");
  });

  it("only gives lines to visible single-vehicle days with both figures", () => {
    const days = [
      day({ date: "2026-10-09" }),
      day({ date: "2026-10-08", opening: null }),
      day({ date: "2026-10-07", vehicleId: "v1" }),
      day({ date: "2026-10-07", vehicleId: "v2" }),
      day({ date: "2026-10-01" }),
    ];
    const lines = selectDayLines(days, ["2026-10-09", "2026-10-08", "2026-10-07"]);
    expect([...lines.keys()]).toEqual(["2026-10-09"]);
  });

  it("works out the loaded range and caps it at 366 days", () => {
    expect(loadedRange([])).toBeNull();
    expect(loadedRange(["2026-10-09", "2026-10-02"])).toEqual({ from: "2026-10-02", to: "2026-10-09" });
    const capped = loadedRange(["2026-10-09", "2024-01-01"]);
    expect(capped?.to).toBe("2026-10-09");
    expect(capped?.from).toBe("2025-10-09");
  });
});

describe("log day cards", () => {
  it("shows the difference only when it rounds to something", () => {
    expect(differenceLine(8)).toBe("Readings differ from trips by +8 mi");
    expect(differenceLine(-12)).toBe("Readings differ from trips by -12 mi");
    expect(differenceLine(0.3)).toBeNull();
  });
  it("words the alert for both directions", () => {
    expect(differenceAlert(8).body).toBe(
      "Your odometer reading was 8 miles more than your recorded trips. Usually a short drive that wasn't recorded, or GPS measuring a little differently to your car."
    );
    expect(differenceAlert(-8).body).toBe(
      "Your odometer reading was 8 miles less than your recorded trips. Usually GPS measuring a little differently to your car."
    );
  });
  it("lists Not sorted only when non-zero", () => {
    expect(mileageRowParts(day({}))).toEqual(["Business 40.1 mi", "Personal 11.8 mi"]);
    expect(mileageRowParts(day({ notSortedMiles: 3 }))).toEqual([
      "Business 40.1 mi",
      "Personal 11.8 mi",
      "Not sorted 3.0 mi",
    ]);
  });
});

describe("periods", () => {
  it("runs Monday to today for this week", () => {
    expect(periodRange("this_week", NOW)).toEqual({ from: "2026-10-05", to: "2026-10-09" });
  });
  it("gives last week Monday to Sunday", () => {
    expect(periodRange("last_week", NOW)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });
  it("gives this month from the 1st", () => {
    expect(periodRange("this_month", NOW)).toEqual({ from: "2026-10-01", to: "2026-10-09" });
  });
  it("treats Sunday as the end of the week", () => {
    expect(periodRange("this_week", new Date(2026, 9, 11, 9))).toEqual({ from: "2026-10-05", to: "2026-10-11" });
  });
  it("validates custom ranges", () => {
    expect(validateCustomRange(new Date(2026, 9, 1), new Date(2026, 9, 9))).toBeNull();
    expect(validateCustomRange(new Date(2026, 9, 9), new Date(2026, 9, 1))).not.toBeNull();
    expect(validateCustomRange(new Date(2025, 0, 1), new Date(2026, 9, 9))).not.toBeNull();
  });
});

describe("Home prompt gate", () => {
  const ok = { isWork: true, vehicleCount: 1, defaultVehicleHasReading: false, completedTrips: 3, dismissedOnDevice: false };
  it("shows when every condition holds", () => {
    expect(shouldShowOdometerPrompt(ok)).toBe(true);
  });
  it("stays hidden otherwise", () => {
    expect(shouldShowOdometerPrompt({ ...ok, isWork: false })).toBe(false);
    expect(shouldShowOdometerPrompt({ ...ok, vehicleCount: 0 })).toBe(false);
    expect(shouldShowOdometerPrompt({ ...ok, defaultVehicleHasReading: true })).toBe(false);
    expect(shouldShowOdometerPrompt({ ...ok, completedTrips: 2 })).toBe(false);
    expect(shouldShowOdometerPrompt({ ...ok, dismissedOnDevice: true })).toBe(false);
  });
});

describe("MOT hint", () => {
  const tests = [
    { completedDate: "2025-03-10T10:00:00Z", odometerValue: 30000, odometerUnit: "mi" },
    { completedDate: "2026-03-12T10:00:00Z", odometerValue: 41230, odometerUnit: "mi" },
    { completedDate: "2026-04-01T10:00:00Z", odometerValue: null, odometerUnit: null },
  ];
  it("uses the newest test that recorded miles", () => {
    const hint = pickMotHint(tests);
    expect(hint?.miles).toBe(41230);
    expect(motHintText(hint!)).toBe("Your last MOT (12 Mar 2026) recorded 41,230 miles.");
  });
  it("gives nothing for kilometres or no data", () => {
    expect(pickMotHint([{ completedDate: "2026-03-12T10:00:00Z", odometerValue: 66000, odometerUnit: "km" }])).toBeNull();
    expect(pickMotHint([])).toBeNull();
    expect(pickMotHint(null)).toBeNull();
  });
});

describe("isNetworkError", () => {
  it("spots connectivity failures only", () => {
    expect(isNetworkError(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkError(new Error("Network error"))).toBe(true);
    expect(isNetworkError(new Error("Request failed (HTTP 500)."))).toBe(false);
    expect(isNetworkError("nope")).toBe(false);
  });
});

describe("digit cells", () => {
  it("groups thousands with no leading zeros or tenths", () => {
    expect(digitGroups(45262.4)).toEqual([["4", "5"], ["2", "6", "2"]]);
    expect(digitGroups(123456)).toEqual([["1", "2", "3"], ["4", "5", "6"]]);
    expect(digitGroups(987)).toEqual([["9", "8", "7"]]);
    expect(digitGroups(1000)).toEqual([["1"], ["0", "0", "0"]]);
    expect(digitGroups(0)).toEqual([["0"]]);
  });
  it("falls back above seven digits", () => {
    expect(fitsDigitCells(9999999)).toBe(true);
    expect(fitsDigitCells(10000000)).toBe(false);
  });
});

describe("splitShares", () => {
  it("divides a day's miles and survives zero", () => {
    const s = splitShares({ businessMiles: 30, personalMiles: 10, notSortedMiles: 0 });
    expect(s.business).toBeCloseTo(0.75);
    expect(s.personal).toBeCloseTo(0.25);
    expect(splitShares({ businessMiles: 0, personalMiles: 0, notSortedMiles: 0 })).toEqual({ business: 0, personal: 0, notSorted: 0 });
  });
});

describe("liveHint", () => {
  const earlier = { readingMiles: 86900, readAt: new Date(2026, 9, 2).toISOString() };
  it("is silent until a valid number", () => {
    expect(liveHint({ text: "", estimateMiles: 87432, earlier }).tone).toBe("none");
  });
  it("covers each state", () => {
    expect(liveHint({ text: "87440", estimateMiles: 87432, earlier }).message).toBe("Close to our estimate");
    expect(liveHint({ text: "87744", estimateMiles: 87432, earlier }).message).toBe(
      "312 mi more than we estimated. Trips without the app make up the difference."
    );
    expect(liveHint({ text: "87384", estimateMiles: 87432, earlier }).message).toBe("48 mi less than we estimated.");
    const low = liveHint({ text: "85000", estimateMiles: 87432, earlier });
    expect(low.tone).toBe("error");
    expect(low.message).toBe("Lower than your reading of 86,900 on Fri 2 Oct. Check the number.");
    expect(liveHint({ text: "99832", estimateMiles: 87432, earlier }).tone).toBe("warn");
  });
});

describe("classifyConflict", () => {
  const at = (d: number, h = 12) => new Date(2026, 9, d, h).toISOString();
  const rows = [
    reading({ id: "b", readingMiles: 45300, readAt: at(10) }),
    reading({ id: "a", readingMiles: 45100, readAt: at(8) }),
  ];
  it("names a higher earlier reading as lower-than-earlier", () => {
    const c = classifyConflict(rows, 45000, new Date(2026, 9, 9));
    expect(c?.kind).toBe("lower");
    expect(c?.otherMiles).toBe(45100);
  });
  it("names a lower later typed reading as higher-than-later", () => {
    const c = classifyConflict(rows, 45400, new Date(2026, 9, 9));
    expect(c?.kind).toBe("higher");
    expect(c?.otherMiles).toBe(45300);
  });
  it("ignores unused and non-typed later readings", () => {
    const odd = [
      reading({ id: "x", readingMiles: 45200, readAt: at(10), used: false }),
      reading({ id: "y", readingMiles: 45200, readAt: at(11), source: "fuel" }),
    ];
    expect(classifyConflict(odd, 45400, new Date(2026, 9, 9))).toBeNull();
  });
  it("words the higher alert", () => {
    expect(higherThanLaterAlert(45300, new Date(2026, 9, 10)).body).toBe(
      "That's higher than your reading of 45,300 on Sat 10 Oct, which was taken later. Check the reading or the time."
    );
  });
});
