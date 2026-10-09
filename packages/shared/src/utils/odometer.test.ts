import { describe, it, expect } from "vitest";
import {
  buildOdometerTimeline,
  odometerDays,
  odometerStateAt,
  odometerDateKey,
} from "./odometer.js";
import type { OdometerDay, OdometerTripInput, OdometerAnchorInput } from "./odometer.js";

let seq = 0;
function trip(
  startedAt: string,
  miles: number,
  classification = "business",
  extra: Partial<OdometerTripInput> = {}
): OdometerTripInput {
  seq += 1;
  return { id: `t${seq}`, startedAt, distanceMiles: miles, classification, ...extra };
}
function reading(at: string, miles: number, id?: string, source: "user" | "fuel" = "user"): OdometerAnchorInput {
  seq += 1;
  return { id: id ?? `r${seq}`, at, readingMiles: miles, source };
}

/** closing - opening = miles + difference - openingDifference, wherever opening is known. */
function expectInvariant(days: OdometerDay[]) {
  for (const d of days) {
    if (d.opening === null) continue;
    expect(d.closing).not.toBeNull();
    const miles = d.businessMiles + d.personalMiles + d.notSortedMiles;
    expect(d.closing! - d.opening).toBeCloseTo(miles + d.difference - d.openingDifference, 6);
  }
}

describe("odometerDateKey", () => {
  it("uses the London calendar date, not UTC", () => {
    // 23:30 UTC on 8 Oct is 00:30 BST on 9 Oct.
    expect(odometerDateKey(Date.parse("2026-10-08T23:30:00Z"))).toBe("2026-10-09");
    expect(odometerDateKey(Date.parse("2026-10-09T22:59:00Z"))).toBe("2026-10-09");
    expect(odometerDateKey(Date.parse("2026-10-09T23:00:00Z"))).toBe("2026-10-10");
  });

  it("handles the 25 Oct 2026 clock change", () => {
    // BST ends at 01:00 UTC on Sun 25 Oct. 00:30 BST is 23:30Z on the 24th.
    expect(odometerDateKey(Date.parse("2026-10-24T23:30:00Z"))).toBe("2026-10-25");
    // 00:30 GMT on Mon 26 Oct is 00:30Z.
    expect(odometerDateKey(Date.parse("2026-10-26T00:30:00Z"))).toBe("2026-10-26");
    // 23:30 GMT on the 25th is still the 25th.
    expect(odometerDateKey(Date.parse("2026-10-25T23:30:00Z"))).toBe("2026-10-25");
  });
});

describe("buildOdometerTimeline: no readings", () => {
  it("has no current figure and trips carry null", () => {
    const tl = buildOdometerTimeline({ trips: [trip("2026-10-07T09:00:00Z", 10)], anchors: [] });
    expect(tl.current).toBeNull();
    expect(tl.readings).toEqual([]);
    const days = odometerDays(tl, "2026-10-01", "2026-10-31");
    expect(days).toHaveLength(1);
    expect(days[0].opening).toBeNull();
    expect(days[0].closing).toBeNull();
    expect(days[0].businessMiles).toBe(10);
  });
});

