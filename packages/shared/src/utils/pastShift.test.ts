import { describe, it, expect } from "vitest";
import {
  pastShiftProblem,
  windowCoveringTrips,
  pastShiftMilesProblem,
  clampedTripEnd,
  isSamePastShift,
  PAST_SHIFT_MAX_TRIPS,
  PAST_SHIFT_CLOCK_SLACK_MS,
  isTypedTotalTrip,
  typedTotalNote,
  pastShiftTotalsProblem,
  pastShiftTotalMilesProblem,
  pastShiftDropsProblem,
  isSameTypedTotal,
  tripJobCount,
} from "./pastShift";

const at = (hm: string, day = "2026-10-03") => new Date(`${day}T${hm}:00Z`);
const NOW = at("23:00").getTime();

function check(start: string, end: string, trips: Array<[string, string | null]>, now = NOW) {
  return pastShiftProblem({
    startedAt: at(start),
    endedAt: at(end),
    trips: trips.map(([s, e]) => ({ startedAt: at(s), endedAt: e ? at(e) : null })),
    now,
  });
}

describe("pastShiftProblem", () => {
  it("accepts a shift whose trips sit inside it", () => {
    expect(check("09:00", "13:00", [["09:10", "09:40"], ["09:40", "10:05"]])).toBeNull();
  });

  it("accepts a trip with no end", () => {
    expect(check("09:00", "13:00", [["10:00", null]])).toBeNull();
  });

  it("wants the end after the start", () => {
    expect(check("13:00", "13:00", [["13:00", null]])).toBe("The shift has to end after it starts.");
    expect(check("13:00", "09:00", [["10:00", null]])).toBe("The shift has to end after it starts.");
  });

  it("caps the shift at 24 hours on the clock, allowing the 25-hour night the clocks go back", () => {
    const over = pastShiftProblem({
      startedAt: at("09:00", "2026-10-01"),
      endedAt: at("10:01", "2026-10-02"),
      trips: [{ startedAt: at("10:00", "2026-10-01") }],
      now: NOW,
    });
    expect(over).toBe("A shift can be up to 24 hours long.");
    // 25 Oct 2026: 00:00 to 23:59 on the clock is 24 h 59 min of real time.
    const clocksBack = pastShiftProblem({
      startedAt: new Date("2026-10-24T23:00:00Z"),
      endedAt: new Date("2026-10-25T23:59:00Z"),
      trips: [{ startedAt: new Date("2026-10-25T08:00:00Z") }],
      now: new Date("2026-10-26T12:00:00Z").getTime(),
    });
    expect(clocksBack).toBeNull();
  });

  it("caps the shift's miles", () => {
    expect(check("09:00", "13:00", [["09:10", "09:40"]])).toBeNull();
    const p = pastShiftProblem({
      startedAt: at("09:00"),
      endedAt: at("13:00"),
      trips: [
        { startedAt: at("09:10"), distanceMiles: 600 },
        { startedAt: at("11:00"), distanceMiles: 401 },
      ],
      now: NOW,
    });
    expect(p).toBe("That's over 1,000 miles for one shift. Check where each trip started and ended.");
    expect(pastShiftMilesProblem([500, 500])).toBeNull();
  });

  it("refuses a shift that ends after now, with a little clock slack", () => {
    expect(check("20:00", "23:30", [["21:00", null]])).toBe("The shift can't end later than now.");
    const justAhead = at("23:00").getTime() + PAST_SHIFT_CLOCK_SLACK_MS - 1000;
    expect(
      pastShiftProblem({
        startedAt: at("20:00"),
        endedAt: new Date(justAhead),
        trips: [{ startedAt: at("21:00") }],
        now: NOW,
      })
    ).toBeNull();
  });

  it("wants at least one trip and not too many", () => {
    expect(check("09:00", "13:00", [])).toBe("Add at least one trip.");
    const many = Array.from({ length: PAST_SHIFT_MAX_TRIPS + 1 }, () => ["10:00", null] as [string, null]);
    expect(check("09:00", "13:00", many)).toBe(`A shift can have up to ${PAST_SHIFT_MAX_TRIPS} trips.`);
  });

  it("names the trip that ends before it starts", () => {
    expect(check("09:00", "13:00", [["09:10", "09:40"], ["10:30", "10:00"]])).toBe(
      "Trip 2 can't end before it starts."
    );
  });

  it("names a trip outside the shift", () => {
    expect(check("09:00", "13:00", [["08:50", "09:20"]])).toBe("Trip 1 is outside the shift's times.");
    expect(check("09:00", "13:00", [["12:50", "13:20"]])).toBe("Trip 1 is outside the shift's times.");
    expect(check("09:00", "13:00", [["13:30", null]])).toBe("Trip 1 is outside the shift's times.");
  });

  it("names a trip later than now before the window rule", () => {
    const p = pastShiftProblem({
      startedAt: at("20:00"),
      endedAt: at("22:00"),
      trips: [{ startedAt: at("23:30") }],
      now: NOW,
    });
    expect(p).toBe("Trip 1 is later than now.");
  });

  it("asks for the times when a date is unreadable", () => {
    expect(
      pastShiftProblem({ startedAt: new Date("x"), endedAt: at("10:00"), trips: [], now: NOW })
    ).toBe("Add when the shift started and ended.");
  });
});

