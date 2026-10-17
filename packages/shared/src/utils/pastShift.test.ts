import { describe, it, expect } from "vitest";
import {
  pastShiftProblem,
  windowCoveringTrips,
  PAST_SHIFT_MAX_TRIPS,
  PAST_SHIFT_CLOCK_SLACK_MS,
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

  it("caps the shift at 24 hours", () => {
    const p = pastShiftProblem({
      startedAt: at("09:00", "2026-10-01"),
      endedAt: at("09:01", "2026-10-02"),
      trips: [{ startedAt: at("10:00", "2026-10-01") }],
      now: NOW,
    });
    expect(p).toBe("A shift can be up to 24 hours long.");
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
