import { describe, it, expect } from "vitest";
import { resolveMissingTarget } from "../missingTargetRule";

describe("resolveMissingTarget", () => {
  it("drops a delete whose target is already gone", () => {
    expect(resolveMissingTarget({ action: "delete", localRowExists: true })).toBe("drop");
    expect(resolveMissingTarget({ action: "delete", localRowExists: false })).toBe("drop");
  });

  it("drops an edit when the phone has no such trip either", () => {
    expect(resolveMissingTarget({ action: "update", localRowExists: false })).toBe("drop");
  });

  it("re-creates a trip the phone still holds rather than losing it", () => {
    expect(resolveMissingTarget({ action: "update", localRowExists: true })).toBe("recreate");
  });

  it("leaves creates to the existing paths", () => {
    expect(resolveMissingTarget({ action: "create", localRowExists: true })).toBeNull();
    expect(resolveMissingTarget({ action: "create", localRowExists: false })).toBeNull();
  });
});