describe("Tom's scenario (spec section 10)", () => {
  // 9 Oct is BST (UTC+1).
  const early = [
    trip("2026-10-07T08:00:00Z", 12.5, "business"),
    trip("2026-10-07T15:00:00Z", 9, "personal"),
    trip("2026-10-08T09:00:00Z", 20.3, "business"),
  ];
  const t0800 = trip("2026-10-09T07:00:00Z", 30.2, "business");
  const t1200 = trip("2026-10-09T11:00:00Z", 5.0, "personal");
  const t1500 = trip("2026-10-09T14:00:00Z", 3.0, "unclassified");
  const first = reading("2026-10-09T06:30:00Z", 45100, "rd1"); // 07:30 BST

  it("steps 2 to 4: first reading, then trips estimate from it, earlier days have no figures", () => {
    const tl = buildOdometerTimeline({ trips: [...early, t0800, t1200, t1500], anchors: [first] });
    expect(tl.current!.miles).toBeCloseTo(45138.2, 6);
    expect(tl.current!.isEstimated).toBe(true);
    expect(tl.current!.tripMilesSince).toBeCloseTo(38.2, 6);
    expect(tl.current!.basis).toMatchObject({ readingMiles: 45100, source: "user", sourceId: "rd1" });

    const days = odometerDays(tl, "2026-10-01", "2026-10-31");
    expect(days.map((d) => d.date)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(days[0].opening).toBeNull();
    expect(days[0].closing).toBeNull();
    expect(days[1].opening).toBeNull();
    expect(days[1].businessMiles).toBeCloseTo(20.3, 6);
    const thu = days[2];
    expect(thu.opening).toBe(45100);
    expect(thu.openingRecorded).toBe(true);
    expect(thu.closing).toBeCloseTo(45138.2, 6);
    expect(thu.closingRecorded).toBe(false);
    expect(thu.businessMiles).toBeCloseTo(30.2, 6);
    expect(thu.personalMiles).toBeCloseTo(5, 6);
    expect(thu.notSortedMiles).toBeCloseTo(3, 6);
    expect(thu.difference).toBe(0);
    expectInvariant(days);
  });

  it("step 6: a later reading shows the +8 difference and a recorded end", () => {
    const second = reading("2026-10-09T17:00:00Z", 45146, "rd2"); // 18:00 BST
    const tl = buildOdometerTimeline({ trips: [...early, t0800, t1200, t1500], anchors: [first, second] });
    const thu = odometerDays(tl, "2026-10-09", "2026-10-09")[0];
    expect(thu.opening).toBe(45100);
    expect(thu.closing).toBe(45146);
    expect(thu.closingRecorded).toBe(true);
    expect(thu.openingRecorded).toBe(true);
    expect(thu.difference).toBeCloseTo(7.8, 6);
    expect(Math.round(thu.difference)).toBe(8);
    expect(tl.current).toMatchObject({ miles: 45146, isEstimated: false, tripMilesSince: 0 });
    expectInvariant(odometerDays(tl, "2026-10-01", "2026-10-31"));
  });

  it("step 7: next morning starts at the recorded close", () => {
    const second = reading("2026-10-09T17:00:00Z", 45146, "rd2");
    const fri = trip("2026-10-10T08:00:00Z", 20.0, "business");
    const tl = buildOdometerTimeline({ trips: [...early, t0800, t1200, t1500, fri], anchors: [first, second] });
    const days = odometerDays(tl, "2026-10-09", "2026-10-10");
    const f = days[1];
    expect(f.date).toBe("2026-10-10");
    expect(f.opening).toBe(45146);
    expect(f.openingRecorded).toBe(true);
    expect(f.closing).toBe(45166);
    expect(f.closingRecorded).toBe(false);
    expect(f.difference).toBe(0);
    expectInvariant(days);
  });

  it("step 11: a reading lower than the estimate is accepted with a negative difference", () => {
    const second = reading("2026-10-09T17:00:00Z", 45146, "rd2");
    const fri = trip("2026-10-10T08:00:00Z", 20.0, "business");
    const third = reading("2026-10-10T18:00:00Z", 45160, "rd3");
    const tl = buildOdometerTimeline({ trips: [...early, t0800, t1200, t1500, fri], anchors: [first, second, third] });
    const f = odometerDays(tl, "2026-10-10", "2026-10-10")[0];
    expect(f.closing).toBe(45160);
    expect(f.difference).toBe(-6);
    expectInvariant(odometerDays(tl, "2026-10-01", "2026-10-31"));
  });

  it("step 18: a trip before the first reading is not added, and its day opens with no reading", () => {
    const before = trip("2026-10-09T05:00:00Z", 4.0, "personal"); // 06:00 BST
    const tl = buildOdometerTimeline({ trips: [before, t0800, t1200, t1500], anchors: [first] });
    expect(tl.current!.miles).toBeCloseTo(45138.2, 6);
    const thu = odometerDays(tl, "2026-10-09", "2026-10-09")[0];
    expect(thu.opening).toBeNull();
    expect(thu.openingRecorded).toBe(false);
    expect(thu.personalMiles).toBeCloseTo(9, 6);
    expect(thu.closing).toBeCloseTo(45138.2, 6);
    expect(thu.difference).toBe(0);
  });

  it("step 21: deleting the 18:00 reading returns the end to an estimate", () => {
    const tl = buildOdometerTimeline({ trips: [t0800, t1200, t1500], anchors: [first] });
    const thu = odometerDays(tl, "2026-10-09", "2026-10-09")[0];
    expect(thu.closingRecorded).toBe(false);
    expect(thu.difference).toBe(0);
  });
});

describe("recorded flags", () => {
  it("marks trip start and end recorded only when a reading sits directly beside the trip", () => {
    const t1 = trip("2026-10-09T07:00:00Z", 10);
    const t2 = trip("2026-10-09T09:00:00Z", 5);
    const tl = buildOdometerTimeline({
      trips: [t1, t2],
      anchors: [reading("2026-10-09T06:00:00Z", 1000)],
    });
    const [e1, e2] = tl.events.filter((e) => e.kind === "trip");
    expect(e1).toMatchObject({ odoStart: 1000, odoEnd: 1010, startRecorded: true, endRecorded: false });
    expect(e2).toMatchObject({ odoStart: 1010, odoEnd: 1015, startRecorded: false, endRecorded: false });
  });

  it("uses a trip's own odometerStart and odometerEnd as readings", () => {
    const t = trip("2026-10-09T07:00:00Z", 10, "business", { odometerStart: 2000, odometerEnd: 2011 });
    const tl = buildOdometerTimeline({ trips: [t], anchors: [] });
    const ev = tl.events.find((e) => e.kind === "trip")!;
    expect(ev).toMatchObject({ odoStart: 2000, odoEnd: 2010, startRecorded: true, endRecorded: true });
    expect(tl.current).toMatchObject({ miles: 2011, isEstimated: false });
    expect(tl.current!.basis.source).toBe("trip");
    const [d] = odometerDays(tl, "2026-10-09", "2026-10-09");
    expect(d.opening).toBe(2000);
    expect(d.closing).toBe(2011);
    expect(d.openingRecorded).toBe(true);
    expect(d.closingRecorded).toBe(true);
    // The trip said 10 miles, the dashboard moved 11.
    expect(d.difference).toBeCloseTo(1, 6);
    expectInvariant([d]);
  });

  it("opening is estimated when a trip happened between the last reading and the day", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-09T07:00:00Z", 10), trip("2026-10-10T07:00:00Z", 6)],
      anchors: [reading("2026-10-09T06:00:00Z", 500)],
    });
    const days = odometerDays(tl, "2026-10-09", "2026-10-10");
    expect(days[1].opening).toBe(510);
    expect(days[1].openingRecorded).toBe(false);
    expect(days[1].closing).toBe(516);
  });

  it("opening carried from a recorded close with no trip between is recorded", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-11T07:00:00Z", 6)],
      anchors: [reading("2026-10-09T18:00:00Z", 500)],
    });
    const days = odometerDays(tl, "2026-10-09", "2026-10-11");
    expect(days.map((d) => d.date)).toEqual(["2026-10-11"]);
    expect(days[0].opening).toBe(500);
    expect(days[0].openingRecorded).toBe(true);
  });
});

