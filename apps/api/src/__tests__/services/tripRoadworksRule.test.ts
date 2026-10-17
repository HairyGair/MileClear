/**
 * Roadworks on a recorded trip: which Street Manager works a trip drove
 * through while they were in place. Synthetic geometry only.
 */
import { describe, it, expect } from "vitest";
import type { LatLng } from "../../services/roadCorridor.js";
import {
  ringAxis,
  tripNearBoxTest,
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

/** A closed rectangle ring, corners (e0,n0) to (e1,n1), as Street Manager
 *  polygons are stored (a line whose last vertex repeats the first). */
const rect = (e0: number, n0: number, e1: number, n1: number): LatLng[] => [
  at(e0, n0), at(e1, n0), at(e1, n1), at(e0, n1), at(e0, n0),
];

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
    expect(m.alongLineMetres).toBeGreaterThanOrEqual(90);
    expect(m.alongLineMetres).toBeLessThanOrEqual(120);
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

  describe("at a junction", () => {
    it("a 20 x 10 m polygon on the crossing street does not match, whatever the works", () => {
      // The crossing street runs north at 500 m; the polygon sits on it next to the junction.
      const ring = rect(495, 5, 505, 25);
      for (const tm of ["road_closure", "lane_closure", "two_way_signals"]) {
        expect(tripPassedWorks(eastTrip(), works({ trafficManagement: tm, lines: [ring] })).matched, tm).toBe(false);
      }
    });

    it("a closure mapped as a point 15 m along the crossing street does not match", () => {
      const w = works({ trafficManagement: "road_closure", lines: [], points: [at(500, 15)] });
      expect(tripPassedWorks(eastTrip(), w).matched).toBe(false);
      expect(tripPassedWorks(eastTrip(), { ...w, trafficManagement: "lane_closure" }).matched).toBe(false);
      expect(tripPassedWorks(eastTrip(), { ...w, trafficManagement: "contra_flow" }).matched).toBe(false);
      expect(tripPassedWorks(eastTrip(), { ...w, trafficManagement: "convoy_workings" }).matched).toBe(false);
    });

    it("temporary lights or boards at that same point do match (they hold up crossing traffic)", () => {
      for (const tm of ["two_way_signals", "multi_way_signals", "stop_go_boards"]) {
        const w = works({ trafficManagement: tm, lines: [], points: [at(500, 15)] });
        expect(tripPassedWorks(eastTrip(), w).matched, tm).toBe(true);
      }
    });

    it("a near-square polygon counts like a point: lights yes, a closure no", () => {
      const ring = rect(490, -12, 510, 12);
      expect(tripPassedWorks(eastTrip(), works({ trafficManagement: "two_way_signals", lines: [ring] })).matched).toBe(true);
      expect(tripPassedWorks(eastTrip(), works({ trafficManagement: "lane_closure", lines: [ring] })).matched).toBe(false);
    });

    it("a long polygon along the trip's own road matches", () => {
      const ring = rect(300, -5, 400, 5);
      expect(tripPassedWorks(eastTrip(), works({ trafficManagement: "lane_closure", lines: [ring] })).matched).toBe(true);
    });

    it("the same long polygon on the crossing street does not", () => {
      const ring = rect(495, -60, 505, 60);
      expect(tripPassedWorks(eastTrip(), works({ trafficManagement: "lane_closure", lines: [ring] })).matched).toBe(false);
    });
  });
});

describe("ringAxis", () => {
  it("finds the long side and the aspect", () => {
    const a = ringAxis(rect(0, 0, 100, 10).slice(0, -1));
    expect(Math.min(Math.abs(a.bearing - 90), Math.abs(a.bearing - 270))).toBeLessThan(1);
    expect(a.aspect).toBeCloseTo(10, 0);
    const n = ringAxis(rect(0, 0, 10, 20).slice(0, -1));
    expect(Math.min(n.bearing, 360 - n.bearing, Math.abs(n.bearing - 180))).toBeLessThan(1);
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

  it("says a closure was booked (we cannot tell it was in force), and emergency works when the category says so", () => {
    expect(
      tripWorksPhrase(works({ trafficManagement: "road_closure", streetName: "Durham Road From A To B", workCategory: "immediate_emergency" }))
    ).toBe("Road closure booked on Durham Road (Emergency works)");
    expect(tripWorksPhrase(works({ trafficManagement: "road_closure", streetName: "Durham Road", promoter: "BT" }))).toBe(
      "Road closure booked on Durham Road (BT)"
    );
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

  it("drops a closure the trip drove 100 m or more along (it was not closed then)", () => {
    expect(tripRoadworks(trip, [works({ trafficManagement: "road_closure", lines: [[at(300), at(420)]] })])).toEqual([]);
  });

  it("names a closure the trip only touched as booked", () => {
    const items = tripRoadworks(trip, [works({ trafficManagement: "road_closure", lines: [[at(300), at(350)]] })]);
    expect(items.map((i) => i.phrase)).toEqual(["Road closure booked on Derby Street (South Staffordshire Water)"]);
  });

  it("groups the same street dug by the same company, keeping the most disruptive part", () => {
    const items = tripRoadworks(trip, [
      works({ reference: "A", lines: [[at(300), at(400)]], startAt: new Date("2026-10-13T07:00:00Z") }),
      works({
        reference: "B",
        trafficManagement: "road_closure",
        lines: [[at(600), at(650)]],
        endAt: null,
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].phrase).toBe("Road closure booked on Derby Street (South Staffordshire Water)");
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
    expect(items.some((i) => i.phrase.startsWith("Road closure booked on Street 6"))).toBe(true);
  });
});

describe("tripNearBoxTest", () => {
  const box = (e0: number, n0: number, e1: number, n1: number) => {
    const [a, b] = [at(e0, n0), at(e1, n1)];
    return { minLat: Math.min(a[0], b[0]), maxLat: Math.max(a[0], b[0]), minLng: Math.min(a[1], b[1]), maxLng: Math.max(a[1], b[1]) };
  };

  it("keeps boxes on or beside the route and drops ones inside the trip's bbox but far from it", () => {
    // An L-shaped trip: east 2 km, then north 2 km. Its bbox is 2 x 2 km.
    const l: LatLng[] = [...eastTrip(0, 2000, 50), ...Array.from({ length: 40 }, (_, i) => at(2000, (i + 1) * 50))];
    const near = tripNearBoxTest(l);
    expect(near(box(900, -10, 1000, 10))).toBe(true);
    expect(near(box(1990, 900, 2010, 1000))).toBe(true);
    expect(near(box(200, 1500, 300, 1600))).toBe(false); // the empty corner of the bbox
  });

  it("keeps a works box between two fixes 200 m apart", () => {
    const sparse = eastTrip(0, 1000, 200);
    expect(tripNearBoxTest(sparse)(box(90, -5, 110, 5))).toBe(true);
  });
});
