import { describe, expect, it } from "vitest";
import { showsStartShift } from "../persona";

describe("showsStartShift", () => {
  it("shows for gig and Both drivers with no shift history", () => {
    expect(showsStartShift("gig")).toBe(true);
    expect(showsStartShift("both")).toBe(true);
  });

  it("hides for employer and company-car drivers who never used shifts", () => {
    expect(showsStartShift("employee")).toBe(false);
    expect(showsStartShift("company", 0)).toBe(false);
  });

  it("keeps the button for any work driver who has used shifts", () => {
    expect(showsStartShift("employee", 55)).toBe(true);
    expect(showsStartShift("company", 1)).toBe(true);
  });

  it("never shows in Personal", () => {
    expect(showsStartShift("personal", 55)).toBe(false);
  });
});
