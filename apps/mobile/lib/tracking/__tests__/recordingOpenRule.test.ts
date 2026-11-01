import { describe, it, expect } from "vitest";
import {
  assembleOpenContext,
  buildEngineSnapshot,
  dropBelongsToOpen,
  newOpenId,
  OPEN_CTX_KEY,
  OPEN_DONE_PREFIX,
  OPEN_GATE_KEY,
  OPEN_SEEN_KEY,
  OPEN_SNAP_KEY,
  openKey,
  openFields,
  openIdForTrip,
  reasonClosesOpen,
  startOpenContext,
  unaccountedDrop,
  type OpenContext,
} from "../recordingOpenRule";
import { buildDropEvent, isLostReason } from "../recordingDropRule";

const T0 = Date.parse("2026-11-01T09:00:00.000Z");

function ctx(over: Partial<OpenContext> = {}): OpenContext {
  return {
    ...startOpenContext({
      id: "oabc123def456",
      now: T0,
      reason: "motion",
      via: "headless",
      appState: "background",
      seedTimestampMs: T0 - 4000,
    }),
    ...over,
  };
}

describe("newOpenId", () => {
  it("is short, lowercase alphanumeric, and passes the server's pattern", () => {
    const id = newOpenId(T0, () => 0.5);
    expect(id).toMatch(/^[a-z0-9]{6,24}$/);
    expect(id.length).toBeLessThanOrEqual(16);
  });
  it("differs for different random draws", () => {
    expect(newOpenId(T0, () => 0.1)).not.toBe(newOpenId(T0, () => 0.9));
  });
});

describe("startOpenContext", () => {
  it("records how old the opening fix was, never negative", () => {
    expect(ctx().seedAgeMs).toBe(4000);
    expect(
      startOpenContext({ id: "x1x1x1", now: T0, reason: "speed", via: "live", appState: null, seedTimestampMs: T0 + 5000 }).seedAgeMs
    ).toBe(0);
    expect(
      startOpenContext({ id: "x1x1x1", now: T0, reason: "speed", via: "live", appState: null, seedTimestampMs: null }).seedAgeMs
    ).toBeNull();
  });
});

describe("assembleOpenContext", () => {
  const base = JSON.stringify({ id: "oabc123def456", at: T0, reason: "speed", via: "headless", appState: "background", seedAgeMs: 4000 });
  it("puts the rows back together", () => {
    const c = assembleOpenContext([
      { key: OPEN_CTX_KEY, value: base },
      { key: openKey(OPEN_SEEN_KEY, "oabc123def456"), value: "3" },
      { key: openKey(OPEN_SEEN_KEY, "oother"), value: "9" },
      { key: openKey(OPEN_GATE_KEY, "oabc123def456"), value: "paused" },
      { key: openKey(OPEN_SNAP_KEY, "oabc123def456"), value: JSON.stringify({ en: true }) },
    ])!;
    expect(c).toMatchObject({ id: "oabc123def456", at: T0, reason: "speed", via: "headless", seen: 3, buffered: 0, gate: "paused", snap: { en: true } });
    expect(c.done).toBeUndefined();
  });
  it("takes the outcome only if it was written for this open's id", () => {
    expect(assembleOpenContext([{ key: OPEN_CTX_KEY, value: base }, { key: OPEN_DONE_PREFIX + "oabc123def456", value: "saved" }])!.done).toBe("saved");
    expect(assembleOpenContext([{ key: OPEN_CTX_KEY, value: base }, { key: OPEN_DONE_PREFIX + "oother", value: "saved" }])!.done).toBeUndefined();
  });
  it("treats junk as no open", () => {
    expect(assembleOpenContext([])).toBeNull();
    expect(assembleOpenContext([{ key: OPEN_CTX_KEY, value: "not json" }])).toBeNull();
    expect(assembleOpenContext([{ key: OPEN_CTX_KEY, value: '{"id":"","at":1}' }])).toBeNull();
    expect(assembleOpenContext([{ key: OPEN_CTX_KEY, value: '{"id":"abc"}' }])).toBeNull();
    expect(assembleOpenContext([{ key: OPEN_CTX_KEY, value: "[]" }])).toBeNull();
  });
});

describe("dropBelongsToOpen", () => {
  it("only when the fixes begin around the open", () => {
    expect(dropBelongsToOpen(ctx(), T0 + 60_000)).toBe(true);
    expect(dropBelongsToOpen(ctx({ done: "saved" }), T0 + 60_000)).toBe(true); // a second leg
    expect(dropBelongsToOpen(ctx(), T0 - 20 * 3600_000)).toBe(false);
    expect(dropBelongsToOpen(ctx(), T0 + 30 * 3600_000)).toBe(false);
  });
  it("a drop with no fixes belongs only to an open still pending", () => {
    expect(dropBelongsToOpen(ctx(), null)).toBe(true);
    expect(dropBelongsToOpen(ctx({ done: "saved" }), null)).toBe(false);
  });
});

describe("reasonClosesOpen", () => {
  it("does not close the open for a partial cut or a retried save", () => {
    expect(reasonClosesOpen("flight")).toBe(false);
    expect(reasonClosesOpen("error")).toBe(false);
  });
  it("closes it for every other outcome", () => {
    for (const r of ["no_coords", "merged", "cancelled", "too_short", "walk", "saved", "flag_cleared", "superseded"]) {
      expect(reasonClosesOpen(r), r).toBe(true);
    }
  });
});

