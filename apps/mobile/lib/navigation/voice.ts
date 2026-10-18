// Spoken directions: expo-speech says the words in British English; the
// nav-voice module (modules/nav-voice) wraps each prompt in an audio session
// that ducks music, pauses podcasts, ignores the silent switch (iOS) and
// takes transient may-duck focus (Android), then releases it.
//
// One prompt at a time (voiceGate.ts): a "now" prompt cuts in, anything else
// that arrives while speaking is dropped, never queued. No prompt on a call.
//
// Both native pieces load lazily (optionalNative.ts): on a binary without
// them every call here is a silent no-op, never a crash. createVoice() takes
// them as arguments so tests can run with them missing.

import { gate, type GateState } from "./voiceGate";
import { loadOptional } from "./optionalNative";

export interface SpeechLike {
  speak: (text: string, options?: Record<string, unknown>) => void;
  stop: () => Promise<void>;
  getAvailableVoicesAsync?: () => Promise<Array<{ identifier: string; language: string; quality?: string }>>;
}

export interface NavVoiceLike {
  isNavVoiceAvailable: () => boolean;
  isCallActive: () => boolean;
  beginPrompt: () => Promise<boolean>;
  endPrompt: () => Promise<void>;
  startGuidance?: () => Promise<void>;
  endGuidance?: () => Promise<void>;
}

/** A prompt that never reports done is released after this. */
const STUCK_MS = 10_000;

export interface Voice {
  /** Both native pieces are present. */
  available: boolean;
  say: (prompt: { text: string; urgent: boolean }) => Promise<boolean>;
  /** Would a prompt be spoken right now? (The announcer only marks a prompt
   *  said when it was: a dropped one is tried again on the next fix.) */
  canSpeak: (prompt: { urgent: boolean }) => boolean;
  /** Why a prompt would not be spoken now, or null if it would. */
  dropReason: (prompt: { urgent: boolean }) => "muted" | "call" | "busy" | "unavailable" | null;
  /** Guidance starts: nav-voice sets the audio category once (iOS). */
  startGuidance: () => void;
  /** Guidance ends: stop speaking (unless hush is false) and put the
   *  audio category back as it was. */
  endGuidance: (o?: { hush?: boolean }) => void;
  hush: () => void;
  setMuted: (m: boolean) => void;
  /** iPhone: an Enhanced en-GB voice when installed; Android: false when the
   *  phone has no UK English voice at all (the screen says so once). */
  hasUkVoice: () => Promise<boolean>;
}

export function createVoice(deps: {
  speech: SpeechLike | null;
  nav: NavVoiceLike | null;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}): Voice {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const speech = deps.speech;
  const nav = deps.nav && deps.nav.isNavVoiceAvailable() ? deps.nav : null;
  const state: GateState = { speaking: false, lastStartAtMs: null };
  let muted = false;
  let token = 0;
  let stuck: unknown = null;
  let voiceId: string | null | undefined;

  async function pickVoice(): Promise<string | null> {
    if (voiceId !== undefined) return voiceId;
    voiceId = null;
    try {
      const voices = (await speech?.getAvailableVoicesAsync?.()) ?? [];
      const gb = voices.filter((v) => v.language?.toLowerCase().replace("_", "-") === "en-gb");
      const best = gb.find((v) => v.quality === "Enhanced") ?? null;
      voiceId = best?.identifier ?? null;
    } catch {
      voiceId = null;
    }
    return voiceId;
  }

  function finish(t: number) {
    if (t !== token) return; // a newer prompt took over
    state.speaking = false;
    if (stuck) clearTimer(stuck);
    stuck = null;
    void nav?.endPrompt();
  }

  async function say(prompt: { text: string; urgent: boolean }): Promise<boolean> {
    if (!speech || !prompt.text) return false;
    const inCall = (() => {
      try {
        return nav?.isCallActive() ?? false;
      } catch {
        return false;
      }
    })();
    const decision = gate(state, prompt, { muted, inCall, nowMs: now() });
    if (decision === "drop") return false;
    const t = ++token;
    state.speaking = true;
    state.lastStartAtMs = now();
    try {
      if (decision === "interrupt") await speech.stop().catch(() => {});
      else if (nav && !(await nav.beginPrompt())) {
        // A call, or the session would not start: say nothing.
        if (t === token) state.speaking = false;
        return false;
      }
      if (t !== token) return false;
      const voice = await pickVoice();
      speech.speak(prompt.text, {
        language: "en-GB",
        rate: 1.0,
        pitch: 1.0,
        ...(voice ? { voice } : {}),
        onDone: () => finish(t),
        onStopped: () => finish(t),
        onError: () => finish(t),
      });
      if (stuck) clearTimer(stuck);
      stuck = setTimer(() => finish(t), STUCK_MS);
      return true;
    } catch {
      finish(t);
      return false;
    }
  }

  function hush() {
    token++;
    state.speaking = false;
    if (stuck) clearTimer(stuck);
    stuck = null;
    speech?.stop().catch(() => {});
    void nav?.endPrompt();
  }

  function inCallNow(): boolean {
    try {
      return nav?.isCallActive() ?? false;
    } catch {
      return false;
    }
  }

  return {
    available: !!speech && !!nav,
    say,
    canSpeak: (prompt) => !!speech && gate(state, prompt, { muted, inCall: inCallNow(), nowMs: now() }) !== "drop",
    dropReason: (prompt) => {
      if (!speech) return "unavailable";
      if (muted) return "muted";
      if (inCallNow()) return "call";
      return gate(state, prompt, { muted: false, inCall: false, nowMs: now() }) === "drop" ? "busy" : null;
    },
    startGuidance: () => void nav?.startGuidance?.().catch(() => {}),
    endGuidance: (o = {}) => {
      if (o.hush !== false) hush();
      void nav?.endGuidance?.().catch(() => {});
    },
    hush,
    setMuted: (m) => {
      muted = m;
      if (m) hush();
    },
    hasUkVoice: async () => {
      try {
        const voices = (await speech?.getAvailableVoicesAsync?.()) ?? [];
        return voices.some((v) => v.language?.toLowerCase().replace("_", "-") === "en-gb");
      } catch {
        return true;
      }
    },
  };
}

let shared: Voice | null = null;

/** The app's voice, built on first use with whatever this binary has. */
export function getVoice(): Voice {
  if (shared) return shared;
  shared = createVoice({
    speech: loadOptional(() => require("expo-speech") as SpeechLike),
    nav: loadOptional(() => require("../../modules/nav-voice") as NavVoiceLike),
  });
  return shared;
}

/** Whether this binary has the native voice module (part of the entry gate). */
export function navVoicePresent(): boolean {
  const nav = loadOptional(() => require("../../modules/nav-voice") as NavVoiceLike);
  try {
    return !!nav && nav.isNavVoiceAvailable();
  } catch {
    return false;
  }
}
