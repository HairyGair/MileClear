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
  it("sends a typed correction, to 2 decimal places", () => {
    expect(editedDistanceToSend({ typed: true, text: "48", loadedMiles: 84 })).toBe(48);
    expect(editedDistanceToSend({ typed: true, text: "12.345", loadedMiles: null })).toBe(12.35);
    expect(editedDistanceToSend({ typed: true, text: "48,25", loadedMiles: 84 })).toBe(48.25);
  });

  it("sends nothing for a routed figure: a pin moved with the box open, nothing typed", () => {
    // The route put 15.2 on screen; the box still holds the prefill.
    expect(editedDistanceToSend({ typed: false, text: "30", loadedMiles: 30 })).toBeUndefined();
    expect(editedDistanceToSend({ typed: false, text: "", loadedMiles: 30 })).toBeUndefined();
  });

  it("sends nothing for the prefill left as it was, or the same figure typed again", () => {
    expect(editedDistanceToSend({ typed: true, text: "30.456", loadedMiles: 30.456 })).toBeUndefined();
    expect(editedDistanceToSend({ typed: true, text: "30.5", loadedMiles: 30.456 })).toBeUndefined();
  });

  it("sends nothing for a box that isn't a number", () => {
    expect(editedDistanceToSend({ typed: true, text: "", loadedMiles: 84 })).toBeUndefined();
    expect(editedDistanceToSend({ typed: true, text: "0", loadedMiles: 84 })).toBeUndefined();
    expect(editedDistanceToSend({ typed: true, text: "lots", loadedMiles: 84 })).toBeUndefined();
  });
});
