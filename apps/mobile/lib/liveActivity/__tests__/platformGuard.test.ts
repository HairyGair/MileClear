// Live Activities are iOS-only. The 15 Sep 2026 Android audit found Android
// phones logging la_* diagnostics and reaching the server through this
// module, which polluted the fleet measurements. Off iOS every export must
// return its "not available" value and touch nothing: no native module, no
// SQLite, no detection event, no network.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  native: {
    isSupported: vi.fn(),
    startActivity: vi.fn(),
    updateActivity: vi.fn(),
    endActivity: vi.fn(),
    endActivityWithSummary: vi.fn(),
    markClassified: vi.fn(),
    getLiveActivityPhase: vi.fn(),
    getActiveActivityId: vi.fn(),
    getPendingLiveActivityDecision: vi.fn(),
    clearPendingLiveActivityDecision: vi.fn(),
    getPushToStartToken: vi.fn(),
  },
  getDatabase: vi.fn(),
  apiRequest: vi.fn(),
  registerLiveActivityToken: vi.fn(),
  logDetectionEvent: vi.fn(),
  startNativeAutoTripLiveActivity: vi.fn(),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android", Version: 34 },
  NativeModules: { LiveActivityModule: mocks.native },
  AppState: { currentState: "active", addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock("../../db", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("../../db/index", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("../../api", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../../api/index", () => ({ apiRequest: mocks.apiRequest }));
vi.mock("../../api/notifications", () => ({ registerLiveActivityToken: mocks.registerLiveActivityToken }));
vi.mock("../../tracking/detection", () => ({
  logDetectionEvent: mocks.logDetectionEvent,
  startNativeAutoTripLiveActivity: mocks.startNativeAutoTripLiveActivity,
}));
vi.mock("@mileclear/shared", () => ({ MILESTONE_MILES: [100, 500, 1000] }));

import * as la from "../index";
import * as presence from "../presence";
import { applyPendingLiveActivityAction } from "../pending";
import { getLiveActivityContext } from "../context";

beforeEach(() => {
  vi.clearAllMocks();
  // If a guard is missing these would make the call "succeed" and be counted.
  mocks.native.getActiveActivityId.mockResolvedValue("act-1");
  mocks.native.getPushToStartToken.mockResolvedValue("deadbeef");
  mocks.native.isSupported.mockResolvedValue(true);
  mocks.native.getPendingLiveActivityDecision.mockResolvedValue({ kind: "not_driving", atMs: Date.now() });
});

function expectNothingTouched() {
  for (const [name, fn] of Object.entries(mocks.native)) {
    expect(fn, `native ${name} was called off iOS`).not.toHaveBeenCalled();
  }
  expect(mocks.getDatabase).not.toHaveBeenCalled();
  expect(mocks.apiRequest).not.toHaveBeenCalled();
  expect(mocks.registerLiveActivityToken).not.toHaveBeenCalled();
  expect(mocks.logDetectionEvent).not.toHaveBeenCalled();
  expect(mocks.startNativeAutoTripLiveActivity).not.toHaveBeenCalled();
}

describe("lib/liveActivity off iOS", () => {
  it("index.ts exports return their not-available values without touching anything", async () => {
    expect(await la.isLiveActivitySupported()).toBe(false);
    expect(await la.startLiveActivity({ activityType: "trip", isBusinessMode: true })).toBeNull();
    await la.updateLiveActivity({ distanceMiles: 1, speedMph: 20 });
    await la.markLiveActivitySaving(1);
    await la.markLiveActivityTooShort(0.1);
    await la.markLiveActivityNoSignal(1);
    expect(await la.getLiveActivityPhase()).toBeNull();
    await la.endLiveActivity();
    await la.endLiveActivityWithSummary({ distanceMiles: 1 });
    await la.markLiveActivityClassified();
    expect(await la.getActiveActivityId()).toBeNull();
    expect(await la.recoverLiveActivity(Date.now())).toBe(false);
    expect(
      await la.restartLiveActivity({ activityType: "trip", isBusinessMode: true, originalStartDateMs: 1 })
    ).toBeNull();
    expect(await la.getPendingLiveActivityDecision()).toBeNull();
    await la.clearPendingLiveActivityDecision();
    expect(await la.getPushToStartToken()).toBeNull();
    await la.syncPushToStartToken();
    expect(la.getLastLiveActivityStartError()).toBeNull();
    expectNothingTouched();
  });

  it("presence probe and its notes are silent: no la_presence_check, no la.presence_check", async () => {
    await presence.noteLiveActivitySignal("push_requested");
    await presence.noteLiveActivityAdopted();
    await presence.probeLiveActivityPresence();
    expect(await presence.getLiveActivityState()).toEqual({
      enabled: null,
      present: null,
      activityId: null,
      hasPushToStartToken: null,
      lastSignalAt: null,
      lastSignalKind: null,
      lastStartError: null,
    });
    expectNothingTouched();
  });

  it("pending decisions and the update context are no-ops", async () => {
    expect(await applyPendingLiveActivityAction()).toBeNull();
    expect(await getLiveActivityContext({ currentTripMiles: 2.5, includeEarnings: true, lifetimeMiles: 99 })).toEqual({
      dailyTotalMiles: 2.5,
      milestoneText: null,
      earningsTodayPence: null,
    });
    expectNothingTouched();
  });
});
