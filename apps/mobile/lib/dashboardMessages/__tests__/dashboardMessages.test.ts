import { describe, it, expect } from "vitest";
import {
  selectDashboardMessages,
  batteryChecklistCopy,
  BATTERY_SNOOZE_MS,
  MAX_SUGGESTIONS,
  type MessageInputs,
} from "../index";

const NOW = new Date("2026-09-15T09:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

// A driver in the healthy steady state: everything granted, nothing to say.
const base: MessageInputs = {
  activeShift: false,
  loading: false,
  locationTier: "always",
  bgRefreshOff: false,
  bgPermissionLost: false,
  motionDenied: false,
  notifPermission: "granted",
  batteryApplicable: false,
  batteryIgnoring: null,
  batteryDismissedAt: null,
  now: NOW,
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
    const r = on({ locationTier: "foreground", batteryApplicable: true, batteryIgnoring: false });
    expect(r.setup!.total).toBe(4);
    expect(r.setup!.done).toBe(2); // motion + notifications
  });

  // ── Battery (Android) ───────────────────────────────────────────
  // 15 Sep 2026 audit: optimisation still ON for 12 of 17 phones reporting
  // it. The row is done when the phone reads ignoring:true, and not before.
  const android = (over: Partial<MessageInputs>) =>
    on({ batteryApplicable: true, batteryIgnoring: false, ...over });
  const batteryRow = (r: ReturnType<typeof on>) =>
    r.setup!.items.find((i) => i.id === "battery")!;

  it("keeps the battery row until the phone reads ignoring:true", () => {
    const r = android({});
    expect(r.setup).not.toBeNull();
    expect(r.setup!.done).toBe(3);
    expect(r.setup!.total).toBe(4);
    const b = batteryRow(r);
    expect(b.applicable).toBe(true);
    expect(b.done).toBe(false);
    expect(b.actionable).toBe(true);
    expect(b.silenced).toBe(false);
  });

  it("marks battery done, and says nothing, once ignoring flips to true", () => {
    expect(android({ batteryIgnoring: true }).setup).toBeNull();
    const r = android({ batteryIgnoring: true, locationTier: "foreground" });
    expect(batteryRow(r).done).toBe(true);
    expect(r.setup!.done).toBe(3);
  });

  it("hides the row while a dismissal is under 7 days old", () => {
    const r = android({ batteryDismissedAt: NOW - 6 * DAY });
    expect(r.setup).toBeNull();
  });

  it("still counts a snoozed row as outstanding alongside other work", () => {
    const r = android({ batteryDismissedAt: NOW - DAY, locationTier: "foreground" });
    expect(r.setup).not.toBeNull();
    const b = batteryRow(r);
    expect(b.done).toBe(false);
    expect(b.silenced).toBe(true);
    expect(r.setup!.done).toBe(2);
  });

  it("brings the row back once the dismissal is older than 7 days", () => {
    const r = android({ batteryDismissedAt: NOW - BATTERY_SNOOZE_MS - 1 });
    expect(r.setup).not.toBeNull();
    const b = batteryRow(r);
    expect(b.applicable).toBe(true);
    expect(b.done).toBe(false);
    expect(b.actionable).toBe(true);
    expect(b.silenced).toBe(false);
  });

  it("a dismissal never resolves it: only ignoring:true does", () => {
    const r = android({ batteryDismissedAt: NOW - 30 * DAY });
    expect(batteryRow(r).done).toBe(false);
  });

  it("is never applicable on iOS, whatever the other inputs say", () => {
    for (const ignoring of [false, true, null] as const) {
      const r = on({ batteryApplicable: false, batteryIgnoring: ignoring, locationTier: "foreground" });
      expect(batteryRow(r).applicable).toBe(false);
      expect(r.setup!.total).toBe(3);
    }
    expect(on({ batteryApplicable: false, batteryIgnoring: false }).setup).toBeNull();
  });

  it("leaves battery out when the phone could not answer", () => {
    const r = android({ batteryIgnoring: null, locationTier: "foreground" });
    expect(batteryRow(r).applicable).toBe(false);
    expect(r.setup!.total).toBe(3);
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

describe("batteryChecklistCopy", () => {
  it("gives Samsung the Never sleeping apps path", () => {
    const c = batteryChecklistCopy("samsung");
    expect(c.label).toContain("Samsung");
    expect(c.hint).toBe(
      "Settings, Battery, Background usage limits, Never sleeping apps: add MileClear"
    );
  });

  it("gives Honor and Huawei the App launch path", () => {
    for (const m of ["HONOR", "HUAWEI", "Huawei"]) {
      expect(batteryChecklistCopy(m).hint).toBe(
        "Settings, Battery, App launch: MileClear, Manage manually, all three on"
      );
    }
  });

  it("gives Xiaomi (and Redmi, Poco) the App battery saver path", () => {
    for (const m of ["Xiaomi", "Redmi", "POCO"]) {
      expect(batteryChecklistCopy(m).hint).toBe(
        "Settings, Battery, App battery saver: MileClear, No restrictions"
      );
    }
  });

  it("falls back to the stock Android path for everyone else", () => {
    for (const m of ["Google", "motorola", "Sony", "", null, undefined]) {
      expect(batteryChecklistCopy(m).hint).toBe("Settings, Apps, MileClear, Battery, Unrestricted");
    }
  });

  it("uses no em dashes", () => {
    for (const m of ["samsung", "HONOR", "Xiaomi", null]) {
      const c = batteryChecklistCopy(m);
      expect(c.label + c.hint).not.toMatch(/\u2014/);
    }
  });
});
