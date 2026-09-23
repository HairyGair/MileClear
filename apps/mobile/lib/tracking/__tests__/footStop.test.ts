/**
 * Foot-stop: a recording closes once the phone has been carried on foot for
 * five minutes. Anthony's golf round, 23 Sep 2026: the drive there stayed open
 * for three hours because walking never looks like stopping.
 */
import { describe, it, expect } from "vitest";

import { footStopDecision, FOOT_STOP_MS, type ActivityFix } from "../footStop";

const T0 = Date.parse("2026-09-23T09:21:00Z");
const MIN = 60 * 1000;

/** Newest-first fixes, one every `stepMs`, `n` of them, ending at `endMs`. */
function run(kind: string, n: number, endMs: number, stepMs = 30 * 1000, speed = 1.3, confidence = 90): ActivityFix[] {
  return Array.from({ length: n }, (_, i) => ({
    atMs: endMs - i * stepMs,
    speed,
    activity: kind,
    confidence,
  }));
}

describe("footStopDecision", () => {
  it("closes the drive after five minutes of walking away from the car", () => {
    const walk = run("walking", 12, T0 + 6 * MIN); // 5.5 min of walking
    const drive = run("in_vehicle", 20, T0 + 30 * 1000, 10 * 1000, 15);
    const d = footStopDecision([...walk, ...drive]);
    expect(d.finalize).toBe(true);
    expect(d.walkStartedAtMs).toBe(walk.at(-1)!.atMs);
    expect(d.onFootMs).toBeGreaterThanOrEqual(FOOT_STOP_MS);
  });

  it("does not close for a two-minute walk to a customer's door", () => {
    const walk = run("walking", 5, T0 + 2 * MIN);
    const drive = run("in_vehicle", 20, T0, 10 * 1000, 15);
    expect(footStopDecision([...walk, ...drive]).finalize).toBe(false);
  });

  it("standing still on a tee neither counts nor breaks the walk", () => {
    const fixes: ActivityFix[] = [
      ...run("walking", 4, T0 + 7 * MIN),
      ...run("still", 4, T0 + 5 * MIN, 30 * 1000, 0),
      ...run("walking", 4, T0 + 2 * MIN),
    ];
    expect(footStopDecision(fixes).finalize).toBe(true);
  });

  it("an in-vehicle reading inside the window ends the stretch", () => {
    const fixes: ActivityFix[] = [
      ...run("walking", 6, T0 + 6 * MIN),
      ...run("in_vehicle", 1, T0 + 3 * MIN),
      ...run("walking", 6, T0 + 2 * MIN),
    ];
    expect(footStopDecision(fixes).finalize).toBe(false);
  });

  it("a fix at driving speed vetoes it, whatever the label says", () => {
    const fixes = run("walking", 12, T0 + 6 * MIN).map((f, i) => (i === 3 ? { ...f, speed: 9 } : f));
    expect(footStopDecision(fixes).finalize).toBe(false);
  });

  it("ignores low-confidence on-foot labels", () => {
    expect(footStopDecision(run("walking", 12, T0 + 6 * MIN, 30 * 1000, 1.3, 20)).finalize).toBe(false);
  });

  it("never fires without activity labels (Android)", () => {
    const fixes = run("walking", 12, T0 + 6 * MIN).map((f) => ({ ...f, activity: null, confidence: null }));
    expect(footStopDecision(fixes).finalize).toBe(false);
  });

  it("treats RNBG's -1 'no speed' as no reading, not as a veto", () => {
    expect(footStopDecision(run("walking", 12, T0 + 6 * MIN, 30 * 1000, -1)).finalize).toBe(true);
  });
});