describe("windowCoveringTrips", () => {
  it("keeps the window when every trip fits", () => {
    const w = windowCoveringTrips(at("09:00"), at("13:00"), [{ startedAt: at("10:00"), endedAt: at("10:30") }]);
    expect(w.startedAt).toEqual(at("09:00"));
    expect(w.endedAt).toEqual(at("13:00"));
  });

  it("stretches both ends to hold the trips", () => {
    const w = windowCoveringTrips(at("09:00"), at("13:00"), [
      { startedAt: at("08:40"), endedAt: at("09:15") },
      { startedAt: at("12:50"), endedAt: at("13:25") },
      { startedAt: at("13:40"), endedAt: null },
    ]);
    expect(w.startedAt).toEqual(at("08:40"));
    expect(w.endedAt).toEqual(at("13:40"));
  });
});

describe("clampedTripEnd", () => {
  it("is set-off plus the drive time", () => {
    expect(clampedTripEnd({ startedAt: at("09:10"), routedSecs: 1200, shiftEnd: at("13:00"), now: NOW })).toEqual(at("09:30"));
  });

  it("is one minute without a route", () => {
    expect(clampedTripEnd({ startedAt: at("09:10"), routedSecs: null, shiftEnd: at("13:00"), now: NOW })).toEqual(at("09:11"));
  });

  it("never runs past the shift's end or now", () => {
    expect(clampedTripEnd({ startedAt: at("12:50"), routedSecs: 1800, shiftEnd: at("13:00"), now: NOW })).toEqual(at("13:00"));
    expect(
      clampedTripEnd({ startedAt: at("22:50"), routedSecs: 1800, shiftEnd: at("23:30"), now: at("23:00").getTime() })
    ).toEqual(at("23:00"));
  });
});

describe("isSamePastShift", () => {
  const trips = [
    { startedAt: at("09:10"), startLat: 53.8, startLng: -1.55 },
    { startedAt: at("09:30"), startLat: 53.81, startLng: -1.56 },
  ];
  const earning = { platform: "deliveroo", amountPence: 6450 };

  it("matches the same save sent again, in any order", () => {
    expect(isSamePastShift({ trips, earning }, { trips: [...trips].reverse(), earning: { ...earning } })).toBe(true);
    expect(isSamePastShift({ trips, earning: null }, { trips, earning: null })).toBe(true);
  });

  it("allows a pin a few metres off", () => {
    const nudged = [{ ...trips[0], startLat: 53.8002 }, trips[1]];
    expect(isSamePastShift({ trips, earning }, { trips: nudged, earning })).toBe(true);
  });

  it("is a different save with another trip, time, place or earning", () => {
    const extra = [...trips, { startedAt: at("10:00"), startLat: 53.79, startLng: -1.54 }];
    expect(isSamePastShift({ trips, earning }, { trips: extra, earning })).toBe(false);
    expect(
      isSamePastShift({ trips, earning }, { trips: [{ ...trips[0], startedAt: at("09:11") }, trips[1]], earning })
    ).toBe(false);
    expect(isSamePastShift({ trips, earning }, { trips: [{ ...trips[0], startLat: 53.9 }, trips[1]], earning })).toBe(false);
    expect(isSamePastShift({ trips, earning }, { trips, earning: { ...earning, amountPence: 4000 } })).toBe(false);
    expect(isSamePastShift({ trips, earning: null }, { trips, earning })).toBe(false);
    expect(isSamePastShift({ trips, earning }, { trips, earning: null })).toBe(false);
  });
});

