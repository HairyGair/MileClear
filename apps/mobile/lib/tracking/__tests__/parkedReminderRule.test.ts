import { describe, it, expect } from "vitest";
import {
  PARKED_COPY,
  PARKED_REMINDER_MS,
  parkedActionKind,
  parkedArrivedDecision,
  parkedArrivedMayFinish,
  startTripFinishedAlert,
  startTripFinishedListenerAction,
  parkedArrivedNotification,
  parkedReminderForegroundDecision,
  parkedReminderPlan,
  parseParkedReminderState,
  shouldApplyParkedResponse,
  type ParkedReminderState,
} from "../parkedReminderRule";
import { segmentsToSave, type SegmentCoordinate } from "../shiftSegments";

const MIN = 60_000;
const START = Date.UTC(2026, 9, 9, 9, 0);
const base = {
  nowMs: START + 10 * MIN,
  isQuickTrip: true,
  hasStartRow: true,
  untilArrived: true,
  quickTripStartMs: START as number | null,
  lastDrivingMs: null as number | null,
  state: null as ParkedReminderState | null,
};

describe("parkedReminderPlan: arming", () => {
  it("does not arm before the first drive (depot wait after Start Trip)", () => {
    expect(parkedReminderPlan(base)).toEqual({ action: "keep" });
  });

  it("ignores a driving fix older than Start Trip (leftover trail)", () => {
    expect(parkedReminderPlan({ ...base, lastDrivingMs: START - MIN })).toEqual({ action: "keep" });
  });

  it("arms at the first driving fix for last driving + 10 minutes", () => {
    const drove = START + 5 * MIN;
    const plan = parkedReminderPlan({ ...base, nowMs: drove + 5000, lastDrivingMs: drove });
    expect(plan).toEqual({
      action: "schedule",
      fireAtMs: drove + PARKED_REMINDER_MS,
      anchorMs: drove,
      dismissDelivered: false,
      firstForStop: true,
    });
  });

  it("does not arm with the setting off", () => {
    expect(
      parkedReminderPlan({ ...base, untilArrived: false, lastDrivingMs: START + 5 * MIN })
    ).toEqual({ action: "keep" });
  });

  it("does not arm for a real shift (no Start Trip lock)", () => {
    expect(
      parkedReminderPlan({ ...base, isQuickTrip: false, lastDrivingMs: START + 5 * MIN })
    ).toEqual({ action: "keep" });
  });

  it("does not arm without a start row", () => {
    expect(
      parkedReminderPlan({
        ...base,
        hasStartRow: false,
        quickTripStartMs: null,
        lastDrivingMs: START + 5 * MIN,
      })
    ).toEqual({ action: "keep" });
  });

  it("never schedules in the past: a stop already 10 minutes old fires in a few seconds", () => {
    const drove = START + 2 * MIN;
    const now = drove + 15 * MIN;
    const plan = parkedReminderPlan({ ...base, nowMs: now, lastDrivingMs: drove });
    expect(plan.action).toBe("schedule");
    if (plan.action === "schedule") expect(plan.fireAtMs).toBe(now + 5000);
  });

  it("tolerates NaN and null inputs", () => {
    expect(parkedReminderPlan({ ...base, lastDrivingMs: NaN })).toEqual({ action: "keep" });
    expect(parkedReminderPlan({ ...base, quickTripStartMs: null, lastDrivingMs: START })).toEqual({
      action: "keep",
    });
  });
});

