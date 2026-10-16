import { describe, it, expect } from "vitest";
import {
  planOverlapTrim,
  dedupeByTimestamp,
  isAnchorShaped,
  type OverlapFix,
} from "../../services/recordedOverlap.js";

const T0 = Date.UTC(2026, 9, 15, 15, 32);

/** ~15 m/s heading north, one fix every stepS seconds from sA to sB. */
function run(sA: number, sB: number, stepS = 10, extra: Partial<OverlapFix> = {}): OverlapFix[] {
  const out: OverlapFix[] = [];
  for (let s = sA; s <= sB; s += stepS) {
    out.push({ t: T0 + s * 1000, lat: 52.48 + (s * 15) / 111_320, lng: -1.9, accuracy: 5, speed: 15, ...extra });
  }
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
    expect(p.reason).toBe("all_shared");
    expect(p.bestTripId).toBe("A");
  });

  it("trims a copy plus a continuation, keeping the last shared fix as the first point", () => {
    // Saved trip holds 0-600 s; the upload re-sends it and drives on to 1800 s.
    const incoming = run(0, 1800);
    const p = planOverlapTrim({ incoming, others: [trip("A", run(0, 600))], incomingHasShift: false });
    expect(p.verdict).toBe("trim");
    expect(p.sharedFixes).toBe(61);
    expect(p.keptTripIds).toEqual(["A"]);
    expect(p.remainder[0].t).toBe(T0 + 600_000);
    expect(p.remainder[p.remainder.length - 1].t).toBe(T0 + 1800_000);
    expect(p.remainder).toHaveLength(121);
    // 1200 s at 15 m/s is about 11.2 miles, and it includes the joining segment.
    expect(p.remainderMiles).toBeGreaterThan(11);
    expect(p.remainderMiles).toBeLessThan(p.fromMiles);
  });

  it("trims a continuation that comes BEFORE the saved stretch, joining at its first shared fix", () => {
    const p = planOverlapTrim({ incoming: run(0, 1800), others: [trip("A", run(1200, 1800))], incomingHasShift: false });
    expect(p.verdict).toBe("trim");
    expect(p.remainder[0].t).toBe(T0);
    expect(p.remainder[p.remainder.length - 1].t).toBe(T0 + 1200_000);
  });

  it("saves whole when there is a continuation before AND after", () => {
    const p = planOverlapTrim({ incoming: run(0, 1800), others: [trip("A", run(600, 1200))], incomingHasShift: false });
    expect(p.verdict).toBe("multi");
    expect(p.stretches).toBe(2);
  });

  it("never treats a single shared boundary fix as overlap", () => {
    const p = planOverlapTrim({ incoming: run(0, 600), others: [trip("A", run(-600, 0))], incomingHasShift: false });
    expect(p.verdict).toBe("none");
    expect(p.sharedFixes).toBe(1);
    expect(p.reason).toBe("shared_too_few");
  });

  it("needs a meaningful share, not just five fixes", () => {
    // 5 shared fixes in 100: well under a tenth.
    const p = planOverlapTrim({ incoming: run(0, 990), others: [trip("A", run(0, 40))], incomingHasShift: false });
    expect(p.sharedFixes).toBe(5);
    expect(p.verdict).toBe("none");
  });

  it("does not count the synthetic departure anchor as shared", () => {
    const anchor = (): OverlapFix => ({ t: T0 - 30_000, lat: 52.4799, lng: -1.9, accuracy: 50, speed: 0 });
    expect(isAnchorShaped(anchor())).toBe(true);
    // Both trips start from the same parked spot and carry an anchor; nothing else is shared.
    const p = planOverlapTrim({
      incoming: [anchor(), ...run(0, 300)],
      others: [trip("A", [anchor(), ...run(10_000, 10_300)])],
      incomingHasShift: false,
    });
    expect(p.sharedFixes).toBe(0);
    expect(p.verdict).toBe("none");
  });

  it("keeps an anchor at the head of the remainder when the rest is a copy plus continuation", () => {
    const anchor: OverlapFix = { t: T0 - 30_000, lat: 52.4799, lng: -1.9, accuracy: 50, speed: 0 };
    const p = planOverlapTrim({ incoming: [anchor, ...run(0, 600)], others: [trip("A", [anchor, ...run(0, 300)])], incomingHasShift: false });
    // Anchor is unshared at the front, then 31 shared, then a stretch: two stretches.
    expect(p.verdict).toBe("multi");
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
    const moved = run(0, 600).map((f) => ({ ...f, lng: f.lng + 0.001 })); // about 68 m east
    const p = planOverlapTrim({ incoming: run(0, 600), others: [trip("A", moved)], incomingHasShift: false });
    expect(p.sharedFixes).toBe(0);
    expect(p.verdict).toBe("none");
  });

  it("does not match the same place at a different millisecond", () => {
    const shifted = run(0, 600).map((f) => ({ ...f, t: f.t + 1 }));
    const p = planOverlapTrim({ incoming: run(0, 600), others: [trip("A", shifted)], incomingHasShift: false });
    expect(p.sharedFixes).toBe(0);
  });

  it("refuses when the remainder is under two fixes", () => {
    const p = planOverlapTrim({ incoming: run(0, 610), others: [trip("A", run(0, 600))], incomingHasShift: false });
    expect(p.verdict).toBe("refuse");
    expect(p.reason).toBe("remainder_too_few_fixes");
  });

  it("refuses when the remainder is under 0.3 miles", () => {
    // 20 s at 15 m/s is 0.19 mi.
    const p = planOverlapTrim({ incoming: run(0, 620), others: [trip("A", run(0, 600))], incomingHasShift: false });
    expect(p.verdict).toBe("refuse");
    expect(p.reason).toBe("remainder_too_short");
  });

  it("does not trim a shift recording against a trip that is not on the shift", () => {
    const unshifted = planOverlapTrim({ incoming: run(0, 1800), others: [trip("A", run(0, 600))], incomingHasShift: true });
    expect(unshifted.verdict).toBe("none");
    expect(unshifted.reason).toBe("shift_vs_unshifted");
    const shifted = planOverlapTrim({ incoming: run(0, 1800), others: [trip("A", run(0, 600), "S")], incomingHasShift: true });
    expect(shifted.verdict).toBe("trim");
  });

  it("points a refusal at the trip holding most of the fixes", () => {
    const p = planOverlapTrim({
      incoming: run(0, 600),
      others: [trip("small", run(0, 100)), trip("big", run(0, 600))],
      incomingHasShift: false,
    });
    expect(p.bestTripId).toBe("big");
    expect(p.keptTripIds).toEqual(["big", "small"]);
  });
});
