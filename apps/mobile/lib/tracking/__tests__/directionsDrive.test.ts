/**
 * The recorder's Directions handler, LOG ONLY (PLAN-recording.md step 4):
 * guidance starting, moving and ending is logged as what WOULD happen, and
 * nothing is written or changed. "on" behaves exactly like "log".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { state, db, logged, detection, engine } = vi.hoisted(() => {
  const state: Record<string, string> = {};
  const db = {
    getFirstAsync: vi.fn(async (_sql: string, args: string[]) => (args[0] in state ? { value: state[args[0]] } : null)),
    runAsync: vi.fn(),
    execAsync: vi.fn(),
    getAllAsync: vi.fn(),
  };
  const logged: Array<[string, Record<string, unknown>]> = [];
  const detection = {
    logDetectionEvent: vi.fn(async (e: string, d: Record<string, unknown>) => {
      logged.push([e, d]);
    }),
    getDrivePauseUntil: vi.fn(async () => null as number | null),
    isDriveDetectionSwitchOn: vi.fn(async () => true),
  };
  const engine = { isNativeEngineTracking: vi.fn(() => true) };
  return { state, db, logged, detection, engine };
});
vi.mock("../../db/index", () => ({ getDatabase: vi.fn(async () => db) }));
vi.mock("../detection", () => detection);
vi.mock("../nativeLocation", () => engine);

import { handleGuidanceIntent, registerDirectionsDrive } from "../directionsDrive";
import { _resetDirectionsArm, directionsArmFix, hasWouldArm } from "../directionsArm";
import { announceGuidance, setGuidanceHandler, type GuidanceIntent } from "../../navigation/guidanceIntent";

const MPH = 0.44704;
const now = Date.now();
const movingFix = { lat: 54.9, lng: -1.6, speedMps: 20 * MPH, accuracyM: 8, atMs: now };
const parkedFix = { ...movingFix, speedMps: 0 };
const intent = (o: Partial<GuidanceIntent> = {}): GuidanceIntent => ({
  kind: "started",
  sessionId: "dir_1",
  mode: "log",
  passenger: false,
  fix: movingFix,
  atMs: now,
  ...o,
});
const events = () => logged.map(([e]) => e);
const decision = () => logged.find(([e]) => e === "directions_open_decision")?.[1];

beforeEach(() => {
  logged.length = 0;
  for (const k of Object.keys(state)) delete state[k];
  vi.clearAllMocks();
  detection.getDrivePauseUntil.mockResolvedValue(null);
  detection.isDriveDetectionSwitchOn.mockResolvedValue(true);
  engine.isNativeEngineTracking.mockReturnValue(true);
  _resetDirectionsArm();
});

describe("guidance started", () => {
  it("moving: logs that a recording would open now, and changes nothing", async () => {
    await handleGuidanceIntent(intent());
    expect(events()).toEqual(["directions_open_decision", "directions_would_open"]);
    expect(decision()).toMatchObject({ mode: "log", acts: false, action: "open_now", reason: "moving", speedMph: 20 });
    expect(db.runAsync).not.toHaveBeenCalled();
    expect(db.execAsync).not.toHaveBeenCalled();
    expect(hasWouldArm()).toBe(false);
  });

  it("'on' is treated exactly like 'log' in this build", async () => {
    await handleGuidanceIntent(intent({ mode: "on" }));
    expect(decision()).toMatchObject({ mode: "on", acts: false, action: "open_now" });
    expect(logged.find(([e]) => e === "directions_would_open")?.[1]).toMatchObject({ mode: "log", via: "now" });
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("off: one line, nothing read", async () => {
    await handleGuidanceIntent(intent({ mode: "off" }));
    expect(logged).toEqual([["directions_open_decision", { sessionId: "dir_1", mode: "off", acts: false, action: "skip", reason: "mode_off" }]]);
    expect(db.getFirstAsync).not.toHaveBeenCalled();
    expect(detection.isDriveDetectionSwitchOn).not.toHaveBeenCalled();
  });

  it("a recording already open, a shift, a cooldown, a pause, the switch off, a passenger: skip", async () => {
    const cases: Array<[() => void, Partial<GuidanceIntent>, string]> = [
      [() => (state.auto_recording_active = "1"), {}, "already_recording"],
      [() => (state.active_shift_id = "__quick_trip__"), {}, "shift_or_start_trip"],
      [() => (state.not_driving_until = String(Date.now() + 60_000)), {}, "not_driving_cooldown"],
      [() => detection.getDrivePauseUntil.mockResolvedValue(Date.now() + 60_000), {}, "paused"],
      [() => detection.isDriveDetectionSwitchOn.mockResolvedValue(false), {}, "switched_off"],
      [() => engine.isNativeEngineTracking.mockReturnValue(false), {}, "no_engine"],
      [() => {}, { passenger: true }, "passenger"],
    ];
    for (const [arrange, o, reason] of cases) {
      logged.length = 0;
      for (const k of Object.keys(state)) delete state[k];
      detection.getDrivePauseUntil.mockResolvedValue(null);
      detection.isDriveDetectionSwitchOn.mockResolvedValue(true);
      engine.isNativeEngineTracking.mockReturnValue(true);
      arrange();
      await handleGuidanceIntent(intent(o));
      expect(decision()).toMatchObject({ action: "skip", reason });
      expect(events()).not.toContain("directions_would_open");
    }
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("an expired cooldown is read, never cleared", async () => {
    state.not_driving_until = String(Date.now() - 1000);
    await handleGuidanceIntent(intent());
    expect(decision()).toMatchObject({ action: "open_now" });
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("unreadable state reads as a skip, never as an open", async () => {
    db.getFirstAsync.mockRejectedValueOnce(new Error("locked"));
    await handleGuidanceIntent(intent());
    expect(decision()?.action).toBe("skip");
  });
});

describe("the arm, in memory only", () => {
  it("parked: arms; the first moving recorder fix logs where it would have opened", async () => {
    await handleGuidanceIntent(intent({ fix: parkedFix }));
    expect(decision()).toMatchObject({ action: "arm", reason: "not_moving" });
    expect(hasWouldArm()).toBe(true);
    const line = directionsArmFix({ ...movingFix, lat: 54.901, atMs: now + 90_000 }, now + 90_000, "recorder");
    expect(line?.event).toBe("directions_would_open");
    expect(line?.data).toMatchObject({ via: "arm", movedBy: "speed", source: "recorder", plantedStart: true, mode: "log" });
    expect((line?.data.msAfterGuidanceStart as number) >= 89_000).toBe(true);
    // One-shot.
    expect(hasWouldArm()).toBe(false);
    expect(directionsArmFix(movingFix, now + 100_000, "recorder")).toBeNull();
    expect(db.runAsync).not.toHaveBeenCalled();
  });

  it("guidance's own moving fix reaches the arm too", async () => {
    await handleGuidanceIntent(intent({ fix: parkedFix }));
    await handleGuidanceIntent(intent({ kind: "moving", fix: { ...movingFix, atMs: Date.now() } }));
    expect(logged.find(([e]) => e === "directions_would_open")?.[1]).toMatchObject({ via: "arm", source: "guidance" });
  });

  it("ended clears it", async () => {
    await handleGuidanceIntent(intent({ fix: parkedFix }));
    await handleGuidanceIntent(intent({ kind: "ended", fix: null, reason: "ended" }));
    expect(hasWouldArm()).toBe(false);
    expect(logged.at(-1)).toEqual(["directions_arm_cleared", { sessionId: "dir_1", mode: "log", reason: "ended" }]);
  });

  it("another session's end leaves it alone", async () => {
    await handleGuidanceIntent(intent({ fix: parkedFix }));
    await handleGuidanceIntent(intent({ kind: "ended", sessionId: "dir_other", fix: null }));
    expect(hasWouldArm()).toBe(true);
  });

  it("lapses after 15 minutes with one line", async () => {
    await handleGuidanceIntent(intent({ fix: parkedFix }));
    const later = Date.now() + 16 * 60_000;
    expect(directionsArmFix({ ...movingFix, atMs: later }, later, "recorder")?.event).toBe("directions_arm_expired");
    expect(hasWouldArm()).toBe(false);
  });

  it("no arm: the per-fix check is a null test", () => {
    expect(directionsArmFix(movingFix, now, "recorder")).toBeNull();
  });
});

describe("registration and the intent bus", () => {
  it("registers once, and announcing reaches the handler on a later tick", async () => {
    registerDirectionsDrive();
    registerDirectionsDrive();
    const p = announceGuidance(intent({ mode: "off" }));
    expect(logged).toEqual([]);
    await p;
    expect(events()).toEqual(["directions_open_decision"]);
    setGuidanceHandler(null);
  });
});
