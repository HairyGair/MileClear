/**
 * A shift parked overnight must not become one trip across the night
 * (05bb9c56's 25 Sep shift: one trip from 12:18 to 10:20 the next morning).
 */
import { describe, it, expect } from "vitest";
import { segmentTrips, DEFAULT_SILENCE_SPLIT_MS, type SegmentCoordinate } from "../shiftSegments";

const T0 = Date.UTC(2026, 8, 25, 12, 18);
/** Driving north at ~15 m/s, one fix every 5 s, from minute `fromMin`. */
function drive(fromMin: number, minutes: number, startLat = 51.5): SegmentCoordinate[] {
  const out: SegmentCoordinate[] = [];
  for (let s = 0; s <= minutes * 60; s += 5) {
    out.push({
      lat: startLat + (s * 15) / 111_320,
      lng: -0.1,
      speed: 15,
      accuracy: 5,
      recorded_at: new Date(T0 + fromMin * 60_000 + s * 1000).toISOString(),
    });
  }
  return out;
}

describe("segmentTrips", () => {
  it("ends a trip at a silence of a journey boundary, even with no stopped fixes", () => {
    const evening = drive(0, 40);
    const morning = drive(22 * 60, 30, 51.9);
    const segments = segmentTrips([...evening, ...morning]);
    expect(segments).toHaveLength(2);
    expect(segments[0][segments[0].length - 1].recorded_at).toBe(evening[evening.length - 1].recorded_at);
    expect(segments[1][0].recorded_at).toBe(morning[0].recorded_at);
  });

  it("does not split a drive over a shorter silence (a tunnel, a deferred batch)", () => {
    const a = drive(0, 20);
    const b = drive(20 + DEFAULT_SILENCE_SPLIT_MS / 60_000 - 5, 20, 51.6);
    expect(segmentTrips([...a, ...b])).toHaveLength(1);
  });

  it("uses the driver's own journey boundary when given one", () => {
    const a = drive(0, 20);
    const b = drive(32, 20, 51.6); // 12 minutes of silence
    expect(segmentTrips([...a, ...b])).toHaveLength(1);
    expect(segmentTrips([...a, ...b], 10 * 60_000)).toHaveLength(2);
  });

  it("still splits at a five-minute stop recorded as stopped fixes", () => {
    const a = drive(0, 10);
    const last = a[a.length - 1];
    const stopped: SegmentCoordinate[] = [];
    for (let s = 5; s <= 6 * 60; s += 30) {
      stopped.push({ ...last, speed: 0, recorded_at: new Date(Date.parse(last.recorded_at) + s * 1000).toISOString() });
    }
    const b = drive(17, 10, 51.7);
    expect(segmentTrips([...a, ...stopped, ...b])).toHaveLength(2);
  });

  it("needs at least two fixes to make anything", () => {
    expect(segmentTrips([])).toEqual([]);
    expect(segmentTrips(drive(0, 0))).toEqual([]);
  });
});
