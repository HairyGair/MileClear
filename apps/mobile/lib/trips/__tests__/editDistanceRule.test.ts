import { describe, it, expect } from "vitest";
import { editedDistanceToSend, isTypedTotalForEdit } from "../editDistanceRule";

describe("isTypedTotalForEdit", () => {
  it("takes the server's word when it has one", () => {
    expect(isTypedTotalForEdit({ isTypedTotal: true, notes: null })).toBe(true);
    expect(isTypedTotalForEdit({ isTypedTotal: false, notes: "32 drops, total entered by you" })).toBe(false);
  });

  it("falls back to the note on a trip read from the phone", () => {
    expect(isTypedTotalForEdit({ notes: "32 drops, total entered by you" })).toBe(true);
    expect(isTypedTotalForEdit({ notes: "Shift total entered by you" })).toBe(true);
    expect(isTypedTotalForEdit({ notes: "Parcel run" })).toBe(false);
    expect(isTypedTotalForEdit({})).toBe(false);
  });
});

describe("editedDistanceToSend", () => {
  it("sends a typed correction", () => {
    expect(editedDistanceToSend({ typing: true, distanceMiles: 48, loadedMiles: 84 })).toBe(48);
    expect(editedDistanceToSend({ typing: true, distanceMiles: 12.345, loadedMiles: null })).toBe(12.35);
  });

  it("sends nothing when the driver did not type, or typed the same", () => {
    expect(editedDistanceToSend({ typing: false, distanceMiles: 48, loadedMiles: 84 })).toBeUndefined();
    expect(editedDistanceToSend({ typing: true, distanceMiles: 84, loadedMiles: 84 })).toBeUndefined();
    expect(editedDistanceToSend({ typing: true, distanceMiles: null, loadedMiles: 84 })).toBeUndefined();
    expect(editedDistanceToSend({ typing: true, distanceMiles: 0, loadedMiles: 84 })).toBeUndefined();
  });
});
