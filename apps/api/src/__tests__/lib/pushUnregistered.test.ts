import { describe, it, expect } from "vitest";
import { unregisteredTokens } from "../../lib/push.js";

describe("unregisteredTokens", () => {
  it("picks out only the tokens Expo says no longer reach an install", () => {
    const messages = [{ to: "ExponentPushToken[a]" }, { to: "ExponentPushToken[b]" }, { to: "ExponentPushToken[c]" }];
    const tickets = [
      { status: "ok" as const, id: "1" },
      { status: "error" as const, details: { error: "DeviceNotRegistered" } },
      { status: "error" as const, details: { error: "MessageRateExceeded" } },
    ];
    expect(unregisteredTokens(messages, tickets)).toEqual(["ExponentPushToken[b]"]);
    expect(unregisteredTokens(messages, [null, null, null])).toEqual([]);
  });
});
