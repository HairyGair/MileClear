/**
 * Roadworks on a recorded trip: which Street Manager works a trip drove
 * through while they were in place. Synthetic geometry only.
 */
import { describe, it, expect } from "vitest";
import type { LatLng } from "../../services/roadCorridor.js";
import {
  tripPassedWorks,
  tripRoadworks,
  tripWorksPhrase,
  worksEligible,
  type TripWorksInput,
} from "../../services/tripRoadworksRule.js";

const LAT0 = 52.6;
const LNG0 = -2.0;
const M_LAT = 1 / 111320;
const M_LNG = 1 / (111320 * Math.cos((LAT0 * Math.PI) / 180));

/** A point `east` metres east and `north` metres north of the origin. */
const at = (east: number, north = 0): LatLng => [LAT0 + north * M_LAT, LNG0 + east * M_LNG];

/** A trip driving due east along the origin's road, a fix every 20 m. */
function eastTrip(fromM = 0, toM = 1000, step = 20): LatLng[] {
  const out: LatLng[] = [];
  for (let x = fromM; x <= toM; x += step) out.push(at(x, (x % 40 === 0 ? 3 : -3)));
  return out;
}

const START = new Date("2026-10-14T08:00:00Z");
const END = new Date("2026-10-14T08:20:00Z");

function works(extra: Partial<TripWorksInput> = {}): TripWorksInput {
  return {
    reference: "TSR1",
    trafficManagement: "two_way_signals",
    isTrafficSensitive: false,
    workStatus: "in_progress",
    streetName: "Derby Street",
    town: "Walsall",
    promoter: "SOUTH STAFFORDSHIRE WATER PLC",
    startAt: new Date("2026-10-12T07:00:00Z"),
    endAt: new Date("2026-10-16T17:00:00Z"),
    lines: [[at(300), at(400)]],
    points: [],
    ...extra,
  };
}

const trip = { points: eastTrip(), startedAt: START, endedAt: END };

describe("tripPassedWorks", () => {
  it("matches works on the road the trip drove along", () => {
    const m = tripPassedWorks(eastTrip(), works());
    expect(m.matched).toBe(true);
    expect(m.fixes).toBeGreaterThanOrEqual(2);
    expect(m.alongMetres).toBeGreaterThanOrEqual(100);
  });

  it("matches works mapped as a single point on the road", () => {
    expect(tripPassedWorks(eastTrip(), works({ lines: [], points: [at(510, 5)] })).matched).toBe(true);
  });

  it("does not match a parallel street 50 m away", () => {
    const m = tripPassedWorks(eastTrip(), works({ lines: [[at(200, 50), at(700, 50)]] }));
    expect(m.matched).toBe(false);
  });

  it("does not match a road the trip only crossed", () => {
    const m = tripPassedWorks(eastTrip(), works({ lines: [[at(500, -150), at(500, 150)]] }));
    expect(m.matched).toBe(false);
  });

  it("does not draw a straight line across a recording gap", () => {
    // Fixes at 0..200 m and 700..1000 m: nothing recorded where the works are.
    const gapped = [...eastTrip(0, 200), ...eastTrip(700, 1000)];
    expect(tripPassedWorks(gapped, works({ lines: [[at(350), at(500)]] })).matched).toBe(false);
  });

  it("matches the far carriageway direction too (works lines run either way)", () => {
    expect(tripPassedWorks(eastTrip(), works({ lines: [[at(400), at(300)]] })).matched).toBe(true);
  });
});

