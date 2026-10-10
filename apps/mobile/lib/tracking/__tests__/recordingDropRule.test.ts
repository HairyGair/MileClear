import { describe, it, expect } from "vitest";
import { buildDropEvent, dropIsLost, isLostReason, OUTBOX_BATCH, type DropReason } from "../recordingDropRule";

const NOW = Date.parse("2026-10-10T09:00:00.000Z");

describe("isLostReason", () => {
  it("counts a drive as lost only when its miles are not in the trip list", () => {
    const lost: DropReason[] = ["no_coords", "phantom", "too_short", "walk", "crow_flies", "tail_trim", "switched_off", "cancelled", "stale_buffer_cleared"];
    const kept: DropReason[] = ["merged", "deduped", "error"];
    for (const r of lost) expect(isLostReason(r), r).toBe(true);
    for (const r of kept) expect(isLostReason(r), r).toBe(false);
  });
});

describe("dropIsLost", () => {
  it("does not count a sweep's stationary leftovers as a lost drive", () => {
    expect(dropIsLost("phantom", "orphan_upkeep_headless_heartbeat")).toBe(false);
    expect(dropIsLost("no_coords", "orphan_app_open")).toBe(false);
    expect(dropIsLost("too_short", "orphan_app_open")).toBe(true);
    expect(dropIsLost("phantom", null)).toBe(true);
    expect(dropIsLost("merged", null)).toBe(false);
  });

  it("carries through to the event", () => {
    expect(buildDropEvent({ reason: "phantom", source: "orphan_app_open" }, NOW, "ios").lost).toBe(false);
  });
});

describe("buildDropEvent", () => {
  it("carries the reason, times, counts and a rounded distance", () => {
    const ev = buildDropEvent(
      {
        reason: "too_short",
        detail: "driving_speed",
        startedAt: "2026-10-10T08:15:00.000Z",
        endedAt: "2026-10-10T08:17:30.000Z",
        coords: 14,
        distanceMiles: 0.28461,
        nativeCoords: 40,
      },
      NOW,
      "android"
    );
    expect(ev).toEqual({
      reason: "too_short",
      lost: true,
      detail: "driving_speed",
      startedAt: "2026-10-10T08:15:00.000Z",
      endedAt: "2026-10-10T08:17:30.000Z",
      durationSec: 150,
      droppedAt: "2026-10-10T09:00:00.000Z",
      coords: 14,
      distanceMiles: 0.28,
      nativeCoords: 40,
      platform: "android",
    });
  });

  it("leaves out what it does not know instead of sending nulls", () => {
    const ev = buildDropEvent({ reason: "no_coords", startedAt: null, endedAt: "garbage", coords: 0 }, NOW, "ios");
    expect(ev).toEqual({ reason: "no_coords", lost: true, droppedAt: "2026-10-10T09:00:00.000Z", coords: 0, platform: "ios" });
  });

  it("never carries a coordinate, only the fields it was built from", () => {
    const ev = buildDropEvent(
      { reason: "walk", ...({ lat: 51.5, lng: -0.1 } as object), distanceMiles: Number.NaN } as Parameters<typeof buildDropEvent>[0],
      NOW,
      "ios"
    );
    expect(JSON.stringify(ev)).not.toContain("51.5");
    expect(ev.distanceMiles).toBeUndefined();
  });

  it("shortens long details and sources", () => {
    const ev = buildDropEvent({ reason: "error", detail: "e".repeat(500), source: "s".repeat(200) }, NOW, "ios");
    expect(ev.detail).toHaveLength(120);
    expect(ev.source).toHaveLength(60);
    expect(ev.lost).toBe(false);
  });

  it("skips a duration when the times run backwards", () => {
    const ev = buildDropEvent(
      { reason: "phantom", startedAt: "2026-10-10T08:20:00.000Z", endedAt: "2026-10-10T08:10:00.000Z" },
      NOW,
      "ios"
    );
    expect(ev.durationSec).toBeUndefined();
  });
});

describe("outbox batch", () => {
  it("fits the API's /user/events limit of 50", () => {
    expect(OUTBOX_BATCH).toBeLessThanOrEqual(50);
  });
});
