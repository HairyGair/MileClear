// PLAN.md F6: main's JS reaches 7 older runtimes by OTA, none of which has
// nav-voice, expo-speech or react-native-svg compiled in. With the native
// modules missing nothing may crash, the voice must be a no-op, and no
// entry point may show.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("expo-modules-core", () => ({
  requireNativeModule: (name: string) => {
    throw new Error(`Cannot find native module '${name}'`);
  },
  NativeModule: class {},
}));

import * as navVoice from "../../../modules/nav-voice";
import { directionsAvailable, loadOptional } from "../optionalNative";
import { createVoice } from "../voice";

describe("nav-voice missing (any binary before 1.4.0)", () => {
  it("loads, reports absent, and every call is a harmless no-op", async () => {
    expect(navVoice.isNavVoiceAvailable()).toBe(false);
    expect(navVoice.isCallActive()).toBe(false);
    await expect(navVoice.beginPrompt()).resolves.toBe(true);
    await expect(navVoice.endPrompt()).resolves.toBeUndefined();
    const off = navVoice.addInterruptionListener(() => {});
    expect(() => off()).not.toThrow();
  });

  it("so the entry gate stays shut, even for an enabled driver", () => {
    expect(directionsAvailable({ navigationEnabled: true, navVoicePresent: navVoice.isNavVoiceAvailable() })).toBe(false);
    expect(directionsAvailable({ navigationEnabled: true, navVoicePresent: true })).toBe(true);
    expect(directionsAvailable({ navigationEnabled: false, navVoicePresent: true })).toBe(false);
    expect(directionsAvailable({ navigationEnabled: undefined, navVoicePresent: true })).toBe(false);
  });
});

describe("optional native loads", () => {
  it("a loader that throws (module missing) gives null, never an exception", () => {
    expect(
      loadOptional(() => {
        throw new Error("Cannot find native module 'ExpoSpeech'");
      })
    ).toBeNull();
    expect(loadOptional(() => undefined)).toBeNull();
    expect(loadOptional(() => ({ ok: 1 }))).toEqual({ ok: 1 });
  });

  it("the voice with no speech and no nav-voice is silent and never throws", async () => {
    const v = createVoice({ speech: null, nav: null });
    expect(v.available).toBe(false);
    await expect(v.say({ text: "Turn right now", urgent: true })).resolves.toBe(false);
    expect(() => v.hush()).not.toThrow();
    expect(() => v.setMuted(true)).not.toThrow();
  });

  it("no Directions file imports a native module directly at the top level", () => {
    const root = join(__dirname, "..", "..", "..");
    const files = [
      "lib/navigation/voice.ts",
      "lib/navigation/useGuidance.ts",
      "components/directions/Glyph.tsx",
      "app/navigate.tsx",
      "components/directions/DirectionsEntry.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(join(root, f), "utf8");
      for (const mod of ["expo-speech", "react-native-svg", "expo-keep-awake", "modules/nav-voice"]) {
        expect(src, `${f} must not statically import ${mod}`).not.toMatch(new RegExp(`^import[^;]*["'][^"']*${mod.replace("/", "\\/")}["']`, "m"));
      }
    }
  });
});
