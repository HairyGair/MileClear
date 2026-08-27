/**
 * The gap-stop rule, checked against the silences it got wrong.
 *
 * Every case below is measured from Rachel Thorndyke's 26-27 Aug 2026 rounds:
 * four visits the app recorded inside a longer trip, and one arrival it handled
 * correctly. The build-85 rule judged them all on how far the device had moved
 * across the silence, which separates none of them.
 */
import { describe, it, expect } from "vitest";
import {
  gapStopDecision,
  wasStoppedBeforeSilence,
  isJourneyStillMoving,
  GAP_STOP_MS,
  STOPPED_SPEED_MS,
  type RecentFix,
} from "../gapStop";

const MPH = 0.44704;
const T0 = new Date("2026-08-26T07:17:36Z").getTime();

/** Newest-first run of fixes, speeds given in mph, oldest listed last. */
function fixes(speedsMph: Array<number | null>, spacingM = 30): RecentFix[] {
  return speedsMph.map((mph, i) => ({
    lat: 53.66866 + i * (spacingM / 111_320),
    lng: -0.30666,
    speed: mph == null ? -1 : mph * MPH,
    atMs: T0 - i * 20_000,
  }));
}

describe("wasStoppedBeforeSilence", () => {
  it("reads the last fix's own speed when it has one", () => {
    // Michelle Atkin, 26 Aug: coasting to a stop at 3 mph, then 859s of silence.
    expect(wasStoppedBeforeSilence(fixes([3, 8, 15, 11, 15]))).toBe(true);
  });

  it("says still driving when the car was still moving", () => {
    // Arriving home, 26 Aug: 27 mph at the last fix.
    expect(wasStoppedBeforeSilence(fixes([27, 30, 34, 34, 29]))).toBe(false);
  });

  it("falls back to ground covered when the last fix has no reading", () => {
    // The Co-op, 26 Aug: RNBG wrote -1 on the last fix. The run it belongs to
    // covered 218 m in 218 s, which is 2.2 mph.
    const run: RecentFix[] = [
      { lat: 53.67683, lng: -0.3369, speed: -1, atMs: T0 },
      { lat: 53.67674, lng: -0.33668, speed: 15 * MPH, atMs: T0 - 60_000 },
      { lat: 53.67668, lng: -0.33652, speed: 27 * MPH, atMs: T0 - 120_000 },
      { lat: 53.67666, lng: -0.33645, speed: 22 * MPH, atMs: T0 - 180_000 },
      { lat: 53.67662, lng: -0.33629, speed: 27 * MPH, atMs: T0 - 218_000 },
    ];
    expect(wasStoppedBeforeSilence(run)).toBe(true);
  });

  it("does not guess when there is nothing to go on", () => {
    expect(wasStoppedBeforeSilence([])).toBeNull();
    expect(wasStoppedBeforeSilence(fixes([null]))).toBeNull();
  });

  it("treats a null speed on an old row the same as no reading", () => {
    const run: RecentFix[] = [{ lat: 53.6, lng: -0.3, speed: null, atMs: T0 }];
    expect(wasStoppedBeforeSilence(run)).toBeNull();
  });
});

