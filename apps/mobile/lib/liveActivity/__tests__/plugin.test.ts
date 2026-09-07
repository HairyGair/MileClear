import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The config plugin copies every file in native/ into the iOS project, but adds
// them to the Xcode target from a hand-written list. A file that is copied and
// not listed compiles nowhere and fails silently at runtime — which for the
// push-to-start token bootstrap would mean no token, no Live Activity, and no
// error anywhere. Keep the two in step.

const PLUGIN_DIR = join(__dirname, "..", "..", "..", "plugins", "with-live-activities");

describe("with-live-activities plugin", () => {
  const indexJs = readFileSync(join(PLUGIN_DIR, "index.js"), "utf8");

  it("adds every native source file to the Xcode target", () => {
    const copied = readdirSync(join(PLUGIN_DIR, "native")).filter(
      (f) => f.endsWith(".swift") || f.endsWith(".m")
    );
    expect(copied.length).toBeGreaterThan(0);
    for (const file of copied) {
      expect(indexJs, `${file} is copied but never added to the Xcode target`).toContain(
        `name: "${file}"`
      );
    }
  });

  it("attaches the push-to-start token listener at launch, not on first use", () => {
    const bridge = readFileSync(join(PLUGIN_DIR, "native", "LiveActivityBridge.m"), "utf8");
    expect(bridge).toContain("UIApplicationDidFinishLaunchingNotification");
    expect(bridge).toContain("LiveActivityTokenBootstrap");
  });

  it("keeps the Objective-C runtime name the bridge looks up", () => {
    const bootstrap = readFileSync(
      join(PLUGIN_DIR, "native", "LiveActivityTokenBootstrap.swift"),
      "utf8"
    );
    expect(bootstrap).toContain("@objc(LiveActivityTokenBootstrap)");
    expect(bootstrap).toContain("@objc public static func start()");
  });
});
