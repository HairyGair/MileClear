import { describe, it, expect } from "vitest";
import {
  arrivalFor,
  buildPastShiftBody,
  chainedTrip,
  emptyTrip,
  missingForPastShift,
  mostUsedPlatform,
  moveTripTimes,
  parseAmountPence,
  planShiftWindow,
  sentSaveFailureMessage,
  stableBodyText,
  tripOnAnotherDay,
  tripsRunIntoEachOther,
  PAST_SHIFT_UNCONFIRMED_MESSAGE,
  type DraftTrip,
} from "../pastShiftRule";

describe("moveTripTimes", () => {
  const at2 = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m, 0, 0);
  const t = (key: string, setOff: Date | null, timeEdited = false): DraftTrip => ({
    ...emptyTrip(key),
    setOffAt: setOff,
    timeEdited,
  });

  it("starts the first trip with the shift when it has no time", () => {
    const out = moveTripTimes([t("a", null)], null, at2(3, 9));
    expect(out[0].setOffAt).toEqual(at2(3, 9));
  });

  it("moves every trip time the driver has not set by the same amount", () => {
    const out = moveTripTimes([t("a", at2(3, 9, 10)), t("b", at2(3, 9, 30))], at2(3, 9), at2(4, 10));
    expect(out[0].setOffAt).toEqual(at2(4, 10, 10));
    expect(out[1].setOffAt).toEqual(at2(4, 10, 30));
  });

  it("leaves a time the driver set", () => {
    const out = moveTripTimes([t("a", at2(3, 9, 10)), t("b", at2(3, 11), true)], at2(3, 9), at2(4, 9));
    expect(out[0].setOffAt).toEqual(at2(4, 9, 10));
    expect(out[1].setOffAt).toEqual(at2(3, 11));
  });
});

describe("tripOnAnotherDay", () => {
  const at2 = (d: number, h: number) => new Date(2026, 9, d, h, 0, 0, 0);
  const t = (setOff: Date): DraftTrip => ({ ...emptyTrip("k"), setOffAt: setOff });

  it("names a trip left on another day", () => {
    expect(tripOnAnotherDay(at2(4, 9), at2(4, 13), [t(at2(4, 10)), t(at2(3, 11))])).toBe(
      "Trip 2 is on Sat 3 Oct, a different day from the shift."
    );
  });

  it("accepts trips on the day the shift ends, past midnight", () => {
    expect(tripOnAnotherDay(at2(3, 20), at2(4, 2), [t(at2(3, 21)), t(at2(4, 1))])).toBeNull();
  });
});

describe("stableBodyText", () => {
  it("is the same for the same request whatever the key order", () => {
    expect(stableBodyText({ b: 1, a: [{ y: 2, x: "z" }] })).toBe(stableBodyText({ a: [{ x: "z", y: 2 }], b: 1 }));
  });

  it("changes when anything is edited, and ignores missing values", () => {
    expect(stableBodyText({ a: 1 })).not.toBe(stableBodyText({ a: 2 }));
    expect(stableBodyText({ a: 1, b: undefined })).toBe(stableBodyText({ a: 1 }));
  });
});

describe("sentSaveFailureMessage", () => {
  it("shows the server's own words for a refusal", () => {
    expect(sentSaveFailureMessage(400)).toBeNull();
    expect(sentSaveFailureMessage(409)).toBeNull();
  });

  it("asks the driver to check before trying again when no answer came back", () => {
    expect(sentSaveFailureMessage(null)).toBe(PAST_SHIFT_UNCONFIRMED_MESSAGE);
    expect(sentSaveFailureMessage(500)).toBe(PAST_SHIFT_UNCONFIRMED_MESSAGE);
    expect(sentSaveFailureMessage(504)).toBe(PAST_SHIFT_UNCONFIRMED_MESSAGE);
    expect(PAST_SHIFT_UNCONFIRMED_MESSAGE).toBe("We couldn't confirm the save. Check More > Shifts before trying again.");
  });
});

// Local times, as the form works in them.
const at = (h: number, m = 0) => new Date(2026, 9, 3, h, m, 0, 0);
const NOW = new Date(2026, 9, 3, 23, 0).getTime();

function trip(key: string, setOff: Date | null, routedMin: number | null, extra: Partial<DraftTrip> = {}): DraftTrip {
  return {
    ...emptyTrip(key),
    fromLat: 53.8,
    fromLng: -1.55,
    fromAddress: "Leeds",
    toLat: 53.81,
    toLng: -1.56,
    toAddress: "Headingley",
    setOffAt: setOff,
    miles: 3.3,
    routedSecs: routedMin == null ? null : routedMin * 60,
    route: "done",
    ...extra,
  };
}

