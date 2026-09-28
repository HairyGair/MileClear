/**
 * The per-item rules behind the 28 Sep 2026 stuck-upload fixes: 56 of 649
 * active drivers showed permanently failed uploads, and 13 free drivers had
 * trips held back behind a saved place the server refused on the free plan.
 */
import { describe, it, expect } from "vitest";
import { isAlreadyApplied, isTripCreateBody, parkedItemAction, type ParkedItemInput } from "../queueRules";
import { isItemForbidden, isAuthError, isDefiniteClientRejection } from "../errors";
import { tripCreateBodyFromRow, isPseudoShiftId, type LocalTripRow } from "../tripPayload";
import { ApiError } from "../../api/apiError";

const apiErr = (statusCode: number, message = "boom") =>
  new ApiError({ code: "ERR", message, statusCode, retryable: false });

describe("isItemForbidden", () => {
  it("is a 403 only: the plan-limit answer for one item, not a token problem", () => {
    expect(isItemForbidden(apiErr(403))).toBe(true);
    expect(isItemForbidden(apiErr(401))).toBe(false);
    expect(isItemForbidden(new Error("403"))).toBe(false);
    // Still not a payload rejection, so a direct create never mistakes it for
    // one unless the caller decides so (saved places do).
    expect(isDefiniteClientRejection(apiErr(403))).toBe(false);
    expect(isAuthError(apiErr(403))).toBe(true);
  });
});

describe("isAlreadyApplied", () => {
  it("treats ending an already-ended shift as done", () => {
    expect(isAlreadyApplied("shift", "update", 400, "Shift is already completed")).toBe(true);
  });

  it("does not swallow any other rejection", () => {
    expect(isAlreadyApplied("shift", "update", 400, "Invalid status")).toBe(false);
    expect(isAlreadyApplied("trip", "update", 400, "Shift is already completed")).toBe(false);
    expect(isAlreadyApplied("shift", "create", 400, "Shift is already completed")).toBe(false);
    expect(isAlreadyApplied("shift", "update", 404, "Shift is already completed")).toBe(false);
  });
});

const parked = (o: Partial<ParkedItemInput>): ParkedItemInput => ({
  entityType: "trip",
  action: "create",
  localRowExists: true,
  localRowSynced: false,
  lastError: "bad",
  payload: { startedAt: "2026-09-27T13:00:00.000Z", startLat: 51.5, startLng: -0.1 },
  ...o,
});

describe("parkedItemAction", () => {
  it("gives a real trip still only on the phone another try", () => {
    expect(parkedItemAction(parked({}))).toBe("revive");
  });

  it("drops a create with nothing left to send, or already on the server", () => {
    expect(parkedItemAction(parked({ localRowExists: false }))).toBe("drop");
    expect(parkedItemAction(parked({ localRowSynced: true }))).toBe("drop");
  });

  it("rebuilds a trip create whose body was an edit (the old missing-target rule's output)", () => {
    expect(
      parkedItemAction(parked({ payload: { id: "local-1", classification: "business" }, lastError: "Required" }))
    ).toBe("rebuild");
    expect(parkedItemAction(parked({ payload: null }))).toBe("rebuild");
  });

  it("drops a shift create whose body was an end-shift edit: POST /shifts would start a new shift", () => {
    expect(parkedItemAction(parked({ entityType: "shift", payload: { status: "completed" } }))).toBe("drop");
    expect(parkedItemAction(parked({ entityType: "shift", payload: {} }))).toBe("revive");
  });

  it("holds a saved place refused on the free plan instead of counting it as failed", () => {
    expect(
      parkedItemAction(
        parked({
          entityType: "saved_location",
          lastError: "Free accounts are limited to 2 saved locations. Upgrade to Pro for unlimited.",
          payload: { name: "Depot" },
        })
      )
    ).toBe("hold");
  });

  it("drops an edit of a row the phone no longer has, retries the rest", () => {
    expect(parkedItemAction(parked({ action: "update", localRowExists: false }))).toBe("drop");
    expect(parkedItemAction(parked({ action: "update", localRowExists: true, localRowSynced: true }))).toBe(
      "revive"
    );
    expect(parkedItemAction(parked({ action: "delete", localRowExists: false }))).toBe("revive");
  });
});

describe("isTripCreateBody", () => {
  it("needs a start time and a start point", () => {
    expect(isTripCreateBody({ startedAt: "x", startLat: 1, startLng: 2 })).toBe(true);
    expect(isTripCreateBody({ id: "a", classification: "business" })).toBe(false);
    expect(isTripCreateBody({ startedAt: "x", startLat: null, startLng: 2 })).toBe(false);
    expect(isTripCreateBody(null)).toBe(false);
  });
});

const row = (o: Partial<LocalTripRow> = {}): LocalTripRow => ({
  id: "local-1",
  shift_id: null,
  vehicle_id: "veh-1",
  start_lat: 51.5,
  start_lng: -0.1,
  end_lat: 51.6,
  end_lng: -0.2,
  start_address: "A",
  end_address: null,
  distance_miles: 12.3,
  started_at: "2026-09-27T13:00:00.000Z",
  ended_at: "2026-09-27T13:40:00.000Z",
  classification: "business",
  platform_tag: null,
  category: null,
  business_purpose: null,
  notes: null,
  ...o,
});

describe("tripCreateBodyFromRow", () => {
  it("builds a body POST /trips accepts, with the breadcrumbs the phone holds", () => {
    const body = tripCreateBodyFromRow(row(), [
      { lat: 51.5, lng: -0.1, speed: 10, accuracy: 5, recorded_at: "2026-09-27T13:00:00.000Z" },
    ]);
    expect(isTripCreateBody(body)).toBe(true);
    expect(body.distanceMiles).toBe(12.3);
    expect(body.endAddress).toBeUndefined();
    expect(body.coordinates).toEqual([
      { lat: 51.5, lng: -0.1, speed: 10, accuracy: 5, recordedAt: "2026-09-27T13:00:00.000Z" },
    ]);
  });

  it("never sends a local lock id as the shift", () => {
    expect(tripCreateBodyFromRow(row({ shift_id: "__quick_trip__" }), []).shiftId).toBeUndefined();
    expect(tripCreateBodyFromRow(row({ shift_id: "__arrived_pending__" }), []).shiftId).toBeUndefined();
    expect(tripCreateBodyFromRow(row({ shift_id: "5c153676-0000-4000-8000-000000000000" }), []).shiftId).toBe(
      "5c153676-0000-4000-8000-000000000000"
    );
    expect(isPseudoShiftId("__quick_trip__")).toBe(true);
    expect(isPseudoShiftId(null)).toBe(false);
  });

  it("strips the phone's own UI markers from notes", () => {
    expect(tripCreateBodyFromRow(row({ notes: "__unconfirmed__|x" }), []).notes).toBeUndefined();
    expect(tripCreateBodyFromRow(row({ notes: "Parcel run" }), []).notes).toBe("Parcel run");
  });
});