describe("just the totals", () => {
  const totals = (miles: number | null, drops?: number | null, start = "09:00", end = "17:00") =>
    pastShiftTotalsProblem({ startedAt: at(start), endedAt: at(end), distanceMiles: miles, drops, now: NOW });

  it("accepts miles with or without drops", () => {
    expect(totals(84)).toBeNull();
    expect(totals(84, 32)).toBeNull();
    expect(totals(0.4, 1)).toBeNull();
    expect(totals(1000, 500)).toBeNull();
  });

  it("wants miles above 0 and no more than 1,000", () => {
    expect(totals(null)).toBe("Add the total miles for the shift.");
    expect(totals(0)).toBe("Add the total miles for the shift.");
    expect(totals(-3)).toBe("Add the total miles for the shift.");
    expect(totals(1000.1)).toBe("That's over 1,000 miles for one shift. Check the total miles.");
    expect(pastShiftTotalMilesProblem(Number.NaN)).toBe("Add the total miles for the shift.");
  });

  it("wants drops as a whole number from 1 to 500", () => {
    const msg = "The number of drops must be a whole number from 1 to 500.";
    expect(totals(84, 0)).toBe(msg);
    expect(totals(84, 501)).toBe(msg);
    expect(totals(84, 2.5)).toBe(msg);
    expect(pastShiftDropsProblem(null)).toBeNull();
    expect(pastShiftDropsProblem(undefined)).toBeNull();
  });

  it("checks the shift's times by the same rules as trip by trip", () => {
    expect(totals(84, 32, "17:00", "09:00")).toBe("The shift has to end after it starts.");
    expect(totals(84, 32, "09:00", "23:30")).toBe("The shift can't end later than now.");
  });

  it("writes the drops note", () => {
    expect(typedTotalNote(32)).toBe("32 drops, total entered by you");
    expect(typedTotalNote(1)).toBe("1 drop, total entered by you");
    expect(typedTotalNote(null)).toBe("Shift total entered by you");
    expect(typedTotalNote(undefined)).toBe("Shift total entered by you");
  });

  it("knows a typed-total trip from its gpsQuality", () => {
    expect(isTypedTotalTrip({ distanceSource: "typed_total", drops: 32 })).toBe(true);
    expect(isTypedTotalTrip({ distanceSource: "match" })).toBe(false);
    expect(isTypedTotalTrip(null)).toBe(false);
    expect(isTypedTotalTrip("typed_total")).toBe(false);
    expect(isTypedTotalTrip([{ distanceSource: "typed_total" }])).toBe(false);
  });
});

describe("isSameTypedTotal", () => {
  const saved = { distanceMiles: 84, platformTag: "deliveroo", gpsQuality: { distanceSource: "typed_total", drops: 32 } };
  it("matches only the same miles, drops and app", () => {
    expect(isSameTypedTotal(saved, { distanceMiles: 84, drops: 32, platformTag: "deliveroo" })).toBe(true);
    expect(isSameTypedTotal(saved, { distanceMiles: 84.5, drops: 32, platformTag: "deliveroo" })).toBe(false);
    expect(isSameTypedTotal(saved, { distanceMiles: 84, drops: 30, platformTag: "deliveroo" })).toBe(false);
    expect(isSameTypedTotal(saved, { distanceMiles: 84, platformTag: "deliveroo" })).toBe(false);
    expect(isSameTypedTotal(saved, { distanceMiles: 84, drops: 32, platformTag: null })).toBe(false);
    expect(isSameTypedTotal({ ...saved, gpsQuality: null }, { distanceMiles: 84, drops: 32, platformTag: "deliveroo" })).toBe(false);
  });
});

describe("tripJobCount", () => {
  it("is a total's drops, else 1", () => {
    expect(tripJobCount({ distanceSource: "typed_total", drops: 32 })).toBe(32);
    expect(tripJobCount({ distanceSource: "typed_total", drops: null })).toBe(1);
    expect(tripJobCount({ distanceSource: "match" })).toBe(1);
    expect(tripJobCount(null)).toBe(1);
  });
});