describe("unaccountedDrop (the silent exits)", () => {
  it("says nothing when there was no earlier open or it has an outcome", () => {
    expect(unaccountedDrop(null, T0 + 3600_000)).toBeNull();
    expect(unaccountedDrop(ctx({ done: "saved" }), T0 + 3600_000)).toBeNull();
    expect(unaccountedDrop(ctx({ done: "merged" }), T0 + 3600_000)).toBeNull();
  });
  it("reports an earlier open that never said how it ended", () => {
    const d = unaccountedDrop(ctx({ seen: 4 }), T0 + 3600_000);
    expect(d).toEqual({ reason: "superseded", detail: "no_outcome", source: "next_open" });
  });
  it("separates an open that never saw a fix from one that did", () => {
    expect(unaccountedDrop(ctx({ seen: 0 }), T0 + 3600_000)?.detail).toBe("no_fixes_seen");
  });
  it("reports an open overwritten within a minute too", () => {
    expect(unaccountedDrop(ctx(), T0 + 20_000)?.reason).toBe("superseded");
  });
  it("is not counted as a lost drive on its own", () => {
    expect(isLostReason("superseded")).toBe(false);
    expect(isLostReason("flag_cleared")).toBe(false);
  });
});

describe("openIdForTrip", () => {
  it("joins a trip that starts around the open", () => {
    expect(openIdForTrip(ctx(), T0 - 5 * 60_000)).toBe("oabc123def456");
    expect(openIdForTrip(ctx(), T0 + 60_000)).toBe("oabc123def456");
  });
  it("does not claim a trip for an open that already has its outcome", () => {
    expect(openIdForTrip(ctx({ done: "saved" }), T0 + 60_000)).toBeNull();
  });
  it("does not claim a trip from long before or long after", () => {
    expect(openIdForTrip(ctx(), T0 - 2 * 3600_000)).toBeNull();
    expect(openIdForTrip(ctx(), T0 + 20 * 3600_000)).toBeNull();
    expect(openIdForTrip(null, T0)).toBeNull();
    expect(openIdForTrip(ctx(), Number.NaN)).toBeNull();
  });
});

describe("openFields and the drop event", () => {
  it("puts the open's facts on the drop and no coordinates", () => {
    const c = ctx({ seen: 0, buffered: 0, gate: "paused", snap: { en: true, mv: false, perm: 4 } });
    const ev = buildDropEvent(
      {
        reason: "no_coords",
        coords: 1,
        open: openFields(c, T0 + 310_000),
        engineAtDrop: { en: true, mv: false, tm: 1, perm: 4, prec: 1, gps: true, ps: true, mfr: "OPPO" },
        nativeFixAgeSec: 312.4,
        nativeCoords: 0,
      },
      T0 + 310_000,
      "android"
    );
    expect(ev).toMatchObject({
      reason: "no_coords",
      lost: true,
      openId: "oabc123def456",
      openAgeSec: 310,
      openReason: "motion",
      via: "headless",
      appState: "background",
      seedAgeSec: 4,
      fixesSeen: 0,
      fixesBuffered: 0,
      gate: "paused",
      engineAtOpen: { en: true, mv: false, perm: 4 },
      engineAtDrop: { perm: 4, prec: 1, ps: true, mfr: "OPPO" },
      nativeFixAgeSec: 312,
      nativeCoords: 0,
    });
    expect(JSON.stringify(ev)).not.toMatch(/"lat"|"lng"|latitude|longitude/i);
  });
  it("keeps the event small", () => {
    const c = ctx({ seen: 25, buffered: 25, gate: "low_power_lock", snap: buildEngineSnapshot({ state: { enabled: true, isMoving: true, trackingMode: 1, didLaunchInBackground: true }, provider: { status: 3, accuracyAuthorization: 0, gps: true, network: true, enabled: true }, powerSave: false, battery: { level: 0.5, charging: false }, manufacturer: "samsung" }) });
    const ev = buildDropEvent({ reason: "no_coords", open: openFields(c, T0 + 1000), engineAtDrop: c.snap }, T0 + 1000, "android");
    expect(JSON.stringify(ev).length).toBeLessThan(900);
  });
  it("leaves a drop with no open exactly as before", () => {
    const ev = buildDropEvent({ reason: "too_short", coords: 5 }, T0, "ios");
    expect(ev.openId).toBeUndefined();
    expect(ev.engineAtDrop).toBeUndefined();
  });
});

describe("buildEngineSnapshot", () => {
  it("folds the SDK and OS answers into a few primitives", () => {
    expect(
      buildEngineSnapshot({
        state: { enabled: true, isMoving: false, trackingMode: 1, didLaunchInBackground: true, odometer: 5 },
        provider: { status: 4, accuracyAuthorization: 1, gps: true, network: false, enabled: true },
        powerSave: true,
        battery: { level: 0.234, charging: false },
        manufacturer: " Xiaomi ",
      })
    ).toEqual({ en: true, mv: false, tm: 1, bg: true, perm: 4, prec: 1, gps: true, net: false, loc: true, ps: true, bat: 23, chg: false, mfr: "Xiaomi" });
  });
  it("leaves out whatever could not be read", () => {
    expect(buildEngineSnapshot({})).toEqual({});
    expect(buildEngineSnapshot({ state: { enabled: "yes" }, battery: { level: null, charging: null }, manufacturer: "  " })).toEqual({});
  });
});