describe("rejections of trip and fuel readings", () => {
  it("rejects a reading lower than the last accepted one, with the reason", () => {
    const tl = buildOdometerTimeline({
      trips: [],
      anchors: [
        reading("2026-10-08T10:00:00Z", 45100, "a"),
        reading("2026-10-09T10:00:00Z", 4530, "fuel1", "fuel"),
      ],
    });
    const bad = tl.readings.find((r) => r.id === "fuel1")!;
    expect(bad.used).toBe(false);
    expect(bad.rejectReason).toBe("Lower than your reading of 45,100 on Thu 8 Oct");
    expect(tl.current!.miles).toBe(45100);
    expect(tl.current!.basis.sourceId).toBe("a");
  });

  it("rejects a reading more than 5,000 miles from the estimate", () => {
    const tl = buildOdometerTimeline({
      trips: [],
      anchors: [
        reading("2026-10-08T10:00:00Z", 45100),
        reading("2026-10-09T10:00:00Z", 50101, "fuel1", "fuel"),
      ],
    });
    expect(tl.readings.find((r) => r.id === "fuel1")).toMatchObject({
      used: false,
      rejectReason: "Too far from your other readings",
    });
    expect(tl.current!.miles).toBe(45100);
  });

  it("accepts a reading exactly 5,000 miles away", () => {
    const tl = buildOdometerTimeline({
      trips: [],
      anchors: [
        reading("2026-10-08T10:00:00Z", 45100),
        reading("2026-10-09T10:00:00Z", 50100, "fuel1", "fuel"),
      ],
    });
    expect(tl.current!.miles).toBe(50100);
  });

  it("rejects a typo on a trip and keeps the trip's miles in the estimate", () => {
    const t = trip("2026-10-09T10:00:00Z", 10, "business", { odometerStart: 4510, odometerEnd: 4520 });
    const tl = buildOdometerTimeline({ trips: [t], anchors: [reading("2026-10-08T10:00:00Z", 45100)] });
    expect(tl.current!.miles).toBe(45110);
    expect(tl.readings.filter((r) => !r.used)).toHaveLength(2);
    const ev = tl.events.find((e) => e.kind === "trip")!;
    expect(ev).toMatchObject({ odoStart: 45100, odoEnd: 45110, startRecorded: true, endRecorded: false });
  });

  it("a rejected reading does not change the days", () => {
    const tl = buildOdometerTimeline({
      trips: [],
      anchors: [
        reading("2026-10-08T10:00:00Z", 45100),
        reading("2026-10-09T10:00:00Z", 10, "fuel1", "fuel"),
      ],
    });
    expect(odometerDays(tl, "2026-10-01", "2026-10-31")).toEqual([]);
    expect(tl.current!.miles).toBe(45100);
  });

  it("the first reading is always accepted, even from a fuel log", () => {
    const tl = buildOdometerTimeline({ trips: [], anchors: [reading("2026-10-09T10:00:00Z", 77, "f", "fuel")] });
    expect(tl.current!.miles).toBe(77);
  });

  it("a typed reading is accepted even when it is far from the estimate", () => {
    const tl = buildOdometerTimeline({
      trips: [],
      anchors: [reading("2026-10-08T10:00:00Z", 45100), reading("2026-10-09T10:00:00Z", 90000)],
    });
    expect(tl.current!.miles).toBe(90000);
  });

  it("ignores non-positive and non-finite readings", () => {
    const t = trip("2026-10-09T10:00:00Z", 3, "business", { odometerStart: 0, odometerEnd: Number.NaN });
    const tl = buildOdometerTimeline({ trips: [t], anchors: [] });
    expect(tl.readings).toEqual([]);
    expect(tl.current).toBeNull();
  });
});