describe("arrivalFor", () => {
  it("is set-off plus the route's drive time", () => {
    expect(arrivalFor(trip("a", at(9, 10), 20), NOW)).toEqual(at(9, 30));
  });

  it("waits for the route", () => {
    expect(arrivalFor(trip("a", at(9, 10), 20, { route: "working" }), NOW)).toBeNull();
    expect(arrivalFor(trip("a", null, 20), NOW)).toBeNull();
  });

  it("is never later than now", () => {
    const late = trip("a", new Date(NOW - 5 * 60 * 1000), 30);
    expect(arrivalFor(late, NOW)!.getTime()).toBe(NOW);
  });
});

describe("chainedTrip", () => {
  it("starts the first trip when the shift started, with nothing else filled", () => {
    const t = chainedTrip(null, at(9), "k1", NOW);
    expect(t.setOffAt).toEqual(at(9));
    expect(t.fromLat).toBeNull();
    expect(t.platformTag).toBeNull();
  });

  it("follows on from the trip before: its end place, arrival time and app", () => {
    const prev = trip("a", at(9, 10), 20, { toLat: 53.79, toLng: -1.54, toAddress: "Kirkstall", platformTag: "uber" });
    const t = chainedTrip(prev, at(9), "k2", NOW);
    expect(t.fromLat).toBe(53.79);
    expect(t.fromLng).toBe(-1.54);
    expect(t.fromAddress).toBe("Kirkstall");
    expect(t.toLat).toBeNull();
    expect(t.setOffAt).toEqual(at(9, 30));
    expect(t.platformTag).toBe("uber");
    expect(t.route).toBe("idle");
  });

  it("uses the previous set-off when its arrival is not known yet", () => {
    const prev = trip("a", at(9, 10), null, { route: "working" });
    expect(chainedTrip(prev, at(9), "k2", NOW).setOffAt).toEqual(at(9, 10));
  });
});

describe("missingForPastShift", () => {
  it("asks for the first thing missing", () => {
    expect(missingForPastShift({ shiftStart: null, shiftEnd: null, trips: [] })).toBe("Add when the shift started");
    expect(missingForPastShift({ shiftStart: at(9), shiftEnd: null, trips: [] })).toBe("Add when the shift ended");
    expect(missingForPastShift({ shiftStart: at(9), shiftEnd: at(13), trips: [] })).toBe("Add a trip");
    expect(
      missingForPastShift({
        shiftStart: at(9),
        shiftEnd: at(13),
        trips: [trip("a", at(9), 10), trip("b", at(10), 10, { toLat: null })],
      })
    ).toBe("Add where trip 2 went");
    expect(
      missingForPastShift({ shiftStart: at(9), shiftEnd: at(13), trips: [trip("a", at(9), 10, { route: "working" })] })
    ).toBe("Working out the miles for trip 1");
    expect(
      missingForPastShift({ shiftStart: at(9), shiftEnd: at(13), trips: [trip("a", at(9), 10, { route: "failed" })] })
    ).toBe("Couldn't work out the miles for trip 1");
    expect(missingForPastShift({ shiftStart: at(9), shiftEnd: at(13), trips: [trip("a", at(9), 10)] })).toBeNull();
  });
});

describe("tripsRunIntoEachOther", () => {
  it("is fine for trips that follow on, end to start", () => {
    expect(tripsRunIntoEachOther([trip("a", at(9, 10), 20), trip("b", at(9, 30), 15)], NOW)).toBeNull();
  });

  it("names the trip that sets off before the one before arrives", () => {
    expect(tripsRunIntoEachOther([trip("a", at(9, 10), 20), trip("b", at(9, 20), 15)], NOW)).toBe(
      "Trip 2 sets off before trip 1 arrives."
    );
  });
});

describe("planShiftWindow", () => {
  it("keeps the shift times when the trips fit", () => {
    const p = planShiftWindow({ shiftStart: at(9), shiftEnd: at(13), trips: [trip("a", at(9, 10), 20)], now: NOW });
    expect(p.stretched).toBe(false);
    expect(p.message).toBeNull();
    expect(p.startedAt).toEqual(at(9));
  });

  it("stretches to hold the trips and says so", () => {
    const p = planShiftWindow({
      shiftStart: at(9),
      shiftEnd: at(13),
      trips: [trip("a", at(8, 40), 20), trip("b", at(12, 50), 25)],
      now: NOW,
    });
    expect(p.stretched).toBe(true);
    expect(p.startedAt).toEqual(at(8, 40));
    expect(p.endedAt).toEqual(at(13, 15));
    expect(p.message).toBe(
      "Your trips run outside the shift times you set, so the shift will be saved as 08:40 to 13:15."
    );
  });
});

describe("parseAmountPence", () => {
  it("reads pounds and pence", () => {
    expect(parseAmountPence("64.50")).toBe(6450);
    expect(parseAmountPence("£64.5")).toBe(6450);
    expect(parseAmountPence("64,50")).toBe(6450);
    expect(parseAmountPence("12")).toBe(1200);
  });

  it("refuses anything else", () => {
    expect(parseAmountPence("")).toBeNull();
    expect(parseAmountPence("0")).toBeNull();
    expect(parseAmountPence("abc")).toBeNull();
    expect(parseAmountPence("1.234")).toBeNull();
  });
});

