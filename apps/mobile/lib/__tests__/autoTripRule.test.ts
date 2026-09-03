import { describe, it, expect } from "vitest";
import { decideAutoTripLiveActivity } from "../liveActivity/autoTripRule";

describe("decideAutoTripLiveActivity", () => {
  it("suppresses both the local start and the push when the in-app switch is off", () => {
    expect(decideAutoTripLiveActivity({ prefEnabled: false, localStarted: false })).toBe("suppressed_by_pref");
    // Even if something started locally, the preference wins.
    expect(decideAutoTripLiveActivity({ prefEnabled: false, localStarted: true })).toBe("suppressed_by_pref");
  });

  it("asks for a push only when the local start failed", () => {
    expect(decideAutoTripLiveActivity({ prefEnabled: true, localStarted: false })).toBe("push_requested");
  });

  it("does not push when a local start already shows the activity", () => {
    expect(decideAutoTripLiveActivity({ prefEnabled: true, localStarted: true })).toBe("local_started");
  });
});
