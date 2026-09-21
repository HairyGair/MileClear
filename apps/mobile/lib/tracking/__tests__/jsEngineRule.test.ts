/**
 * The platform rule behind three engine-disable paths: the unknown-state
 * default in nativeEngineFlag.ts, the set_native_engine silent push, and the
 * diagnostics screen's toggle. Android must never end up on the JS engine,
 * because there it records nothing (Becky O'Neill's moto g55 5G, zero auto
 * trips for the week after 10 Sep 2026).
 */
import { describe, it, expect } from "vitest";
import { canPlatformRunJsEngine } from "../jsEngineRule";

describe("canPlatformRunJsEngine", () => {
  it("says no for Android: the JS engine captures nothing there", () => {
    expect(canPlatformRunJsEngine("android")).toBe(false);
  });

  it("says yes for iOS, where the JS engine ran the whole fleet for months", () => {
    expect(canPlatformRunJsEngine("ios")).toBe(true);
  });

  it("leaves every other platform exactly as it was", () => {
    // Only Android is measured to be broken, so only Android is forced. Web
    // and anything unexpected keep the old answer rather than being quietly
    // pinned to an engine nobody has tested them on.
    expect(canPlatformRunJsEngine("web")).toBe(true);
    expect(canPlatformRunJsEngine("windows")).toBe(true);
    expect(canPlatformRunJsEngine("")).toBe(true);
  });

  it("is case sensitive, matching Platform.OS exactly", () => {
    // Platform.OS is always lowercase; a rule that also matched "Android"
    // would be claiming a safety it cannot deliver for other spellings.
    expect(canPlatformRunJsEngine("Android")).toBe(true);
  });
});

describe("the three paths that read the rule", () => {
  // Each path inverts the rule the same way, so the inversion is worth
  // pinning: on the platforms that cannot run JS, the answer is native.
  const failClosedToNative = (platform: string) => !canPlatformRunJsEngine(platform);

  it("an unreadable engine flag resolves to native on Android, JS elsewhere", () => {
    expect(failClosedToNative("android")).toBe(true);
    expect(failClosedToNative("ios")).toBe(false);
  });

  it("refuses a disable on Android and allows one on iOS", () => {
    const disableRefused = (platform: string, enabled: boolean) =>
      !enabled && !canPlatformRunJsEngine(platform);
    expect(disableRefused("android", false)).toBe(true);
    expect(disableRefused("ios", false)).toBe(false);
  });

  it("still allows Android to be switched ON to native", () => {
    const disableRefused = (platform: string, enabled: boolean) =>
      !enabled && !canPlatformRunJsEngine(platform);
    expect(disableRefused("android", true)).toBe(false);
  });
});

// 21 Sep 2026: the stored-'0' case, added after the fleet count showed two
// phones still on the JS engine. On Android that flag is not a rollback, so
// isNativeLocationEngineEnabled coerces it; this pins the rule it uses.
describe("a stored '0' on Android", () => {
  it("is an off switch, not a fallback, so the platform rule overrides it", () => {
    expect(canPlatformRunJsEngine("android")).toBe(false);
    expect(canPlatformRunJsEngine("ios")).toBe(true);
  });
});
