/**
 * Activation blocker classification.
 *
 * The one piece of judgement in the day 1 / 3 / 7 activation nudges: which
 * single thing stands between a zero-trip account and a recorded drive. Pure
 * function, no mocks.
 */
import { describe, it, expect } from "vitest";

import {
  classifyActivationBlocker,
  effectiveBgPermission,
  type ActivationBlockerInput,
} from "../../jobs/activationBlocker.js";

const HB = new Date("2026-09-07T10:00:00Z");

function user(over: Partial<ActivationBlockerInput> = {}): ActivationBlockerInput {
  return {
    tripCount: 0,
    lastHeartbeatAt: null,
    signupPlatform: null,
    platformsSeen: null,
    bgLocationPermission: null,
    pushToken: null,
    dump: null,
    ...over,
  };
}

describe("classifyActivationBlocker", () => {
  it("is none once they have a trip, whatever else is true", () => {
    expect(classifyActivationBlocker(user({ tripCount: 1 }))).toBe("none");
    expect(classifyActivationBlocker(user({ tripCount: 3, signupPlatform: "web" }))).toBe("none");
  });

  describe("web_only", () => {
    it("web signup that the app has never phoned home for", () => {
      expect(classifyActivationBlocker(user({ signupPlatform: "web" }))).toBe("web_only");
    });

    it("unknown signup platform with no mobile platform ever seen", () => {
      expect(classifyActivationBlocker(user({ platformsSeen: "web" }))).toBe("web_only");
      expect(classifyActivationBlocker(user({ platformsSeen: null }))).toBe("web_only");
    });

    it("is not web_only once any mobile platform has been seen", () => {
      expect(classifyActivationBlocker(user({ platformsSeen: "web,ios" }))).not.toBe("web_only");
      expect(classifyActivationBlocker(user({ platformsSeen: "android" }))).not.toBe("web_only");
    });

    it("a heartbeat, a push token or a dump each prove an install", () => {
      const web = { signupPlatform: "web" };
      expect(classifyActivationBlocker(user({ ...web, lastHeartbeatAt: HB }))).not.toBe("web_only");
      expect(classifyActivationBlocker(user({ ...web, pushToken: "ExponentPushToken[x]" }))).not.toBe("web_only");
      expect(
        classifyActivationBlocker(user({ ...web, dump: { capturedAt: HB, backgroundPermission: "granted" } }))
      ).not.toBe("web_only");
    });
  });

  describe("no_permission", () => {
    it("installed with no background permission reading at all", () => {
      expect(classifyActivationBlocker(user({ lastHeartbeatAt: HB }))).toBe("no_permission");
    });

    it("installed and the heartbeat says anything but granted", () => {
      for (const reading of ["denied", "undetermined", "foreground", "none"]) {
        expect(classifyActivationBlocker(user({ lastHeartbeatAt: HB, bgLocationPermission: reading }))).toBe(
          "no_permission"
        );
      }
    });

    it("mobile signup with no heartbeat yet is treated as installed without permission", () => {
      expect(classifyActivationBlocker(user({ signupPlatform: "ios", platformsSeen: "ios" }))).toBe("no_permission");
    });
  });

  describe("no_drive_yet", () => {
    it("installed, granted, nothing recorded", () => {
      expect(classifyActivationBlocker(user({ lastHeartbeatAt: HB, bgLocationPermission: "granted" }))).toBe(
        "no_drive_yet"
      );
    });

    it("a dump newer than the heartbeat overrides a stale not-granted reading", () => {
      const later = new Date(HB.getTime() + 60 * 60 * 1000);
      expect(
        classifyActivationBlocker(
          user({
            lastHeartbeatAt: HB,
            bgLocationPermission: "undetermined",
            dump: { capturedAt: later, backgroundPermission: "granted" },
          })
        )
      ).toBe("no_drive_yet");
    });

    it("a dump older than the heartbeat does not override it", () => {
      const earlier = new Date(HB.getTime() - 60 * 60 * 1000);
      expect(
        classifyActivationBlocker(
          user({
            lastHeartbeatAt: HB,
            bgLocationPermission: "undetermined",
            dump: { capturedAt: earlier, backgroundPermission: "granted" },
          })
        )
      ).toBe("no_permission");
    });
  });
});

describe("effectiveBgPermission", () => {
  it("falls back to the column when the dump carries a non-string reading", () => {
    const later = new Date(HB.getTime() + 1000);
    expect(
      effectiveBgPermission(
        user({ lastHeartbeatAt: HB, bgLocationPermission: "granted", dump: { capturedAt: later, backgroundPermission: 42 } })
      )
    ).toBeNull();
    expect(effectiveBgPermission(user({ lastHeartbeatAt: HB, bgLocationPermission: "granted" }))).toBe("granted");
  });
});
