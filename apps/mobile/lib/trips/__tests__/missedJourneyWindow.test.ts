import { describe, it, expect } from "vitest";
import {
  ASK_WHEN_SLACK_OVER_MS,
  checkChosenStart,
  describeRecordedTimes,
  describeStartRange,
  describeTravel,
  describeWindow,
  needsTimeChoice,
  startBounds,
  travelMsFor,
  tripTimesFor,
} from "../missedJourneyWindow";

const MIN = 60 * 1000;
// Local-time constructors, so the words come out the same in any time zone.
const local = (d: number, h: number, m: number, s = 0) => new Date(2026, 8, d, h, m, s);

// Elisa Barone, 28 Sep 2026: at work at 07:07, next trip at 17:45.
const elisa = { departedAt: local(28, 7, 7, 43), arrivedAt: local(28, 17, 45) };

describe("travelMsFor", () => {
  it("uses the routed duration, rounded up to the minute", () => {
    expect(travelMsFor({ routedSecs: 14 * 60 + 5, estimatedMiles: 5 })).toBe(15 * MIN);
  });
  it("falls back to the miles at 20 mph", () => {
    expect(travelMsFor({ routedSecs: null, estimatedMiles: 5 })).toBe(15 * MIN);
    expect(travelMsFor({ routedSecs: 0, estimatedMiles: 10 })).toBe(30 * MIN);
  });
  it("is never under a minute", () => {
    expect(travelMsFor({ routedSecs: null, estimatedMiles: 0 })).toBe(MIN);
    expect(travelMsFor({ routedSecs: 10, estimatedMiles: Number.NaN })).toBe(MIN);
  });
});

describe("needsTimeChoice", () => {
  it("asks for Elisa's ten-hour gap", () => {
    expect(needsTimeChoice("gap", elisa, 15 * MIN)).toBe(true);
  });
  it("does not ask when the window is barely longer than the drive", () => {
    const tight = { departedAt: local(28, 7, 0), arrivedAt: local(28, 7, 45) };
    expect(needsTimeChoice("gap", tight, 15 * MIN)).toBe(false); // 30 min of slack exactly
    expect(needsTimeChoice("gap", tight, 15 * MIN - 1)).toBe(true);
    expect(ASK_WHEN_SLACK_OVER_MS).toBe(30 * MIN);
  });
  it("never asks for a drive we recorded, a trip start, or an unknown source", () => {
    for (const s of ["recorded", "dropped_walk", "dropped_drive", "dropped_phantom", "dropped_start_trip", "trip_start", undefined]) {
      expect(needsTimeChoice(s, elisa, 15 * MIN)).toBe(false);
    }
  });
  it("never asks on a window that is empty or backwards", () => {
    expect(needsTimeChoice("gap", { departedAt: local(28, 9, 0), arrivedAt: local(28, 8, 0) }, MIN)).toBe(false);
  });
});

describe("startBounds", () => {
  it("runs from the window's first whole minute to the last start that arrives in time", () => {
    const b = startBounds(elisa, 15 * MIN);
    expect(b.earliest).toEqual(local(28, 7, 8));
    expect(b.latest).toEqual(local(28, 17, 30));
  });
  it("never has the latest before the earliest when the drive fills the window", () => {
    const tight = { departedAt: local(28, 7, 0), arrivedAt: local(28, 7, 10) };
    const b = startBounds(tight, 20 * MIN);
    expect(b.latest).toEqual(b.earliest);
  });
});

describe("checkChosenStart", () => {
  const b = startBounds(elisa, 15 * MIN);
  it("accepts a time inside, including both ends", () => {
    expect(checkChosenStart(local(28, 17, 30), b)).toBe("ok");
    expect(checkChosenStart(local(28, 7, 8), b)).toBe("ok");
    expect(checkChosenStart(local(28, 17, 30, 59), b)).toBe("ok");
  });
  it("refuses a time before the previous trip ended", () => {
    expect(checkChosenStart(local(28, 7, 0), b)).toBe("too_early");
  });
  it("refuses a time that would arrive after the next trip began", () => {
    expect(checkChosenStart(local(28, 17, 31), b)).toBe("too_late");
    expect(checkChosenStart(local(29, 9, 0), b)).toBe("too_late");
  });
});

describe("tripTimesFor", () => {
  it("lasts as long as the route from the chosen minute", () => {
    const t = tripTimesFor(local(28, 17, 30, 20), 15 * MIN, elisa);
    expect(t.startedAt).toEqual(local(28, 17, 30));
    expect(t.endedAt).toEqual(local(28, 17, 45));
  });
  it("never ends after the window closes", () => {
    const t = tripTimesFor(local(28, 17, 40), 15 * MIN, elisa);
    expect(t.endedAt).toEqual(elisa.arrivedAt);
  });
  it("is never shorter than a minute", () => {
    const t = tripTimesFor(local(28, 12, 0), 0, elisa);
    expect(t.endedAt.getTime() - t.startedAt.getTime()).toBe(MIN);
  });
});

describe("words", () => {
  it("says the window plainly on one day", () => {
    expect(describeWindow(elisa)).toBe("sometime between 07:07 and 17:45 on Mon 28 Sep");
  });
  it("names both days when the window crosses midnight", () => {
    expect(describeWindow({ departedAt: local(28, 19, 51), arrivedAt: local(29, 8, 5) })).toBe(
      "sometime between 19:51 on Mon 28 Sep and 08:05 on Tue 29 Sep"
    );
  });
  it("gives a recorded drive its own times", () => {
    expect(describeRecordedTimes({ departedAt: local(28, 7, 7), arrivedAt: local(28, 7, 25) })).toBe(
      "Mon 28 Sep, 07:07 to 07:25"
    );
    expect(describeRecordedTimes({ departedAt: local(28, 23, 50), arrivedAt: local(29, 0, 20) })).toBe(
      "Mon 28 Sep 23:50 to Tue 29 Sep 00:20"
    );
  });
  it("says the range of set-off times", () => {
    expect(describeStartRange(startBounds(elisa, 15 * MIN))).toBe("any time from 07:08 to 17:30");
    expect(
      describeStartRange(startBounds({ departedAt: local(28, 19, 51), arrivedAt: local(29, 8, 5) }, 15 * MIN))
    ).toBe("any time from 19:51 on Mon 28 Sep to 07:50 on Tue 29 Sep");
  });
  it("says how long the drive takes", () => {
    expect(describeTravel(15 * MIN)).toBe("about 15 min");
    expect(describeTravel(60 * MIN)).toBe("about 1 hr");
    expect(describeTravel(70 * MIN)).toBe("about 1 hr 10 min");
    expect(describeTravel(0)).toBe("about 1 min");
  });
});
