import { describe, it, expect } from "vitest";
import {
  isLifecycleEvent,
  mergeDumpEvents,
  LIFECYCLE_EVENT_CAP,
  type DumpEvent,
} from "../lifecycleEvents";

const NOW = Date.parse("2026-09-23T18:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function ev(hoursAgo: number, event: string, data: string | null = null): DumpEvent {
  return { recorded_at: new Date(NOW - hoursAgo * HOUR).toISOString(), event, data };
}

describe("isLifecycleEvent", () => {
  it("matches the exact names", () => {
    for (const name of [
      "native_recording_started",
      "native_recording_finalizing",
      "native_force_start_from_speed",
      "native_headless_force_start_from_speed",
      "native_on_foot_overridden_by_speed",
      "orphan_route_finalize",
      "walk_offered_back",
      "native_la_started",
      "native_engine_started",
      "native_engine_boot_on_launch",
      "permission_lost",
    ]) {
      expect(isLifecycleEvent(name)).toBe(true);
    }
  });

  it("matches the prefix and infix patterns", () => {
    for (const name of [
      "finalize_too_short",
      "foot_stop_fired",
      "gap_stop_closed",
      "native_speed_start_armed",
      "native_motion_start_skipped_on_foot",
      "native_headless_wake_finalize",
      "stale_finalize_recovered",
      "shift_started",
      "shift_ended",
      "la_start_failed",
      "la_push_to_start_sent",
    ]) {
      expect(isLifecycleEvent(name)).toBe(true);
    }
  });

  it("rejects the routine traffic that crowds the window", () => {
    for (const name of [
      "detection_skipped",
      "native_motionchange",
      "app_state_change",
      "la_update",
      "la_updated",
      "native_keepalive_tick",
      "routing_call",
      "",
    ]) {
      expect(isLifecycleEvent(name)).toBe(false);
    }
  });

  it("treats underscores and dots literally, not as wildcards", () => {
    expect(isLifecycleEvent("finalizeX")).toBe(false);
    expect(isLifecycleEvent("xfinalize_y")).toBe(false);
    expect(isLifecycleEvent("native_recording_started_extra")).toBe(false);
  });
});

describe("mergeDumpEvents", () => {
  it("returns recent unchanged (newest first) when there is nothing extra", () => {
    const recent = [ev(1, "app_state_change"), ev(2, "detection_skipped")];
    expect(mergeDumpEvents(recent, [], NOW)).toEqual(recent);
  });

  it("adds lifecycle events that scrolled out of the recent window", () => {
    const recent = [ev(0.1, "app_state_change"), ev(0.2, "detection_skipped")];
    const lifecycle = [ev(5, "native_recording_finalizing"), ev(8, "native_recording_started")];
    const out = mergeDumpEvents(recent, lifecycle, NOW);
    expect(out.map((e) => e.event)).toEqual([
      "app_state_change",
      "detection_skipped",
      "native_recording_finalizing",
      "native_recording_started",
    ]);
  });

  it("de-duplicates rows present in both lists", () => {
    const shared = ev(1, "native_recording_started", '{"x":1}');
    const recent = [ev(0.5, "app_state_change"), { ...shared }];
    const out = mergeDumpEvents(recent, [{ ...shared }, ev(3, "shift_started")], NOW);
    expect(out.filter((e) => e.event === "native_recording_started")).toHaveLength(1);
    expect(out).toHaveLength(3);
  });

  it("keeps rows that share a timestamp and name but differ in data", () => {
    const a = ev(1, "finalize_too_short", '{"miles":0.1}');
    const b = ev(1, "finalize_too_short", '{"miles":0.2}');
    const out = mergeDumpEvents([a], [a, b], NOW);
    expect(out).toHaveLength(2);
  });

  it("de-dup is count-aware: two genuine identical lifecycle events survive", () => {
    const a = ev(1, "foot_stop_fired");
    const out = mergeDumpEvents([a], [a, { ...a }], NOW);
    expect(out).toHaveLength(2);
  });

  it("drops lifecycle rows older than 48 hours", () => {
    const out = mergeDumpEvents([], [ev(47, "shift_ended"), ev(49, "shift_started")], NOW);
    expect(out.map((e) => e.event)).toEqual(["shift_ended"]);
  });

  it("drops non-lifecycle and unparseable rows from the lifecycle list, never from recent", () => {
    const junk: DumpEvent = { recorded_at: "not a date", event: "shift_started", data: null };
    const recentJunk: DumpEvent = { recorded_at: "not a date", event: "app_state_change", data: null };
    const out = mergeDumpEvents([recentJunk], [ev(1, "detection_skipped"), junk], NOW);
    expect(out).toEqual([recentJunk]);
  });

  it("caps the extras at the newest N, and never trims recent", () => {
    const recent = Array.from({ length: 200 }, (_, i) => ev(i * 0.001, "detection_skipped", String(i)));
    const lifecycle = Array.from({ length: 600 }, (_, i) =>
      ev(1 + i * 0.05, "native_recording_started", String(i))
    );
    const out = mergeDumpEvents(recent, lifecycle, NOW);
    expect(out).toHaveLength(200 + LIFECYCLE_EVENT_CAP);
    const kept = out.filter((e) => e.event === "native_recording_started").map((e) => Number(e.data));
    // Newest 400 are indices 0..399 (smallest hoursAgo).
    expect(Math.max(...kept)).toBe(LIFECYCLE_EVENT_CAP - 1);
    expect(out.filter((e) => e.event === "detection_skipped")).toHaveLength(200);
  });

  it("honours a custom cap and window", () => {
    const out = mergeDumpEvents(
      [],
      [ev(1, "shift_started"), ev(2, "shift_ended"), ev(3, "shift_started")],
      NOW,
      { cap: 1, windowMs: 2.5 * HOUR }
    );
    expect(out).toEqual([ev(1, "shift_started")]);
  });

  it("sorts the merged array by recorded_at, newest first, interleaving both lists", () => {
    const recent = [ev(1, "app_state_change"), ev(3, "detection_skipped")];
    const lifecycle = [ev(2, "native_recording_finalizing"), ev(4, "native_recording_started")];
    const out = mergeDumpEvents(recent, lifecycle, NOW);
    const times = out.map((e) => Date.parse(e.recorded_at));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(out.map((e) => e.event)).toEqual([
      "app_state_change",
      "native_recording_finalizing",
      "detection_skipped",
      "native_recording_started",
    ]);
  });

  it("keeps the {event, data, recorded_at} element shape and nothing else", () => {
    const withExtra = { ...ev(1, "shift_started"), id: 7 } as unknown as DumpEvent;
    const [out] = mergeDumpEvents([], [withExtra], NOW);
    expect(Object.keys(out).sort()).toEqual(["data", "event", "recorded_at"]);
  });
});