describe("gapStopDecision - the four Rachel got wrong", () => {
  it("Michelle Atkin, 859s silence, next fix 501 m away", () => {
    const d = gapStopDecision({ driftM: 501, recent: fixes([3, 8, 15, 11, 15]) });
    expect(d).toMatchObject({ finalize: true, reason: "stopped_before_silence" });
  });

  it("the Co-op, 540s silence, next fix 507 m away, no speed on the last fix", () => {
    const run: RecentFix[] = [
      { lat: 53.67683, lng: -0.3369, speed: -1, atMs: T0 },
      { lat: 53.67674, lng: -0.33668, speed: 15 * MPH, atMs: T0 - 60_000 },
      { lat: 53.67668, lng: -0.33652, speed: 27 * MPH, atMs: T0 - 120_000 },
      { lat: 53.67666, lng: -0.33645, speed: 22 * MPH, atMs: T0 - 180_000 },
      { lat: 53.67662, lng: -0.33629, speed: 27 * MPH, atMs: T0 - 218_000 },
    ];
    const d = gapStopDecision({ driftM: 507, recent: run });
    expect(d).toMatchObject({ finalize: true, reason: "stopped_before_silence", inferred: true });
  });

  it("Sam's, 281s silence, next fix 1,380 m away", () => {
    const d = gapStopDecision({ driftM: 1380, recent: fixes([2, 3, 6, 13, 11]) });
    expect(d.finalize).toBe(true);
    // 281s only counts as a silence at all because the bar came down to 4 min.
    expect(281_000).toBeGreaterThan(GAP_STOP_MS);
  });

  it("still stops on arrival, where the old rule was already right", () => {
    const d = gapStopDecision({ driftM: 38, recent: fixes([27, 30, 34, 34, 29]) });
    expect(d).toMatchObject({ finalize: true, reason: "no_drift_across_silence" });
  });
});

describe("gapStopDecision - what it must not do", () => {
  it("keeps recording through a tunnel: moving before the silence, far after it", () => {
    const d = gapStopDecision({ driftM: 3200, recent: fixes([48, 50, 47, 52, 49]) });
    expect(d).toMatchObject({ finalize: false, reason: "still_driving" });
  });

  it("keeps recording when signal dies mid-drive and nothing can be read", () => {
    const d = gapStopDecision({ driftM: 4000, recent: [] });
    expect(d.finalize).toBe(false);
  });

  it("does not end a drive crawling in traffic", () => {
    // 8 mph is a queue, not an arrival.
    expect(gapStopDecision({ driftM: 900, recent: fixes([8, 6, 9, 7, 10]) }).finalize).toBe(false);
  });
});

describe("isJourneyStillMoving", () => {
  const prev: RecentFix = { lat: 53.66866, lng: -0.30666, speed: 0, atMs: T0 - 60_000 };

  it("does not count a parked shuffle as movement", () => {
    // Rachel's fixes at a client's house: 0.5 to 3.6 mph over nine minutes.
    for (const mph of [0.5, 1.1, 2.1, 2.6, 3.0, 3.6]) {
      expect(
        isJourneyStillMoving({ lat: 53.66866, lng: -0.30666, speed: mph * MPH, atMs: T0 })
      ).toBe(false);
    }
  });

  it("counts driving, including a slow crawl", () => {
    for (const mph of [5, 12, 30, 60]) {
      expect(
        isJourneyStillMoving({ lat: 53.66866, lng: -0.30666, speed: mph * MPH, atMs: T0 })
      ).toBe(true);
    }
  });

  it("uses ground covered when the fix has no speed reading", () => {
    // 400 m in 60 s is 15 mph: moving.
    expect(
      isJourneyStillMoving(
        { lat: prev.lat + 400 / 111_320, lng: prev.lng, speed: -1, atMs: T0 },
        prev
      )
    ).toBe(true);
    // 10 m in 60 s is parked.
    expect(
      isJourneyStillMoving(
        { lat: prev.lat + 10 / 111_320, lng: prev.lng, speed: -1, atMs: T0 },
        prev
      )
    ).toBe(false);
  });

  it("assumes movement when there is nothing to judge on", () => {
    // A missing reading must never end a live drive underneath someone.
    expect(isJourneyStillMoving({ lat: 53.6, lng: -0.3, speed: null, atMs: T0 })).toBe(true);
    expect(
      isJourneyStillMoving({ lat: 53.6, lng: -0.3, speed: -1, atMs: T0 }, { ...prev, atMs: T0 })
    ).toBe(true);
  });

  it("sits below every driving speed and above every parked one", () => {
    expect(STOPPED_SPEED_MS).toBeGreaterThan(3.6 * MPH);
    expect(STOPPED_SPEED_MS).toBeLessThan(5 * MPH);
  });
});
