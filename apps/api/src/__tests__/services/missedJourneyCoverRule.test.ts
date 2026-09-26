/**
 * An offer that is already a trip must not be offered (26 Sep 2026: Sunny's
 * Start Trip drive and Jenkins's support-added drive both still had one), and
 * a gap whose covering trip never got to the gap's destination is still a
 * real hole (Oleksandr and Nicholas, prod dry run the same day).
 */
import { describe, it, expect } from "vitest";
import {
  findCoveringTrip,
  COVER_DESTINATION_KM,
  type CoverTripInput,
} from "../../services/missedJourneyCoverRule.js";

// Roughly 111 km per degree of latitude.
const KM_PER_DEG_LAT = 111.2;
type Pt = [number, number];
const DEST: Pt = [52.09, -1.78];
const kmNorthOf = (p: Pt, km: number): Pt => [p[0] + km / KM_PER_DEG_LAT, p[1]];

const at = (hhmm: string, day = "2026-09-25") => new Date(`${day}T${hhmm}:00Z`);
const trip = (
  id: string,
  from: string,
  to: string | null,
  opts: { day?: string; endDay?: string; end?: Pt | null } = {},
): CoverTripInput => {
  const end = opts.end === undefined ? DEST : opts.end;
  return {
    id,
    startedAt: at(from, opts.day),
    endedAt: to == null ? null : at(to, opts.endDay ?? opts.day),
    endLat: end ? end[0] : null,
    endLng: end ? end[1] : null,
  };
};
const offer = (
  source: string,
  from: string,
  to: string,
  opts: { day?: string; endDay?: string; dest?: Pt } = {},
) => {
  const dest = opts.dest ?? DEST;
  return {
    source,
    departedAt: at(from, opts.day),
    arrivedAt: at(to, opts.endDay ?? opts.day),
    toLat: dest[0],
    toLng: dest[1],
  };
};