describe("parkedReminderPlan: re-arm while driving", () => {
  const anchor = START + 5 * MIN;
  const state: ParkedReminderState = { anchorMs: anchor, fireAtMs: anchor + PARKED_REMINDER_MS };

  it("keeps a pending reminder when driving moved on by under 60 s", () => {
    expect(
      parkedReminderPlan({ ...base, nowMs: anchor + 40_000, lastDrivingMs: anchor + 30_000, state })
    ).toEqual({ action: "keep" });
  });

  it("pushes it back when driving moved on by 70 s", () => {
    const plan = parkedReminderPlan({
      ...base,
      nowMs: anchor + 71_000,
      lastDrivingMs: anchor + 70_000,
      state,
    });
    expect(plan).toEqual({
      action: "schedule",
      fireAtMs: anchor + 70_000 + PARKED_REMINDER_MS,
      anchorMs: anchor + 70_000,
      dismissDelivered: false,
      firstForStop: false,
    });
  });

  it("when driving stops nothing reschedules: the fire time is 9 to 10 minutes after the last fix", () => {
    // Last batch while driving ends at `anchor`; the stored fire time is exactly +10 min.
    expect(state.fireAtMs - anchor).toBe(10 * MIN);
    // The batch before that was up to ~60 s earlier, so the earliest the OS could fire is 9 minutes after any fix.
    const earlier = parkedReminderPlan({
      ...base,
      nowMs: anchor,
      lastDrivingMs: anchor,
      state: { anchorMs: anchor - 59_000, fireAtMs: anchor - 59_000 + PARKED_REMINDER_MS },
    });
    expect(earlier).toEqual({ action: "keep" });
  });
});

describe("parkedReminderPlan: once per stop and re-arm after a shown reminder", () => {
  const anchor = START + 5 * MIN;
  const fireAt = anchor + PARKED_REMINDER_MS;
  const state: ParkedReminderState = { anchorMs: anchor, fireAtMs: fireAt };

  it("a walking fix after the reminder fired does not arm a second one for the same stop", () => {
    // walking: the latest driving fix is still the anchor
    expect(
      parkedReminderPlan({ ...base, nowMs: fireAt + 5 * MIN, lastDrivingMs: anchor, state })
    ).toEqual({ action: "keep" });
  });

  it("Keep going does not snooze: still nothing for the same stop an hour later", () => {
    expect(
      parkedReminderPlan({ ...base, nowMs: fireAt + 60 * MIN, lastDrivingMs: anchor, state })
    ).toEqual({ action: "keep" });
  });

  it("the next driving fix after it fired dismisses the old one and arms a new stop", () => {
    const drove = fireAt + 20 * MIN;
    const plan = parkedReminderPlan({ ...base, nowMs: drove + 3000, lastDrivingMs: drove, state });
    expect(plan).toEqual({
      action: "schedule",
      fireAtMs: drove + PARKED_REMINDER_MS,
      anchorMs: drove,
      dismissDelivered: true,
      firstForStop: true,
    });
  });

  it("driving again before it fired just pushes it back, nothing to dismiss", () => {
    const drove = anchor + 3 * MIN;
    const plan = parkedReminderPlan({ ...base, nowMs: drove, lastDrivingMs: drove, state });
    expect(plan.action).toBe("schedule");
    if (plan.action === "schedule") {
      expect(plan.dismissDelivered).toBe(false);
      expect(plan.firstForStop).toBe(false);
    }
  });
});

describe("parkedReminderPlan: cancelling", () => {
  const state: ParkedReminderState = { anchorMs: START + 5 * MIN, fireAtMs: START + 15 * MIN };

  it("setting turned off cancels a scheduled reminder", () => {
    expect(
      parkedReminderPlan({ ...base, untilArrived: false, lastDrivingMs: START + 5 * MIN, state })
    ).toEqual({ action: "cancel", reason: "setting_off" });
  });

  it("the Start Trip ending (lock gone) cancels it", () => {
    expect(
      parkedReminderPlan({ ...base, isQuickTrip: false, lastDrivingMs: START + 5 * MIN, state })
    ).toEqual({ action: "cancel", reason: "lock_released" });
  });

  it("a missing start row cancels it", () => {
    expect(
      parkedReminderPlan({
        ...base,
        hasStartRow: false,
        quickTripStartMs: null,
        lastDrivingMs: START + 5 * MIN,
        state,
      })
    ).toEqual({ action: "cancel", reason: "lock_released" });
  });
});

describe("parked reminder state row", () => {
  it("round-trips", () => {
    expect(parseParkedReminderState(JSON.stringify({ anchorMs: 1, fireAtMs: 2 }))).toEqual({
      anchorMs: 1,
      fireAtMs: 2,
    });
  });
  it("treats junk as no state", () => {
    expect(parseParkedReminderState(null)).toBeNull();
    expect(parseParkedReminderState("nope")).toBeNull();
    expect(parseParkedReminderState("{}")).toBeNull();
  });
});

