import { describe, it, expect } from "vitest";
import {
  selectDashboardMessages,
  MAX_SUGGESTIONS,
  type MessageInputs,
} from "../index";

// A driver in the healthy steady state: everything granted, nothing to say.
const NOW = new Date("2026-09-15T09:00:00Z").getTime();

const base: MessageInputs = {
  activeShift: false,
  loading: false,
  locationTier: "always",
  bgRefreshOff: false,
  bgPermissionLost: false,
  motionDenied: false,
  notifPermission: "granted",
  batteryApplicable: false,
  batteryNudgeShow: false,
  bgLocNudgeSilenced: false,
  motionNudgeSilenced: false,
  notifDeniedNudgeSilenced: false,
  notifPrimerSilenced: false,
  detectionOffSince: null,
  firstTripEligible: false,
  savedPlacesEligible: false,
  referralEligible: false,
  proEligible: false,
  androidBetaEligible: false,
};
const on = (over: Partial<MessageInputs>) => selectDashboardMessages({ ...base, ...over });

describe("recording switched off in Settings", () => {
  it("is the first suggestion, ahead of everything else", () => {
    const r = on({ detectionOffSince: NOW - 3 * 24 * 3600 * 1000, firstTripEligible: true, referralEligible: true });
    expect(r.suggestions[0]).toBe("detection_off");
    expect(r.suggestions).toHaveLength(2);
  });
  it("is absent while recording is on", () => {
    expect(on({}).suggestions).not.toContain("detection_off");
  });
});

describe("selectDashboardMessages", () => {
  it("says nothing to a healthy driver", () => {
    const r = on({});
    expect(r).toEqual({ blocker: null, setup: null, suggestions: [] });
  });

  it("says nothing at all during an active shift", () => {
    const r = on({
      activeShift: true,
      locationTier: "none",
      firstTripEligible: true,
      proEligible: true,
    });
    expect(r).toEqual({ blocker: null, setup: null, suggestions: [] });
  });

  // ── Blockers ────────────────────────────────────────────────────
  it("no_location outranks bg_refresh_off", () => {
    expect(on({ locationTier: "none", bgRefreshOff: true }).blocker).toBe("no_location");
  });

  it("shows bg_refresh_off once location is granted", () => {
    expect(on({ locationTier: "foreground", bgRefreshOff: true }).blocker).toBe("bg_refresh_off");
  });

  it("shows permission_lost when background access was lost", () => {
    expect(on({ locationTier: "foreground", bgPermissionLost: true }).blocker).toBe("permission_lost");
  });

  // The one guard ordering does NOT give us for free.
  it("does NOT nag about permission_lost once Always is granted again", () => {
    expect(on({ locationTier: "always", bgPermissionLost: true }).blocker).toBeNull();
  });

  it("still shows a blocker while the dashboard is loading", () => {
    expect(on({ loading: true, locationTier: "none" }).blocker).toBe("no_location");
  });

  // ── Rule 1: one thing above your mileage ────────────────────────
  it("hides the setup card entirely while a blocker is showing", () => {
    const r = on({ locationTier: "none", motionDenied: true, notifPermission: "denied" });
    expect(r.blocker).toBe("no_location");
    expect(r.setup).toBeNull();
  });

  // ── Setup checklist ─────────────────────────────────────────────
  it("offers the checklist when location is foreground-only", () => {
    const r = on({ locationTier: "foreground" });
    expect(r.blocker).toBeNull();
    expect(r.setup).not.toBeNull();
    const loc = r.setup!.items.find((i) => i.id === "always_location")!;
    expect(loc.done).toBe(false);
    expect(loc.actionable).toBe(true);
  });

  it("counts battery as not applicable on iOS rather than done", () => {
    const r = on({ locationTier: "foreground", batteryApplicable: false });
    expect(r.setup!.total).toBe(3);
    expect(r.setup!.items.find((i) => i.id === "battery")!.applicable).toBe(false);
  });

  it("counts battery on Android", () => {
    const r = on({ locationTier: "foreground", batteryApplicable: true, batteryNudgeShow: true });
    expect(r.setup!.total).toBe(4);
    expect(r.setup!.done).toBe(2); // motion + notifications
  });

  it("reports progress as done/total", () => {
    const r = on({ locationTier: "foreground", motionDenied: true });
    expect(r.setup!.done).toBe(1); // notifications only
    expect(r.setup!.total).toBe(3);
  });

  it("does not chase motion until location is sorted", () => {
    const r = on({ locationTier: "foreground", motionDenied: true });
    const motion = r.setup!.items.find((i) => i.id === "motion")!;
    expect(motion.done).toBe(false);
    expect(motion.actionable).toBe(false);
  });

  it("chases motion once Always is granted", () => {
    const r = on({ locationTier: "always", motionDenied: true });
    const motion = r.setup!.items.find((i) => i.id === "motion")!;
    expect(motion.actionable).toBe(true);
  });

  it("hides the checklist when every outstanding item is snoozed", () => {
    expect(on({ locationTier: "foreground", bgLocNudgeSilenced: true }).setup).toBeNull();
  });

  it("uses the primer snooze when notifications were never asked for", () => {
    const r = on({ notifPermission: "undetermined", notifPrimerSilenced: true });
    expect(r.setup).toBeNull();
  });

  it("uses the denied snooze when notifications were refused", () => {
    const r = on({ notifPermission: "denied", notifDeniedNudgeSilenced: true });
    expect(r.setup).toBeNull();
  });

  it("hides the checklist when there is nothing left to do", () => {
    expect(on({}).setup).toBeNull();
  });

  // ── Suggestions ─────────────────────────────────────────────────
  it("caps suggestions at two", () => {
    const r = on({
      firstTripEligible: true,
      savedPlacesEligible: true,
      referralEligible: true,
      proEligible: true,
      androidBetaEligible: true,
    });
    expect(r.suggestions).toHaveLength(MAX_SUGGESTIONS);
    expect(r.suggestions).toEqual(["first_trip", "saved_places"]);
  });

  it("puts a driver with no trips on first_trip above everything", () => {
    const r = on({ firstTripEligible: true, proEligible: true });
    expect(r.suggestions[0]).toBe("first_trip");
  });

  it("keeps suggestions below the fold independent of the blocker", () => {
    const r = on({ locationTier: "none", savedPlacesEligible: true });
    expect(r.blocker).toBe("no_location");
    expect(r.suggestions).toEqual(["saved_places"]);
  });

  it("returns an empty list when nothing is eligible", () => {
    expect(on({}).suggestions).toEqual([]);
  });
});
