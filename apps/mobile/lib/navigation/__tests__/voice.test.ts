import { describe, it, expect } from "vitest";
import { createVoice, type NavVoiceLike, type SpeechLike } from "../voice";
import { gate, MIN_GAP_MS } from "../voiceGate";

function fakes(opts: { call?: boolean; grant?: boolean } = {}) {
  const log: string[] = [];
  let pending: Record<string, () => void> | null = null;
  const speech: SpeechLike = {
    speak: (text, o) => {
      log.push(`speak:${text}:${(o as { language?: string }).language}`);
      pending = o as Record<string, () => void>;
    },
    stop: async () => {
      log.push("stop");
      const p = pending;
      pending = null;
      p?.onStopped?.();
    },
    getAvailableVoicesAsync: async () => [{ identifier: "gb-enh", language: "en-GB", quality: "Enhanced" }],
  };
  const nav: NavVoiceLike = {
    isNavVoiceAvailable: () => true,
    isCallActive: () => !!opts.call,
    beginPrompt: async () => {
      log.push("begin");
      return opts.grant ?? true;
    },
    endPrompt: async () => {
      log.push("end");
    },
  };
  let t = 0;
  const voice = createVoice({ speech, nav, now: () => t, setTimer: () => 0, clearTimer: () => {} });
  return {
    voice,
    log,
    done: () => {
      const p = pending;
      pending = null;
      p?.onDone?.();
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("one prompt at a time (DESIGN 3.1)", () => {
  it("gate", () => {
    const idle = { speaking: false, lastStartAtMs: null };
    expect(gate(idle, { urgent: false }, { muted: false, inCall: false, nowMs: 0 })).toBe("speak");
    expect(gate(idle, { urgent: true }, { muted: true, inCall: false, nowMs: 0 })).toBe("drop");
    expect(gate(idle, { urgent: true }, { muted: false, inCall: true, nowMs: 0 })).toBe("drop");
    const busy = { speaking: true, lastStartAtMs: 0 };
    expect(gate(busy, { urgent: false }, { muted: false, inCall: false, nowMs: 100 })).toBe("drop");
    expect(gate(busy, { urgent: true }, { muted: false, inCall: false, nowMs: 100 })).toBe("interrupt");
    const recent = { speaking: false, lastStartAtMs: 0 };
    expect(gate(recent, { urgent: false }, { muted: false, inCall: false, nowMs: MIN_GAP_MS - 1 })).toBe("drop");
    expect(gate(recent, { urgent: true }, { muted: false, inCall: false, nowMs: 1 })).toBe("speak");
  });
});

describe("the voice", () => {
  it("ducks for the prompt, speaks British English with the Enhanced voice, then releases", async () => {
    const f = fakes();
    expect(f.voice.available).toBe(true);
    await expect(f.voice.say({ text: "In 300 yards, turn left", urgent: false })).resolves.toBe(true);
    expect(f.log).toEqual(["begin", "speak:In 300 yards, turn left:en-GB"]);
    f.done();
    expect(f.log.at(-1)).toBe("end");
  });

  it("no prompt during a call, and none if the audio session is refused", async () => {
    const call = fakes({ call: true });
    await expect(call.voice.say({ text: "Turn right now", urgent: true })).resolves.toBe(false);
    expect(call.log).toEqual([]);
    const refused = fakes({ grant: false });
    await expect(refused.voice.say({ text: "Turn right now", urgent: true })).resolves.toBe(false);
    expect(refused.log).toEqual(["begin"]);
  });

  it("a 'now' prompt cuts in; anything else waits its turn and is dropped, never queued", async () => {
    const f = fakes();
    await f.voice.say({ text: "In half a mile, turn left", urgent: false });
    f.advance(1000);
    await expect(f.voice.say({ text: "Follow the road", urgent: false })).resolves.toBe(false);
    await expect(f.voice.say({ text: "Turn left now", urgent: true })).resolves.toBe(true);
    expect(f.log).toEqual(["begin", "speak:In half a mile, turn left:en-GB", "stop", "speak:Turn left now:en-GB"]);
    // The interrupted prompt's stop does not release the session under the new one.
    expect(f.log.filter((l) => l === "end").length).toBe(0);
    f.done();
    expect(f.log.at(-1)).toBe("end");
  });

  it("muted means muted", async () => {
    const f = fakes();
    f.voice.setMuted(true);
    await expect(f.voice.say({ text: "You have arrived", urgent: true })).resolves.toBe(false);
    expect(f.log.some((l) => l.startsWith("speak"))).toBe(false);
  });
});
