import { describe, it, expect } from "vitest";
import {
  resolveLiveRun,
  describeElapsed,
  LIVE_FIX_MAX_AGE_MS,
  SESSION_GAP_MS,
} from "../liveRecording";

const NOW = new Date("2026-08-24T07:51:00Z").getTime();
const minsAgo = (m: number) => NOW - m * 60_000;

describe("resolveLiveRun", () => {
  it("finds the start of a drive in progress (Alejandro's shape: 45 min, fixes every ~30s)", () => {
    const times = Array.from({ length: 90 }, (_, i) => minsAgo(i * 0.5));
    const run = resolveLiveRun(times, NOW);
    expect(run).not.toBeNull();
    expect(run!.points).toBe(90);
    expect(Math.round((NOW - run!.startedAt) / 60_000)).toBe(45);
  });

  it("stops at the session gap, so yesterday's residue is not counted as this drive", () => {
    const thisDrive = [minsAgo(0), minsAgo(2), minsAgo(4)];
    const previous = [minsAgo(400), minsAgo(402)];
    const run = resolveLiveRun([...thisDrive, ...previous], NOW);
    expect(run!.points).toBe(3);
    expect(run!.startedAt).toBe(minsAgo(4));
  });

  it("returns null when the newest fix is stale — a stuck recording must still be reportable", () => {
    const stuck = [minsAgo(31), minsAgo(33), minsAgo(35)];
    expect(resolveLiveRun(stuck, NOW)).toBeNull();
  });

  it("treats a fix exactly at the staleness edge as live, one past it as stuck", () => {
    expect(resolveLiveRun([NOW - LIVE_FIX_MAX_AGE_MS], NOW)).not.toBeNull();
    expect(resolveLiveRun([NOW - LIVE_FIX_MAX_AGE_MS - 1], NOW)).toBeNull();
  });

  it("keeps a run whose gaps sit just inside the session boundary", () => {
    const times = [minsAgo(0), NOW - SESSION_GAP_MS, NOW - 2 * SESSION_GAP_MS];
    expect(resolveLiveRun(times, NOW)!.points).toBe(3);
  });

  it("handles an empty buffer and unparseable timestamps", () => {
    expect(resolveLiveRun([], NOW)).toBeNull();
    expect(resolveLiveRun([NaN, NaN], NOW)).toBeNull();
  });

  it("survives a single fix", () => {
    const run = resolveLiveRun([minsAgo(3)], NOW);
    expect(run).toEqual({ startedAt: minsAgo(3), points: 1 });
  });
});

describe("describeElapsed", () => {
  it("reads as a sentence", () => {
    expect(describeElapsed(60_000)).toBe("1 minute");
    expect(describeElapsed(47 * 60_000)).toBe("47 minutes");
    expect(describeElapsed(72 * 60_000)).toBe("1h 12m");
    expect(describeElapsed(1_000)).toBe("1 minute"); // never "0 minutes"
  });
});
