/**
 * Merging trips (3 Oct 2026): the duplicate banner's Merge joins two copies of
 * the same drive and must keep the longer one and the later end; joining
 * consecutive legs keeps the trail plus any typed legs. Shah Rouf's 6.1 mi
 * report merged with a 0.34 mi recording became 0.34 mi.
 */
import { describe, it, expect } from "vitest";
import { latestEndingIndex, mergedDistanceMiles, tripsOverlap } from "../../services/tripMergeRule.js";

const at = (hhmm: string) => new Date(`2026-10-03T${hhmm}:00Z`);
// ~0.34 mi of eastbound breadcrumbs
const crumbs = [
  { lat: 54.9899, lng: -1.6544, recordedAt: at("17:42") },
  { lat: 54.9899, lng: -1.6488, recordedAt: at("17:45") },
];

describe("mergedDistanceMiles", () => {
  it("a typed report and a short recording of the same drive keep the report's miles", () => {
    const report = { startedAt: at("17:39"), endedAt: at("17:57"), distanceMiles: 6.1, coordinates: [] };
    const recording = { startedAt: at("17:42"), endedAt: at("17:45"), distanceMiles: 0.34, coordinates: crumbs };
    expect(tripsOverlap([report, recording])).toBe(true);
    expect(mergedDistanceMiles([report, recording])).toBe(6.1);
    expect(latestEndingIndex([report, recording])).toBe(0);
  });

  it("consecutive recorded legs use the trail; a typed leg is added on top", () => {
    const leg1 = { startedAt: at("10:00"), endedAt: at("10:05"), distanceMiles: 0.3, coordinates: crumbs.map((c, i) => ({ ...c, recordedAt: at(i ? "10:05" : "10:00") })) };
    const typed = { startedAt: at("10:10"), endedAt: at("10:20"), distanceMiles: 2.5, coordinates: [] };
    expect(tripsOverlap([leg1, typed])).toBe(false);
    const d = mergedDistanceMiles([leg1, typed]);
    expect(d).toBeGreaterThan(2.7);
    expect(d).toBeLessThan(2.9);
    expect(latestEndingIndex([leg1, typed])).toBe(1);
  });

  it("two typed trips that do not overlap add up", () => {
    const a = { startedAt: at("09:00"), endedAt: at("09:10"), distanceMiles: 1, coordinates: [] };
    const b = { startedAt: at("09:20"), endedAt: at("09:30"), distanceMiles: 2, coordinates: [] };
    expect(mergedDistanceMiles([a, b])).toBe(3);
  });
});