describe("a correction gap", () => {
  it("shows a gap that moves the opening when the reading is the day's first event", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-08T09:00:00Z", 100), trip("2026-10-09T09:00:00Z", 10)],
      anchors: [
        reading("2026-10-08T07:00:00Z", 1000),
        reading("2026-10-09T06:00:00Z", 1108), // trips said 1100
      ],
    });
    const days = odometerDays(tl, "2026-10-08", "2026-10-09");
    expect(days[0]).toMatchObject({ opening: 1000, closing: 1100, closingRecorded: false });
    expect(days[1]).toMatchObject({
      opening: 1108,
      openingRecorded: true,
      closing: 1118,
      difference: 8,
      openingDifference: 8,
    });
    expectInvariant(days);
  });

  it("a reading on a day without trips is not listed; its gap carries to the next driving day", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-08T09:00:00Z", 50), trip("2026-10-11T09:00:00Z", 10)],
      anchors: [reading("2026-10-08T07:00:00Z", 1000), reading("2026-10-10T12:00:00Z", 1045)],
    });
    const days = odometerDays(tl, "2026-10-08", "2026-10-11");
    expect(days.map((d) => d.date)).toEqual(["2026-10-08", "2026-10-11"]);
    expect(days[1]).toMatchObject({ opening: 1045, openingRecorded: true, closing: 1055, difference: -5, openingDifference: -5 });
    expectInvariant(days);
  });

  it("a fuel fill-up on a no-driving day shows on the next driving day", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-08T09:00:00Z", 50), trip("2026-10-11T09:00:00Z", 10)],
      anchors: [reading("2026-10-08T07:00:00Z", 1000), reading("2026-10-10T12:00:00Z", 1062, "f1", "fuel")],
    });
    expect(tl.current!.miles).toBe(1072);
    const days = odometerDays(tl, "2026-10-01", "2026-10-31");
    expect(days.map((d) => d.date)).toEqual(["2026-10-08", "2026-10-11"]);
    expect(days[1]).toMatchObject({ opening: 1062, openingRecorded: true, closing: 1072, difference: 12, openingDifference: 12 });
    // Asking for only the later day gives the same figures.
    expect(odometerDays(tl, "2026-10-11", "2026-10-11")).toEqual([days[1]]);
    expectInvariant(days);
  });

  it("carried gaps stay in openingDifference when the next day starts with a trip", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-08T09:00:00Z", 50), trip("2026-10-11T09:00:00Z", 10)],
      anchors: [reading("2026-10-08T07:00:00Z", 1000), reading("2026-10-10T12:00:00Z", 1062)],
    });
    const d = odometerDays(tl, "2026-10-11", "2026-10-11")[0];
    expect(d).toMatchObject({ opening: 1062, openingRecorded: true, difference: 12, openingDifference: 12 });
    expectInvariant([d]);
  });

  it("two readings on one day sum their gaps", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-09T09:00:00Z", 10), trip("2026-10-09T15:00:00Z", 10)],
      anchors: [
        reading("2026-10-09T06:00:00Z", 100),
        reading("2026-10-09T12:00:00Z", 112),
        reading("2026-10-09T18:00:00Z", 121),
      ],
    });
    const [d] = odometerDays(tl, "2026-10-09", "2026-10-09");
    expect(d.difference).toBe(1); // 112 - 110 = +2, then 121 - 122 = -1
  });
});

