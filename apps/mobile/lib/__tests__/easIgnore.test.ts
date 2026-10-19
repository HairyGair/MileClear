// EAS Build uploads the repo filtered by the root .easignore (and ignores
// .gitignore entirely when .easignore exists). Its bare `ios/` and `android/`
// patterns would strip modules/nav-voice's native code, so Directions would
// never show in a store build (R3, 18 Oct 2026). Same `ignore` package and
// the same check eas-cli's Ignore class makes.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ignore from "ignore";

const root = join(__dirname, "..", "..", "..", "..");
const ig = ignore().add(".git\nnode_modules\n").add(readFileSync(join(root, ".easignore"), "utf8"));

describe(".easignore", () => {
  it.each([
    "apps/mobile/modules/nav-voice/ios/",
    "apps/mobile/modules/nav-voice/ios/NavVoiceModule.swift",
    "apps/mobile/modules/nav-voice/ios/NavVoice.podspec",
    "apps/mobile/modules/nav-voice/android/",
    "apps/mobile/modules/nav-voice/android/build.gradle",
    "apps/mobile/modules/nav-voice/android/src/main/java/expo/modules/navvoice/NavVoiceModule.kt",
    "apps/mobile/modules/nav-voice/index.ts",
  ])("ships %s", (p) => expect(ig.ignores(p)).toBe(false));

  it.each([
    "apps/mobile/ios/",
    "apps/mobile/ios/Podfile",
    "apps/mobile/android/",
    "apps/mobile/android/app/build.gradle",
    // Not switched on here: shipping them is a separate decision.
    "apps/mobile/modules/car-audio/ios/CarAudioModule.swift",
    "apps/mobile/modules/visit-monitor/ios/VisitMonitorModule.swift",
  ])("still leaves out %s", (p) => expect(ig.ignores(p)).toBe(true));
});
