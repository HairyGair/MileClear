import { describe, it, expect } from "vitest";
import {
  planOverlapTrim,
  dedupeByTimestamp,
  isAnchorShaped,
  type OverlapFix,
} from "../../services/recordedOverlap.js";

const T0 = Date.UTC(2026, 9, 15, 15, 32);
const M_PER_DEG = 111_320;

/** A fix `s` seconds after T0, `northM` metres north of the origin. */
const fx = (s: number, northM: number, extra: Partial<OverlapFix> = {}): OverlapFix => ({
  t: T0 + s * 1000,
  lat: 52.48 + northM / M_PER_DEG,
  lng: -1.9,
  accuracy: 5,
  speed: 15,
  ...extra,
});

/** ~15 m/s heading north, one fix every stepS seconds from sA to sB. */
function run(sA: number, sB: number, stepS = 10, extra: Partial<OverlapFix> = {}): OverlapFix[] {
  const out: OverlapFix[] = [];
  for (let s = sA; s <= sB; s += stepS) out.push(fx(s, s * 15, extra));
  return out;
}

const trip = (id: string, fixes: OverlapFix[], shiftId: string | null = null) => ({ id, shiftId, fixes });

describe("planOverlapTrim", () => {
  it("leaves a recording with no overlap alone", () => {
    const p = planOverlapTrim({ incoming: run(0, 600), others: [trip("A", run(5000, 5600))], incomingHasShift: false });
    expect(p.verdict).toBe("none");
    expect(p.sharedFixes).toBe(0);
  });

  it("refuses a full copy", () => {
    const p = planOverlapTrim({ incoming: run(0, 600), others: [trip("A", run(0, 600))], incomingHasShift: false });
    expect(p.verdict).toBe("refuse");
    expect(p.reason).toBe("no_real_stretch");
    expect(p.bestTripId).toBe("A");
  });

  it("trims a copy plus a continuation, keeping the last shared fix as the first point", () => {
    const p = planOverlapTrim({ incoming: run(0, 1800), others: [trip("A", run(0, 600))], incomingHasShift: false });
    expect(p.verdict).toBe("trim");
    expect(p.sharedFixes).toBe(61);
    expect(p.keptTripIds).toEqual(["A"]);
    expect(p.remainder[0].t).toBe(T0 + 600_000);
    expect(p.remainder[p.remainder.length - 1].t).toBe(T0 + 1800_000);
    expect(p.remainder).toHaveLength(121);
    expect(p.remainderMiles).toBeGreaterThan(11);
    expect(p.remainderMiles).toBeLessThan(p.fromMiles);
  });

  it("trims a continuation that comes BEFORE the saved stretch, joining at its first shared fix", () => {
    const p = planOverlapTrim({ incoming: run(0, 1800), others: [trip("A", run(1200, 1800))], incomingHasShift: false });
    expect(p.verdict).toBe("trim");
    expect(p.remainder[0].t).toBe(T0);
    expect(p.remainder[p.remainder.length - 1].t).toBe(T0 + 1200_000);
  });

  it("saves whole when there are real continuations before AND after", () => {
    const p = planOverlapTrim({ incoming: run(0, 1800), others: [trip("A", run(600, 1200))], incomingHasShift: false });
    expect(p.verdict).toBe("multi");
    expect(p.realStretches).toBe(2);
  });

  it("never treats a single shared boundary fix as overlap", () => {
    const p = planOverlapTrim({ incoming: run(0, 600), others: [trip("A", run(-600, 0))], incomingHasShift: false });
    expect(p.verdict).toBe("none");
    expect(p.keptTripIds).toEqual([]);
    expect(p.reason).toBe("shared_too_few");
  });

  it("needs a meaningful share, not just five fixes", () => {
    const p = planOverlapTrim({ incoming: run(0, 990), others: [trip("A", run(0, 40))], incomingHasShift: false });
    expect(p.verdict).toBe("none");
  });

  it("does not count the synthetic departure anchor as shared", () => {
    const anchor = (): OverlapFix => fx(-30, -450, { accuracy: 50, speed: 0 });
    expect(isAnchorShaped(anchor())).toBe(true);
    const p = planOverlapTrim({
      incoming: [anchor(), ...run(0, 300)],
      others: [trip("A", [anchor(), ...run(10_000, 10_300)])],
      incomingHasShift: false,
    });
    expect(p.sharedFixes).toBe(0);
    expect(p.verdict).toBe("none");
  });

  it("an anchor neither breaks a stretch nor makes one", () => {
    const anchor = fx(-30, -450, { accuracy: 50, speed: 0 });
    // Copy of 0-300 plus a real continuation; the anchor leads the upload. It
    // must not become a second stretch (multi) or a real one.
    const p = planOverlapTrim({
      incoming: [anchor, ...run(0, 1200)],
      others: [trip("A", [anchor, ...run(0, 300)])],
      incomingHasShift: false,
    });
    expect(p.verdict).toBe("trim");
    expect(p.realStretches).toBe(1);
    expect(p.droppedSmallStretches).toBe(0);
    // An anchor alone never makes a trip worth keeping.
    const only = planOverlapTrim({ incoming: [anchor, ...run(0, 300)], others: [trip("A", run(0, 300))], incomingHasShift: false });
    expect(only.verdict).toBe("refuse");
  });

  it("keeps the first of repeated timestamps inside the body", () => {
    const base = run(0, 300);
    const dupes = [...base, { ...base[3], lat: base[3].lat + 0.00001 }, { ...base[10] }];
    const { fixes, removed } = dedupeByTimestamp(dupes);
    expect(removed).toBe(2);
    expect(fixes).toHaveLength(base.length);
    expect(fixes[3].lat).toBe(base[3].lat);
    const p = planOverlapTrim({ incoming: dupes, others: [], incomingHasShift: false });
    expect(p.duplicateTimestamps).toBe(2);
    expect(p.verdict).toBe("none");
  });

  it("does not match fixes at the same millisecond more than 50 m apart", () => {
    const moved = run(0, 600).map((f) => ({ ...f, lng: f.lng + 0.001 }));
    const p = planOverlapTrim({ incoming: run(0, 600), others: [trip("A", moved)], incomingHasShift: false });
    expect(p.sharedFixes).toBe(0);
    expect(p.verdict).toBe("none");
  });

  it("does not match the same place at a different millisecond", () => {
    const shifted = run(0, 600).map((f) => ({ ...f, t: f.t + 1 }));
    // The shifted copy still spans the same time, but nothing is exact-shared,
    // so it is not a keeper and covers nothing.
    const p = planOverlapTrim({ incoming: run(0, 600), others: [trip("A", shifted)], incomingHasShift: false });
    expect(p.sharedFixes).toBe(0);
    expect(p.verdict).toBe("none");
  });

  it("refuses when what is left is under two fixes", () => {
    const p = planOverlapTrim({ incoming: run(0, 610), others: [trip("A", run(0, 600))], incomingHasShift: false });
    expect(p.verdict).toBe("refuse");
  });

  it("refuses when what is left is under 0.3 miles", () => {
    const p = planOverlapTrim({ incoming: run(0, 620), others: [trip("A", run(0, 600))], incomingHasShift: false });
    expect(p.verdict).toBe("refuse");
    expect(p.realStretches).toBe(0);
  });

  it("does not trim a shift recording against a trip that is not on the shift", () => {
    const unshifted = planOverlapTrim({ incoming: run(0, 1800), others: [trip("A", run(0, 600))], incomingHasShift: true });
    expect(unshifted.verdict).toBe("none");
    expect(unshifted.reason).toBe("shift_vs_unshifted");
    const shifted = planOverlapTrim({ incoming: run(0, 1800), others: [trip("A", run(0, 600), "S")], incomingHasShift: true });
    expect(shifted.verdict).toBe("trim");
  });

  it("points a refusal at the keeper holding most of the fixes", () => {
    const p = planOverlapTrim({
      incoming: run(0, 600),
      others: [trip("small", run(0, 100)), trip("big", run(0, 600))],
      incomingHasShift: false,
    });
    expect(p.bestTripId).toBe("big");
    expect(p.keptTripIds).toEqual(["big", "small"]);
  });
});