describe("findCoveringTrip", () => {
  it("Sunny: a Start Trip drive covering 20 of the gap's 25 minutes and ending at its destination hides it", () => {
    const cover = findCoveringTrip(offer("gap", "23:00", "23:25"), [
      trip("a", "22:30", "23:00", { end: kmNorthOf(DEST, 10) }),
      trip("sunny", "22:55", "23:20"),
      trip("b", "23:25", "23:50", { end: kmNorthOf(DEST, 5) }),
    ]);
    expect(cover).toEqual({
      tripId: "sunny",
      rule: "window_covered",
      windowCoveredFraction: 0.8,
      tripInsideFraction: 0.8,
      destinationKm: 0,
    });
  });

  it("a trip inside a long gap that ends at the gap's destination hides it", () => {
    const d = { day: "2026-09-24" };
    const cover = findCoveringTrip(offer("gap", "12:09", "14:25", d), [trip("t", "12:40", "13:40", d)]);
    expect(cover?.rule).toBe("trip_inside_gap");
    expect(cover?.windowCoveredFraction).toBe(0.44);
    expect(cover?.tripInsideFraction).toBe(1);
  });

  it("Jenkins: his added trip ends ~2 km short of the gap's destination, so this rule leaves the row to the scan", () => {
    const d = { day: "2026-09-24" };
    expect(
      findCoveringTrip(offer("gap", "12:09", "14:25", d), [
        trip("jenkins", "12:40", "13:40", { ...d, end: kmNorthOf(DEST, 2) }),
      ]),
    ).toBeNull();
  });

  it("Oleksandr adc4cd13: a trip that ends at the gap's START does not cover it", () => {
    // Gap 73 Dawberry Road 18:54 -> 5 Poplar Avenue 08:14 next day, 1.1 mi.
    // The overlapping trip 18:31-19:24 ends back at Dawberry Road.
    const poplar = DEST;
    const dawberry = kmNorthOf(poplar, 1.1 * 1.609);
    expect(
      findCoveringTrip(
        offer("gap", "18:54", "08:14", { endDay: "2026-09-26", dest: poplar }),
        [trip("d53d421e", "18:31", "19:24", { end: dawberry })],
      ),
    ).toBeNull();
  });

  it("Oleksandr 2302e62f: the same trip DOES cover a gap whose destination is where it ended", () => {
    const dawberry = kmNorthOf(DEST, 1.1 * 1.609);
    const cover = findCoveringTrip(offer("gap", "18:20", "18:54", { dest: dawberry }), [
      trip("d53d421e", "18:31", "19:24", { end: dawberry }),
    ]);
    expect(cover).toMatchObject({ tripId: "d53d421e", rule: "window_covered", destinationKm: 0 });
  });

  it("the destination check is on the trip that ends LAST in the window", () => {
    const early = trip("early", "10:05", "10:30", { end: kmNorthOf(DEST, 8) });
    const late = trip("late", "10:35", "10:55");
    expect(findCoveringTrip(offer("gap", "10:00", "11:00"), [early, late])?.tripId).toBe("late");
    const lateElsewhere = trip("late", "10:35", "10:55", { end: kmNorthOf(DEST, 8) });
    const earlyHome = trip("early", "10:05", "10:30");
    expect(findCoveringTrip(offer("gap", "10:00", "11:00"), [earlyHome, lateElsewhere])).toBeNull();
  });

  it("ending just inside the radius counts, just outside does not", () => {
    const o = offer("gap", "10:00", "10:30");
    expect(
      findCoveringTrip(o, [trip("x", "10:00", "10:30", { end: kmNorthOf(DEST, COVER_DESTINATION_KM - 0.05) })]),
    ).not.toBeNull();
    expect(
      findCoveringTrip(o, [trip("x", "10:00", "10:30", { end: kmNorthOf(DEST, COVER_DESTINATION_KM + 0.05) })]),
    ).toBeNull();
  });

  it("a gap covered by a trip with no end point is kept (nothing proves it got there)", () => {
    expect(findCoveringTrip(offer("gap", "10:00", "10:30"), [trip("x", "10:00", "10:30", { end: null })])).toBeNull();
  });

  it("the two trips that make a gap touch it only at the edges and never cover it", () => {
    expect(
      findCoveringTrip(offer("gap", "10:00", "11:00"), [trip("a", "09:00", "10:00"), trip("b", "11:00", "12:00")]),
    ).toBeNull();
  });

  it("a trip_start offer is never covered by the trip it extends", () => {
    expect(findCoveringTrip(offer("trip_start", "10:00", "10:08"), [trip("b", "10:08", "10:40")])).toBeNull();
  });

  it("a trip_start offer another trip now fills, ending at its to-point, is hidden", () => {
    const cover = findCoveringTrip(offer("trip_start", "10:00", "10:08"), [trip("x", "09:59", "10:07")]);
    expect(cover?.rule).toBe("window_covered");
  });

  it("a gap trip that only clips the edge of the window (mostly outside it) does not hide it", () => {
    expect(findCoveringTrip(offer("gap", "10:00", "12:00"), [trip("x", "09:10", "10:10")])).toBeNull();
  });

  it("an evidence offer is not hidden by a short trip in one corner of it", () => {
    expect(
      findCoveringTrip(offer("dropped_start_trip", "08:00", "12:00"), [trip("x", "09:00", "09:20")]),
    ).toBeNull();
  });

  it("an evidence offer whose drive is mostly a saved trip is hidden, wherever that trip ended", () => {
    const cover = findCoveringTrip(offer("recorded", "10:00", "10:10"), [
      trip("x", "10:02", "10:20", { end: kmNorthOf(DEST, 20) }),
    ]);
    expect(cover).toMatchObject({ tripId: "x", rule: "window_covered", windowCoveredFraction: 0.8, destinationKm: null });
  });

  it("an evidence offer overlapped a minute by the next auto trip stays", () => {
    expect(findCoveringTrip(offer("dropped_walk", "10:00", "10:05"), [trip("x", "10:04", "10:30")])).toBeNull();
  });

  it("two trips that split the drive between them cover it together, counted once where they overlap", () => {
    const cover = findCoveringTrip(offer("dropped_phantom", "10:00", "11:00"), [
      trip("x", "10:00", "10:20"),
      trip("y", "10:15", "10:35"),
    ]);
    // Union 10:00-10:35 = 35 of 60 min, not 40.
    expect(cover).toMatchObject({ rule: "window_covered", windowCoveredFraction: 0.58 });
  });

  it("just under half of an evidence window stays offered", () => {
    expect(findCoveringTrip(offer("recorded", "10:00", "10:20"), [trip("x", "10:00", "10:09")])).toBeNull();
  });

  it("ignores a trip still in progress", () => {
    expect(findCoveringTrip(offer("gap", "10:00", "11:00"), [trip("live", "10:10", null)])).toBeNull();
  });

  it("a zero-length typed trip strictly inside a gap, at its destination, hides it; one on the edge does not", () => {
    expect(findCoveringTrip(offer("gap", "10:00", "11:00"), [trip("z", "10:30", "10:30")])?.rule).toBe(
      "trip_inside_gap",
    );
    expect(findCoveringTrip(offer("gap", "10:00", "11:00"), [trip("z", "10:00", "10:00")])).toBeNull();
    expect(findCoveringTrip(offer("recorded", "10:00", "11:00"), [trip("z", "10:30", "10:30")])).toBeNull();
  });

  it("a window with no length is never covered", () => {
    expect(findCoveringTrip(offer("gap", "10:00", "10:00"), [trip("x", "09:00", "11:00")])).toBeNull();
  });

  it("a trip spanning the whole window and ending at the to-point hides any source", () => {
    for (const source of ["gap", "trip_start", "recorded", "dropped_walk", "dropped_phantom", "dropped_start_trip"]) {
      expect(findCoveringTrip(offer(source, "10:00", "10:30"), [trip("x", "09:50", "10:45")])?.tripId).toBe("x");
    }
  });
});