describe("parkedArrivedDecision", () => {
  const now = START + 40 * MIN;
  it("no lock: already finished elsewhere", () => {
    expect(parkedArrivedDecision({ nowMs: now, lockHeld: false, lastDrivingMs: now - 20 * MIN })).toBe(
      "already_finished"
    );
  });
  it("driving a minute ago: still moving", () => {
    expect(parkedArrivedDecision({ nowMs: now, lockHeld: true, lastDrivingMs: now - MIN })).toBe(
      "driving_again"
    );
  });
  it("two minutes or more: finish", () => {
    expect(parkedArrivedDecision({ nowMs: now, lockHeld: true, lastDrivingMs: now - 2 * MIN })).toBe(
      "finish"
    );
    expect(parkedArrivedDecision({ nowMs: now, lockHeld: true, lastDrivingMs: now - 11 * MIN })).toBe(
      "finish"
    );
  });
  it("never drove: finish (saves nothing)", () => {
    expect(parkedArrivedDecision({ nowMs: now, lockHeld: true, lastDrivingMs: null })).toBe("finish");
  });
  it("a reminder from an earlier Start Trip never finishes the one running now", () => {
    expect(
      parkedArrivedDecision({
        nowMs: now,
        lockHeld: true,
        lastDrivingMs: now - 15 * MIN,
        anchorMs: START - 60 * MIN,
        quickTripStartMs: START,
      })
    ).toBe("already_finished");
  });
  it("the reminder's own stop: finish", () => {
    const drove = now - 12 * MIN;
    expect(
      parkedArrivedDecision({
        nowMs: now,
        lockHeld: true,
        lastDrivingMs: drove + 40_000, // a late fix inside the reschedule step
        anchorMs: drove,
        quickTripStartMs: START,
      })
    ).toBe("finish");
  });
  it("an Arrived that reaches us after more driving (late replay) does not finish", () => {
    expect(
      parkedArrivedDecision({
        nowMs: now,
        lockHeld: true,
        lastDrivingMs: now - 5 * MIN,
        anchorMs: START,
        quickTripStartMs: START - MIN,
      })
    ).toBe("driving_again");
  });
});

describe("parkedArrivedNotification", () => {
  it("saved, nothing, driving again and already finished", () => {
    expect(parkedArrivedNotification("finish", 1)).toEqual({
      title: "Trip saved",
      body: "Saved up to where you stopped driving. Your next drives record automatically.",
      action: "open_trips",
    });
    expect(parkedArrivedNotification("finish", 0)).toEqual({
      title: "Start Trip ended",
      body: "There wasn't enough driving to save a trip. Your next drives record automatically.",
      action: "open_dashboard",
    });
    expect(parkedArrivedNotification("driving_again", 0)?.action).toBe("open_start_trip");
    expect(parkedArrivedNotification("already_finished", 0)).toBeNull();
  });
});

describe("foreground presentation", () => {
  it("is quiet only when the app is active AND the Start Trip screen is open", () => {
    expect(parkedReminderForegroundDecision({ appActive: true, startTripScreenVisible: true })).toBe(
      "suppress"
    );
    expect(parkedReminderForegroundDecision({ appActive: true, startTripScreenVisible: false })).toBe(
      "show"
    );
    expect(parkedReminderForegroundDecision({ appActive: false, startTripScreenVisible: true })).toBe(
      "show"
    );
  });

  it("leaves the alert to the return to the app when Arrived was tapped from the lock screen", () => {
    expect(startTripFinishedListenerAction("background")).toBe("wait_for_foreground");
    expect(startTripFinishedListenerAction("active")).toBe("let_go_now");
    // Notification centre pulled down over the open app: still "inactive", alert shows on dismiss.
    expect(startTripFinishedListenerAction("inactive")).toBe("let_go_now");
  });
});

