import { describe, it, expect } from "vitest";
import { resolveMissingTarget } from "../missingTargetRule";

describe("resolveMissingTarget", () => {
  it("drops a delete whose target is already gone", () => {
    expect(resolveMissingTarget({ action: "delete", localRowExists: true })).toBe("drop");
    expect(resolveMissingTarget({ action: "delete", localRowExists: false })).toBe("drop");
  });

  it("drops an edit when the phone has no such trip either", () => {
    expect(resolveMissingTarget({ action: "update", localRowExists: false })).toBe("drop");
    expect(resolveMissingTarget({ action: "update", localRowExists: false, localRowSynced: true })).toBe("drop");
  });

  it("drops the edit AND the stale copy of a trip the server removed after it synced", () => {
    // Re-creating it would bring back a trip that was merged, split, deleted
    // on the web or cleared as a duplicate.
    expect(resolveMissingTarget({ action: "update", localRowExists: true, localRowSynced: true })).toBe(
      "drop_local"
    );
  });

  it("keeps the edit of a never-synced trip waiting for its create, never dropping the miles", () => {
    expect(resolveMissingTarget({ action: "update", localRowExists: true, localRowSynced: false })).toBe(
      "await_create"
    );
    // Unknown sync state is treated as never synced: deferring is safe,
    // deleting is not.
    expect(resolveMissingTarget({ action: "update", localRowExists: true })).toBe("await_create");
  });

  it("leaves creates to the existing paths", () => {
    expect(resolveMissingTarget({ action: "create", localRowExists: true })).toBeNull();
    expect(resolveMissingTarget({ action: "create", localRowExists: false })).toBeNull();
  });
});
