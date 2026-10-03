import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createPromptGate,
  isNewSession,
  pickWinner,
  NEW_SESSION_AFTER_BACKGROUND_MS,
  PROMPT_SETTLE_MS,
} from "../promptGate/rule";

function makeGate() {
  return createPromptGate({
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });
}

describe("pickWinner", () => {
  it("picks the highest-priority prompt", () => {
    expect(pickWinner(["rating", "saved_places", "work_explainer"])).toBe("work_explainer");
  });

  it("returns null when nothing is waiting", () => {
    expect(pickWinner([])).toBeNull();
  });
});

describe("isNewSession", () => {
  const T = 1_790_000_000_000;
  it("needs a background time", () => {
    expect(isNewSession(null, T)).toBe(false);
  });
  it("is a new session only after the threshold", () => {
    expect(isNewSession(T - NEW_SESSION_AFTER_BACKGROUND_MS + 1, T)).toBe(false);
    expect(isNewSession(T - NEW_SESSION_AFTER_BACKGROUND_MS, T)).toBe(true);
  });
});

describe("createPromptGate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("grants the location primer at once", async () => {
    const gate = makeGate();
    await expect(gate.request("location_primer")).resolves.toBe(true);
    expect(gate.current()).toBe("location_primer");
  });

  it("makes a lower prompt wait out the settle window", async () => {
    const gate = makeGate();
    let result: boolean | undefined;
    gate.request("saved_places").then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(PROMPT_SETTLE_MS - 1);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(true);
  });

  it("lets a higher prompt that arrives in the window win", async () => {
    const gate = makeGate();
    const explainer = gate.request("work_explainer");
    await vi.advanceTimersByTimeAsync(1000);
    const primer = gate.request("location_primer");
    await expect(primer).resolves.toBe(true);
    await expect(explainer).resolves.toBe(false);
  });

  it("picks the best of several waiting prompts when the window closes", async () => {
    const gate = makeGate();
    const rating = gate.request("rating");
    const places = gate.request("saved_places");
    const explainer = gate.request("work_explainer");
    await vi.advanceTimersByTimeAsync(PROMPT_SETTLE_MS);
    await expect(explainer).resolves.toBe(true);
    await expect(places).resolves.toBe(false);
    await expect(rating).resolves.toBe(false);
  });

  it("allows only one prompt per session, even the top one", async () => {
    const gate = makeGate();
    const places = gate.request("saved_places");
    await vi.advanceTimersByTimeAsync(PROMPT_SETTLE_MS);
    await expect(places).resolves.toBe(true);
    await expect(gate.request("location_primer")).resolves.toBe(false);
  });

  it("keeps saying yes to the prompt that holds the slot", async () => {
    const gate = makeGate();
    await gate.request("location_primer");
    await expect(gate.request("location_primer")).resolves.toBe(true);
  });

  it("frees the slot on reset", async () => {
    const gate = makeGate();
    await gate.request("location_primer");
    gate.reset();
    const explainer = gate.request("work_explainer");
    await vi.advanceTimersByTimeAsync(PROMPT_SETTLE_MS);
    await expect(explainer).resolves.toBe(true);
  });
});
