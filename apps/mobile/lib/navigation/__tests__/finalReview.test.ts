// Final review findings before the 1.4.0 build, 19 Oct 2026.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createVoice, type NavVoiceLike, type SpeechLike } from "../voice";
import { screenGate } from "../rules";

const root = join(__dirname, "..", "..", "..");

function fakes() {
  const log: string[] = [];
  let pending: Record<string, () => void> | null = null;
  const speech: SpeechLike = {
    speak: (text, o) => {
      log.push(`speak:${text}`);
      pending = o as Record<string, () => void>;
    },
    stop: () =>
      new Promise<void>((resolve) => {
        // The synthesizer takes a moment to stop.
        setTimeout(() => {
          log.push("stopped");
          const p = pending;
          pending = null;
          p?.onStopped?.();
          resolve();
        }, 5);
      }),
  };
  const nav: NavVoiceLike = {
    isNavVoiceAvailable: () => true,
    isCallActive: () => false,
    beginPrompt: async () => {
      log.push("begin");
      return true;
    },
    endPrompt: async () => {
      log.push("endPrompt");
    },
    startGuidance: async () => {
      log.push("startGuidance");
    },
    endGuidance: async () => {
      log.push("endGuidance");
    },
  };
  return { voice: createVoice({ speech, nav, setTimer: () => 0, clearTimer: () => {} }), log };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe("End while a prompt is speaking hands the audio back (MAJOR)", () => {
  it("speech stops first, then the session is released, then the category goes back", async () => {
    const f = fakes();
    f.voice.startGuidance();
    await f.voice.say({ text: "In 300 yards, turn left", urgent: false });
    f.voice.endGuidance();
    await settle();
    const tail = f.log.slice(f.log.indexOf("speak:In 300 yards, turn left") + 1);
    expect(tail).toEqual(["stopped", "endPrompt", "endGuidance"]);
  });

  it("mute (hush) takes the same path: stop, then release", async () => {
    const f = fakes();
    await f.voice.say({ text: "Turn left now", urgent: true });
    f.voice.setMuted(true);
    await settle();
    const tail = f.log.slice(f.log.indexOf("speak:Turn left now") + 1);
    expect(tail).toEqual(["stopped", "endPrompt"]);
  });

  it("the native end only restores the category after deactivating succeeds, retrying while busy", () => {
    const swift = readFileSync(join(root, "modules", "nav-voice", "ios", "NavVoiceModule.swift"), "utf8");
    const restore = swift.slice(swift.indexOf("private func attemptRestore"));
    // setCategory back is inside the success branch of the deactivate callback.
    const ok = restore.indexOf("if ok {");
    const set = restore.indexOf("setCategory(category, mode: mode, options: options)");
    expect(ok).toBeGreaterThan(0);
    expect(set).toBeGreaterThan(ok);
    expect(swift).toMatch(/asyncAfter\(deadline: \.now\(\) \+ 0\.3\)/);
    expect(swift).toMatch(/attemptRestore\(attempts: 10\)/);
    expect(swift).toContain("restorePending");
  });

  it("a stale retry stops once a newer prompt began; a failed End is retried later", () => {
    const swift = readFileSync(join(root, "modules", "nav-voice", "ios", "NavVoiceModule.swift"), "utf8");
    const begin = swift.slice(swift.indexOf('AsyncFunction("beginPrompt")'));
    expect(begin.slice(0, begin.indexOf("}.runOnQueue"))).toContain("self.promptGeneration += 1");
    const deact = swift.slice(swift.indexOf("private func deactivate(attempts: Int, prompt: Int"));
    expect(deact).toMatch(/guard prompt == promptGeneration else \{\s*done\(false\)/);
    // The weak-self path still finishes (resolves the JS promise).
    expect(deact).toMatch(/guard let self = self else \{\s*done\(false\)/);
    // One last try 2 s later, then on the next foreground; a new guidance clears it.
    expect(swift).toMatch(/asyncAfter\(deadline: \.now\(\) \+ 2\.0\)/);
    expect(swift).toContain("UIApplication.didBecomeActiveNotification");
    const prepare = swift.slice(swift.indexOf("private func prepare"));
    expect(prepare.slice(0, prepare.indexOf("do {"))).toContain("removeForegroundObserver()");
    // No more fire-and-forget deactivation followed by a category switch.
    expect(swift).not.toMatch(/try\? session\.setActive\(false[^\n]*\n\s*if let \(category/);
  });

  it("Android releases focus only after speech has stopped (same JS order)", () => {
    const kt = readFileSync(
      join(root, "modules", "nav-voice", "android", "src", "main", "java", "expo", "modules", "navvoice", "NavVoiceModule.kt"),
      "utf8"
    );
    expect(kt).toContain("abandonAudioFocusRequest");
  });
});

describe("the arrival audio timer (MINOR)", () => {
  const hook = readFileSync(join(root, "lib", "navigation", "useGuidance.ts"), "utf8");
  it("is kept in a ref and cleared when guidance starts again and on unmount", () => {
    expect(hook).toMatch(/arrivalEndTimer\.current = setTimeout\(/);
    const start = hook.slice(hook.indexOf("const start = useCallback"));
    expect(start.slice(0, start.indexOf("voice.startGuidance()"))).toContain("clearArrivalEnd()");
    const unmount = hook.slice(hook.indexOf("const off = subscribeToFixes"));
    expect(unmount.slice(0, unmount.indexOf("voice.endGuidance()"))).toContain("clearArrivalEnd()");
    expect(hook).not.toMatch(/\n\s*setTimeout\(\(\) => voice\.endGuidance/);
  });
});

describe("the screen gate (MINOR)", () => {
  it("shows nothing until the profile is in, so an old binary never starts the picker", () => {
    expect(screenGate({ userLoaded: false, available: false, phase: "pick" })).toBe("loading");
    expect(screenGate({ userLoaded: false, available: true, phase: "pick" })).toBe("loading");
    expect(screenGate({ userLoaded: true, available: false, phase: "pick" })).toBe("unavailable");
    expect(screenGate({ userLoaded: true, available: false, phase: "preview" })).toBe("unavailable");
    expect(screenGate({ userLoaded: true, available: true, phase: "pick" })).toBe("open");
  });
  it("never stops guidance or arrival under way", () => {
    expect(screenGate({ userLoaded: true, available: false, phase: "guiding" })).toBe("open");
    expect(screenGate({ userLoaded: false, available: false, phase: "arrived" })).toBe("open");
  });
  it("the screen uses it, and opens a deep-linked place only once available", () => {
    const screen = readFileSync(join(root, "app", "navigate.tsx"), "utf8");
    expect(screen).toContain("screenGate({ userLoaded: !!user, available, phase: g.phase })");
    const effect = screen.slice(screen.indexOf("const opened = useRef(false);"));
    expect(effect.slice(0, effect.indexOf("g.planTo("))).toContain("if (!available || opened.current) return;");
  });
});
