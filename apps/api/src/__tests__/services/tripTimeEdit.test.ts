/**
 * Correcting when a journey began.
 *
 * Emily Russell (17 Sep 2026) typed in a morning drive at 13:50, it saved at
 * 13:50, and the start time then could not be changed. A hand-typed trip has
 * no breadcrumbs, so the driver's correction is the only truth about its time.
 * A recorded trip's start is its first breadcrumb: it may move earlier (Mus,
 * 17 Sep 2026, whose phone slept for the first hour of Weymouth to Exeter
 * and left 57 miles in 14 minutes) but never later.
 */
import { describe, it, expect } from "vitest";
import { startTimeChangeAllowed, type TimeEditTrip } from "../../services/tripTimeEdit.js";

const manual: TimeEditTrip = {
  isManualEntry: true,
  startedAt: new Date("2026-09-17T13:50:00Z"),
  endedAt: new Date("2026-09-17T14:20:00Z"),
};
const recorded: TimeEditTrip = { ...manual, isManualEntry: false };

describe("startTimeChangeAllowed", () => {
  it("lets a manual trip's start move back to when it really happened", () => {
    expect(
      startTimeChangeAllowed(manual, { startedAt: new Date("2026-09-17T08:10:00Z") })
    ).toEqual({ ok: true });
  });

  it("lets a recorded trip's start move earlier, for the hour the phone slept", () => {
    expect(
      startTimeChangeAllowed(recorded, { startedAt: new Date("2026-09-17T12:50:00Z") })
    ).toEqual({ ok: true });
    // Resending the stored start unchanged is not a move at all.
    expect(startTimeChangeAllowed(recorded, { startedAt: recorded.startedAt })).toEqual({ ok: true });
  });

  it("refuses to move a recorded trip's start later than its first breadcrumb", () => {
    expect(
      startTimeChangeAllowed(recorded, { startedAt: new Date("2026-09-17T13:51:00Z") })
    ).toEqual({ ok: false, error: "A recorded trip's start time can only be moved earlier" });
  });

  it("still keeps a recorded trip's earlier start before its end", () => {
    // Earlier than the stored start, but the same PATCH pulls the end back
    // past it.
    expect(
      startTimeChangeAllowed(recorded, {
        startedAt: new Date("2026-09-17T13:00:00Z"),
        endedAt: new Date("2026-09-17T12:30:00Z"),
      })
    ).toEqual({ ok: false, error: "Start time cannot be after the end time" });
  });

  it("refuses a start after the end the trip will have once the PATCH lands", () => {
    // Later than the stored end.
    expect(
      startTimeChangeAllowed(manual, { startedAt: new Date("2026-09-17T15:00:00Z") })
    ).toEqual({ ok: false, error: "Start time cannot be after the end time" });
    // Later than an end arriving in the same PATCH, even though it is before
    // the stored one.
    expect(
      startTimeChangeAllowed(manual, {
        startedAt: new Date("2026-09-17T14:00:00Z"),
        endedAt: new Date("2026-09-17T13:55:00Z"),
      })
    ).toEqual({ ok: false, error: "Start time cannot be after the end time" });
    // The same PATCH clearing the end leaves nothing to be after.
    expect(
      startTimeChangeAllowed(manual, { startedAt: new Date("2026-09-17T15:00:00Z"), endedAt: null })
    ).toEqual({ ok: true });
  });

  it("is a no-op when the PATCH carries no start time", () => {
    expect(startTimeChangeAllowed(recorded, {})).toEqual({ ok: true });
    expect(
      startTimeChangeAllowed(recorded, { endedAt: new Date("2026-09-17T13:00:00Z") })
    ).toEqual({ ok: true });
  });
});