describe("mostUsedPlatform", () => {
  it("picks the app most trips were for", () => {
    expect(
      mostUsedPlatform([
        trip("a", at(9), 10, { platformTag: "uber" }),
        trip("b", at(10), 10, { platformTag: "deliveroo" }),
        trip("c", at(11), 10, { platformTag: "deliveroo" }),
      ])
    ).toBe("deliveroo");
    expect(mostUsedPlatform([trip("a", at(9), 10)])).toBeNull();
  });
});

describe("buildPastShiftBody", () => {
  const base = {
    shiftStart: at(9),
    shiftEnd: at(13),
    vehicleId: "veh-1",
    trips: [trip("a", at(9, 10), 20, { platformTag: "deliveroo", miles: 3.333 }), trip("b", at(9, 30), 15)],
    earningText: "",
    earningPlatform: null,
    now: NOW,
  };

  it("builds the request with each trip's arrival and rounded miles", () => {
    const r = buildPastShiftBody(base);
    if (!("body" in r)) throw new Error(r.problem);
    expect(r.body.startedAt).toBe(at(9).toISOString());
    expect(r.body.endedAt).toBe(at(13).toISOString());
    expect(r.body.vehicleId).toBe("veh-1");
    expect(r.body.earning).toBeUndefined();
    expect(r.body.trips[0]).toMatchObject({
      startAddress: "Leeds",
      endAddress: "Headingley",
      distanceMiles: 3.33,
      startedAt: at(9, 10).toISOString(),
      endedAt: at(9, 30).toISOString(),
      platformTag: "deliveroo",
    });
    expect(r.body.trips[1].platformTag).toBeUndefined();
  });

  it("sends the stretched window", () => {
    const r = buildPastShiftBody({ ...base, trips: [trip("a", at(8, 40), 20)] });
    if (!("body" in r)) throw new Error(r.problem);
    expect(r.body.startedAt).toBe(at(8, 40).toISOString());
    expect(r.plan.stretched).toBe(true);
  });

  it("adds the earning in pence", () => {
    const r = buildPastShiftBody({ ...base, earningText: "64.50", earningPlatform: "deliveroo" });
    if (!("body" in r)) throw new Error(r.problem);
    expect(r.body.earning).toEqual({ platform: "deliveroo", amountPence: 6450 });
  });

  it("explains what stops the save", () => {
    expect(buildPastShiftBody({ ...base, shiftEnd: at(8) })).toEqual({
      problem: "The shift has to end after it starts.",
    });
    expect(buildPastShiftBody({ ...base, earningText: "lots", earningPlatform: "uber" })).toEqual({
      problem: "Check the amount earned, for example 64.50.",
    });
    expect(buildPastShiftBody({ ...base, earningText: "20" })).toEqual({
      problem: "Pick which app the earnings are from.",
    });
    expect(buildPastShiftBody({ ...base, trips: [trip("a", at(9, 10), 20), trip("b", at(9, 20), 15)] })).toEqual({
      problem: "Trip 2 sets off before trip 1 arrives.",
    });
  });

  it("asks for a car when there are several and none is picked", () => {
    expect(buildPastShiftBody({ ...base, vehicleId: null, carNeeded: true })).toEqual({
      problem: "Pick which car you drove",
    });
  });

  it("names a trip left on another day after the shift moved", () => {
    const r = buildPastShiftBody({ ...base, trips: [trip("a", new Date(2026, 9, 2, 10, 0), 20)] });
    expect(r).toEqual({ problem: "Trip 1 is on Fri 2 Oct, a different day from the shift." });
  });

  it("refuses over 1,000 miles for the shift", () => {
    const r = buildPastShiftBody({
      ...base,
      trips: [trip("a", at(9, 10), 20, { miles: 600 }), trip("b", at(9, 30), 15, { miles: 401 })],
    });
    expect(r).toEqual({ problem: "That's over 1,000 miles for one shift. Check where each trip started and ended." });
  });

  it("names a trip later than now", () => {
    const now = at(10).getTime();
    const r = buildPastShiftBody({ ...base, shiftEnd: at(9, 50), trips: [trip("a", at(11), 10)], now });
    expect(r).toEqual({ problem: "Trip 1 is later than now." });
  });

  it("refuses a shift that would run past 24 hours", () => {
    const r = buildPastShiftBody({
      ...base,
      shiftStart: new Date(2026, 9, 1, 9, 0),
      shiftEnd: new Date(2026, 9, 2, 10, 30),
      trips: [trip("a", new Date(2026, 9, 1, 10, 0), 20)],
    });
    expect(r).toEqual({ problem: "A shift can be up to 24 hours long." });
  });
});
