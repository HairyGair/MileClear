import { describe, expect, it } from "vitest";
import { recordedByForForm, recordedByForTrail } from "../recordedBy";

describe("recordedBy", () => {
  it("a Start Trip trail, live or kept after I've Arrived, is start_trip", () => {
    expect(recordedByForTrail("__quick_trip__")).toBe("start_trip");
    expect(recordedByForTrail("__arrived_pending__")).toBe("start_trip");
  });

  it("a real shift's trail is shift", () => {
    expect(recordedByForTrail("0b5c6c55-6d43-4bd2-9a8e-1c0e5f3b2a11")).toBe("shift");
  });

  it("the trip form: the past-trip form is added by hand, the rest is Start Trip", () => {
    expect(recordedByForForm("manual")).toBe("added_by_hand");
    expect(recordedByForForm("arrived")).toBe("start_trip");
    expect(recordedByForForm("driving")).toBe("start_trip");
  });
});