/** Real shapes from the 16 Oct prod dry run, rebuilt with the same fix counts,
 *  gaps and distances. */
describe("planOverlapTrim: real Android shapes", () => {
  it("3f652a2b: gaps inside a keeper's own run are covered; trims to the last stretch from the 16:01:39 fix", () => {
    const grid = run(0, 1140); // 15:32-15:51, 115 fixes, held by both keepers
    const base = 1140 * 15; // the car then crawls: everything below is within 600 m
    const n15 = Array.from({ length: 15 }, (_, i) => fx(1200 + i * 30, base + i * 20)); // 15:52-15:59, 0.18 mi
    const s1 = fx(1723, base + 300); // 16:00:43
    const n2 = [fx(1746, base + 300), fx(1759, base + 301)]; // 16:01:06-19
    const s6 = [1768, 1770, 1772, 1774, 1776, 1779].map((s) => fx(s, base + 300)); // 16:01:28-39
    const n36 = Array.from({ length: 36 }, (_, i) => fx(1847 + i * 31, base + 300 + ((i + 1) / 36) * 600)); // 16:02:47-16:21
    const incoming = [...grid, ...n15, s1, ...n2, ...s6, ...n36];
    const k1 = trip("4b4b9e1e", grid);
    const k2 = trip("0929a432", [...grid, s1, ...s6]);
    const p = planOverlapTrim({ incoming, others: [k1, k2], incomingHasShift: false });
    expect(p.verdict).toBe("trim");
    expect(p.realStretches).toBe(1);
    // N15 is 0.18 mi and mostly out of the keepers' reach, so it is a small stretch, dropped.
    expect(p.droppedSmallStretches).toBeGreaterThanOrEqual(1);
    expect(p.remainder[0].t).toBe(T0 + 1779_000);
    expect(p.remainder).toHaveLength(37);
    expect(p.remainderMiles).toBeGreaterThan(0.3);
    expect(p.remainderMiles).toBeLessThan(0.5);
    expect(p.stretchList.filter((x) => x.real)).toHaveLength(1);
  });

  it("ecd864fc: a 0.01 mi head and a 0.27 mi tail around a keeper is a copy", () => {
    const head = [0, 10, 20].map((s, i) => fx(s, i * 5));
    const shared = Array.from({ length: 59 }, (_, i) => fx(60 + i * 10, 100 + i * 150));
    const tailStart = 100 + 58 * 150;
    const tail = Array.from({ length: 31 }, (_, i) => fx(1000 + i * 30, tailStart + (i + 1) * 13)); // about 0.25 mi
    const p = planOverlapTrim({
      incoming: [...head, ...shared, ...tail],
      others: [trip("cea93018", shared)],
      incomingHasShift: false,
    });
    expect(p.verdict).toBe("refuse");
    expect(p.stretches).toBe(2);
    expect(p.realStretches).toBe(0);
    expect(p.bestTripId).toBe("cea93018");
  });

  it("6932d6c7: a 0.08 mi head and a 0.29 mi tail around a keeper is a copy", () => {
    const head = Array.from({ length: 12 }, (_, i) => fx(i * 10, i * 9)); // north 0-99
    const shared = Array.from({ length: 310 }, (_, i) => fx(200 + i * 6, 108 + i * 21));
    const tailStart = 108 + 309 * 21;
    const tail = Array.from({ length: 46 }, (_, i) => fx(2500 + i * 30, tailStart + (i + 1) * 10)); // 0.286 mi
    const p = planOverlapTrim({
      incoming: [...head, ...shared, ...tail],
      others: [trip("9bba659d", shared)],
      incomingHasShift: false,
    });
    expect(p.verdict).toBe("refuse");
    expect(p.realStretches).toBe(0);
  });

  it("two real stretches around a keeper is saved whole", () => {
    const head = run(0, 190);
    const shared = run(200, 600);
    const tail = run(610, 800);
    const p = planOverlapTrim({ incoming: [...head, ...shared, ...tail], others: [trip("K", shared)], incomingHasShift: false });
    expect(p.verdict).toBe("multi");
    expect(p.realStretches).toBe(2);
  });

  it("one real stretch with a small stretch beside it trims to the real one and counts the small one", () => {
    // Small head (0.05 mi), shared run, then a real continuation.
    const head = [fx(0, 0), fx(10, 10), fx(20, 20)];
    const shared = run(30, 600).map((f, i) => ({ ...f, lat: 52.48 + (30 + i * 150) / M_PER_DEG }));
    const lastNorth = 30 + (shared.length - 1) * 150;
    const tail = Array.from({ length: 20 }, (_, i) => fx(610 + i * 10, lastNorth + (i + 1) * 40));
    const p = planOverlapTrim({ incoming: [...head, ...shared, ...tail], others: [trip("K", shared)], incomingHasShift: false });
    expect(p.verdict).toBe("trim");
    expect(p.droppedSmallStretches).toBe(1);
    expect(p.droppedSmallMiles).toBeGreaterThan(0);
    expect(p.remainder[0].t).toBe(shared[shared.length - 1].t);
  });

  it("a keeper whose saved end time is hours late covers nothing but its own fixes", () => {
    // Keeper fixes 09:00-09:40 (the row would say it ended at 13:00). The upload
    // re-sends 6 of them and adds a real 12:00-12:30 drive.
    const keeperFixes = run(0, 2400, 60);
    const resent = keeperFixes.slice(0, 6);
    const drive = Array.from({ length: 31 }, (_, i) => fx(10800 + i * 60, 90_000 + i * 900));
    const p = planOverlapTrim({ incoming: [...resent, ...drive], others: [trip("K", keeperFixes)], incomingHasShift: false });
    expect(p.verdict).toBe("trim");
    expect(p.realStretches).toBe(1);
    // Hours from the resent fixes: no joining segment is invented across the gap.
    expect(p.remainder[0].t).toBe(T0 + 10800_000);
    expect(p.remainder).toHaveLength(31);
  });

  it("a keeper's 20-minute internal gap does not cover upload fixes inside it", () => {
    const keeper = [...run(0, 600), ...run(1800, 2400)];
    const inGap = Array.from({ length: 19 }, (_, i) => fx(660 + i * 60, (660 + i * 60) * 15));
    const p = planOverlapTrim({ incoming: [...run(0, 600), ...inGap], others: [trip("K", keeper)], incomingHasShift: false });
    expect(p.verdict).toBe("trim");
    expect(p.remainder[0].t).toBe(T0 + 600_000);
    expect(p.remainder).toHaveLength(20);
  });

  it("a fix between two keeper fixes under 5 minutes either side is covered", () => {
    const keeper = [...run(0, 600), ...run(800, 1400)]; // 200 s gap
    const inGap = [fx(700, 700 * 15), fx(710, 710 * 15)];
    const p = planOverlapTrim({ incoming: [...run(0, 600), ...inGap, ...run(800, 1400)], others: [trip("K", keeper)], incomingHasShift: false });
    expect(p.verdict).toBe("refuse");
    expect(p.stretches).toBe(0);
  });
});