describe("clock change days", () => {
  it("puts 00:30 BST on 25 Oct and 00:30 GMT on 26 Oct on their own days", () => {
    const a = trip("2026-10-24T23:30:00Z", 5); // 00:30 BST Sun 25 Oct
    const b = trip("2026-10-26T00:30:00Z", 7); // 00:30 GMT Mon 26 Oct
    const tl = buildOdometerTimeline({ trips: [a, b], anchors: [reading("2026-10-24T12:00:00Z", 100)] });
    const days = odometerDays(tl, "2026-10-24", "2026-10-27");
    expect(days.map((d) => d.date)).toEqual(["2026-10-25", "2026-10-26"]);
    expect(days[0].businessMiles).toBe(5);
    expect(days[1].businessMiles).toBe(7);
    expect(days[1].opening).toBe(105);
    expectInvariant(days);
  });
});

describe("ordering", () => {
  it("counts a trip that started before a reading, then the reading takes over", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-09T09:00:00Z", 30)],
      anchors: [reading("2026-10-09T08:00:00Z", 1000), reading("2026-10-09T09:30:00Z", 1040)],
    });
    expect(tl.current).toMatchObject({ miles: 1040, isEstimated: false });
    const [d] = odometerDays(tl, "2026-10-09", "2026-10-09");
    expect(d.difference).toBe(10);
  });

  it("puts a reading at the same instant before the trip", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-09T09:00:00Z", 10)],
      anchors: [reading("2026-10-09T09:00:00Z", 500)],
    });
    expect(tl.current).toMatchObject({ miles: 510, isEstimated: true });
  });

  it("the later-created reading wins when two share a time", () => {
    const a: OdometerAnchorInput = { id: "a", at: "2026-10-09T09:00:00Z", readingMiles: 500, source: "user", createdAt: "2026-10-09T09:00:05Z" };
    const b: OdometerAnchorInput = { id: "b", at: "2026-10-09T09:00:00Z", readingMiles: 505, source: "user", createdAt: "2026-10-09T09:00:30Z" };
    const tl = buildOdometerTimeline({ trips: [], anchors: [b, a] });
    expect(tl.current!.miles).toBe(505);
    expect(tl.readings.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("does not depend on input order", () => {
    const trips = [trip("2026-10-09T09:00:00Z", 10), trip("2026-10-09T11:00:00Z", 4)];
    const anchors = [reading("2026-10-09T06:00:00Z", 100)];
    const x = buildOdometerTimeline({ trips, anchors });
    const y = buildOdometerTimeline({ trips: [...trips].reverse(), anchors });
    expect(y.current).toEqual(x.current);
  });
});

describe("odometerDays range", () => {
  it("figures do not change with the range asked for", () => {
    const tl = buildOdometerTimeline({
      trips: [trip("2026-10-08T09:00:00Z", 10), trip("2026-10-09T09:00:00Z", 10)],
      anchors: [reading("2026-10-08T06:00:00Z", 100)],
    });
    const all = odometerDays(tl, "2026-10-01", "2026-10-31");
    const one = odometerDays(tl, "2026-10-09", "2026-10-09");
    expect(one).toEqual([all[1]]);
    expect(one[0].opening).toBe(110);
  });
});

describe("odometerStateAt", () => {
  const tl = buildOdometerTimeline({
    trips: [trip("2026-10-09T09:00:00Z", 10)],
    anchors: [reading("2026-10-09T06:00:00Z", 100, "r1"), reading("2026-10-09T12:00:00Z", 115, "r2")],
  });

  it("returns the estimate and latest reading at a moment", () => {
    expect(odometerStateAt(tl, "2026-10-09T05:00:00Z")).toEqual({ estimate: null, latestReading: null });
    const s = odometerStateAt(tl, "2026-10-09T10:00:00Z");
    expect(s.estimate).toBe(110);
    expect(s.latestReading!.id).toBe("r1");
    const t = odometerStateAt(tl, "2026-10-09T12:00:00Z");
    expect(t.estimate).toBe(115);
    expect(t.latestReading!.id).toBe("r2");
  });

  it("skips rejected readings", () => {
    const rej = buildOdometerTimeline({
      trips: [],
      anchors: [reading("2026-10-09T06:00:00Z", 100, "r1"), reading("2026-10-09T07:00:00Z", 5, "f", "fuel")],
    });
    expect(odometerStateAt(rej, "2026-10-09T08:00:00Z").latestReading!.id).toBe("r1");
    expect(odometerStateAt(rej, "2026-10-09T08:00:00Z").estimate).toBe(100);
  });
});

describe("invariant over a busy mixed history", () => {
  it("holds for every day", () => {
    const trips: OdometerTripInput[] = [];
    const anchors: OdometerAnchorInput[] = [];
    let id = 0;
    for (let d = 1; d <= 28; d++) {
      const day = String(d).padStart(2, "0");
      for (const [h, m, c] of [
        ["06", 12.34, "business"],
        ["12", 3.21, "personal"],
        ["17", 7.77, "unclassified"],
      ] as const) {
        id += 1;
        trips.push({
          id: `x${id}`,
          startedAt: `2026-09-${day}T${h}:00:00Z`,
          distanceMiles: m as number,
          classification: c,
          ...(id % 7 === 0 ? { odometerStart: 10000 + id * 24 } : {}),
        });
      }
      if (d % 5 === 0) anchors.push({ id: `u${d}`, at: `2026-09-${day}T0${d % 9}:30:00Z`, readingMiles: 10000 + d * 24.5 + (d % 3), source: "user" });
      if (d % 9 === 0) anchors.push({ id: `f${d}`, at: `2026-09-${day}T13:00:00Z`, readingMiles: 10000 + d * 24 + 200, source: "fuel" });
    }
    const tl = buildOdometerTimeline({ trips, anchors });
    expectInvariant(odometerDays(tl, "2026-09-01", "2026-09-30"));
  });
});