describe("worksEligible", () => {
  it("keeps works in place at some moment of the trip", () => {
    expect(worksEligible(works(), START, END)).toBe(true);
  });

  it("drops works that ended before the trip or started after it", () => {
    expect(worksEligible(works({ endAt: new Date("2026-10-13T17:00:00Z") }), START, END)).toBe(false);
    expect(worksEligible(works({ startAt: new Date("2026-10-14T09:00:00Z") }), START, END)).toBe(false);
  });

  it("drops works with no known start", () => {
    expect(worksEligible(works({ startAt: null }), START, END)).toBe(false);
  });

  it("drops works still planned now (they had not started)", () => {
    expect(worksEligible(works({ workStatus: "Planned" }), START, END)).toBe(false);
  });

  it("drops works with no effect on traffic (footway only), even on a traffic-sensitive street", () => {
    expect(worksEligible(works({ trafficManagement: "some_carriageway_incursion", isTrafficSensitive: true }), START, END)).toBe(false);
    expect(worksEligible(works({ trafficManagement: "no_carriageway_incursion" }), START, END)).toBe(false);
  });
});

describe("tripWorksPhrase", () => {
  it("names lights with the short works company", () => {
    expect(tripWorksPhrase(works())).toBe("Temporary lights on Derby Street (South Staffordshire Water)");
  });

  it("says a closed road was closed, and emergency works when the category says so", () => {
    expect(
      tripWorksPhrase(works({ trafficManagement: "road_closure", streetName: "Durham Road From A To B", workCategory: "immediate_emergency" }))
    ).toBe("Durham Road was closed (Emergency works)");
  });

  it("falls back to the town when there is no street name", () => {
    expect(tripWorksPhrase(works({ trafficManagement: "lane_closure", streetName: null, promoter: null }))).toBe(
      "Lane closures on a road in Walsall"
    );
  });

  it("never uses an em dash", () => {
    expect(tripWorksPhrase(works())).not.toMatch(/\u2014/);
  });
});

describe("tripRoadworks", () => {
  it("lists the works the trip drove through, and nothing on a parallel street", () => {
    const items = tripRoadworks(trip, [works(), works({ reference: "P", streetName: "Back Lane", lines: [[at(200, 50), at(700, 50)]] })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      streetName: "Derby Street",
      phrase: "Temporary lights on Derby Street (South Staffordshire Water)",
      promoter: "South Staffordshire Water",
    });
    expect(items[0].emergency).toBeUndefined();
  });

  it("returns nothing for works not in place at the trip time", () => {
    expect(tripRoadworks(trip, [works({ endAt: new Date("2026-10-13T10:00:00Z") })])).toEqual([]);
  });

  it("returns nothing for a thin recording", () => {
    expect(tripRoadworks({ ...trip, points: eastTrip(0, 160) }, [works({ lines: [[at(40), at(120)]] })])).toEqual([]);
  });

  it("groups the same street dug by the same company, keeping the most disruptive part", () => {
    const items = tripRoadworks(trip, [
      works({ reference: "A", lines: [[at(300), at(400)]], startAt: new Date("2026-10-13T07:00:00Z") }),
      works({
        reference: "B",
        trafficManagement: "road_closure",
        lines: [[at(600), at(700)]],
        endAt: null,
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].phrase).toBe("Derby Street was closed (South Staffordshire Water)");
    expect(items[0].startAt).toBe("2026-10-12T07:00:00.000Z");
    expect(items[0].endAt).toBeNull();
  });

  it("keeps different companies on one street apart, in the order the trip met them", () => {
    const items = tripRoadworks(trip, [
      works({ reference: "A", promoter: "BT", lines: [[at(700), at(800)]] }),
      works({ reference: "B", lines: [[at(100), at(200)]] }),
    ]);
    expect(items.map((i) => i.promoter)).toEqual(["South Staffordshire Water", "BT"]);
  });

  it("lists at most 5, keeping closures first", () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      works({
        reference: `R${i}`,
        streetName: `Street ${i}`,
        trafficManagement: i === 6 ? "road_closure" : "lane_closure",
        lines: [[at(i * 140), at(i * 140 + 60)]],
      })
    );
    const items = tripRoadworks(trip, many);
    expect(items).toHaveLength(5);
    expect(items.some((i) => i.phrase.startsWith("Street 6 was closed"))).toBe(true);
  });
});