describe("response handling", () => {
  it("knows its two buttons only", () => {
    expect(parkedActionKind("parked_arrived")).toBe("arrived");
    expect(parkedActionKind("parked_keep_going")).toBe("keep_going");
    expect(parkedActionKind("keep_going")).toBeNull();
    expect(parkedActionKind("expo.modules.notifications.actions.DEFAULT")).toBeNull();
  });
  it("does not apply the same response twice", () => {
    expect(shouldApplyParkedResponse({ anchorMs: 5, actionId: "parked_arrived", handledKey: null })).toBe(true);
    expect(
      shouldApplyParkedResponse({ anchorMs: 5, actionId: "parked_arrived", handledKey: "5:parked_arrived" })
    ).toBe(false);
    expect(
      shouldApplyParkedResponse({ anchorMs: 6, actionId: "parked_arrived", handledKey: "5:parked_arrived" })
    ).toBe(true);
    expect(shouldApplyParkedResponse({ anchorMs: 5, actionId: "other", handledKey: null })).toBe(false);
  });
});

describe("copy", () => {
  it("matches the spec and has no em dashes", () => {
    expect(PARKED_COPY.title).toBe("Still on your trip?");
    expect(PARKED_COPY.body).toBe(
      "You've been stopped for 10 minutes. Tap Arrived to save the trip, or Keep going if you're still working."
    );
    expect(PARKED_COPY.arrivedLabel).toBe("Arrived");
    expect(PARKED_COPY.keepGoingLabel).toBe("Keep going");
    expect(JSON.stringify(PARKED_COPY)).not.toMatch(/—|–/);
  });
});

describe("whole trip save (segmentsToSave)", () => {
  const T0 = Date.UTC(2026, 9, 9, 9, 0);
  function leg(fromMin: number, minutes: number, lat0: number): SegmentCoordinate[] {
    const out: SegmentCoordinate[] = [];
    for (let s = 0; s <= minutes * 60; s += 10) {
      out.push({
        lat: lat0 + (s * 15) / 111_320,
        lng: -0.1,
        speed: 15,
        accuracy: 5,
        recorded_at: new Date(T0 + fromMin * MIN + s * 1000).toISOString(),
      });
    }
    return out;
  }
  // 20 min drive, a 36 minute wait with no fixes (Kada's depot), then 20 min more.
  const trail = [...leg(0, 20, 51.5), ...leg(56, 20, 51.8)];
  const splitMs = 30 * MIN;

  it("without the option a 36 minute stop cuts the trail in two", () => {
    expect(segmentsToSave(trail, splitMs, false).length).toBe(2);
  });
  it("with whole it is one trip", () => {
    const segs = segmentsToSave(trail, splitMs, true);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toHaveLength(trail.length);
  });
  it("whole still needs two fixes", () => {
    expect(segmentsToSave(trail.slice(0, 1), splitMs, true)).toEqual([]);
  });
});

describe("parkedArrivedMayFinish", () => {
  it("finishes only when neither the screen nor another tap is saving the trip", () => {
    expect(parkedArrivedMayFinish({ formArriving: false, finishRunning: false })).toBe(true);
    expect(parkedArrivedMayFinish({ formArriving: true, finishRunning: false })).toBe(false);
    expect(parkedArrivedMayFinish({ formArriving: false, finishRunning: true })).toBe(false);
  });
});

describe("startTripFinishedAlert", () => {
  it("never says Trip saved when nothing was saved", () => {
    for (const fromReminder of [true, false]) {
      const a = startTripFinishedAlert({ fromReminder, tripsSaved: 0 });
      expect(a.title).toBe("Start Trip ended");
      expect(a.body).not.toMatch(/saved up to|finished and saved/);
    }
  });
  it("saved: the reminder and parked messages", () => {
    expect(startTripFinishedAlert({ fromReminder: true, tripsSaved: 1 }).body).toMatch(
      /^You tapped Arrived on the notification/
    );
    expect(startTripFinishedAlert({ fromReminder: false, tripsSaved: 2 }).body).toMatch(/^You'd parked/);
  });
  it("unknown count keeps the usual message", () => {
    expect(startTripFinishedAlert({ fromReminder: true, tripsSaved: null }).title).toBe("Trip saved");
  });
  it("no em dashes in any of it", () => {
    for (const t of [0, 1, null]) {
      for (const fromReminder of [true, false]) {
        const a = startTripFinishedAlert({ fromReminder, tripsSaved: t });
        expect(a.title + a.body).not.toMatch(/\u2014/);
      }
    }
  });
});
