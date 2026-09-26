import { describe, expect, it, vi } from "vitest";
import { runPausePrompt, type PausePromptDeps } from "../pausePrompt";
import { describePause, pauseEndPhrase, pausedRowText, pausePromptCopy } from "../pauseRule";

// Sat 26 Sep 2026 08:00 local. Peter's week-long pause, set Wed 23 Sep 20:00,
// runs to Wed 30 Sep 20:00.
const NOW = new Date(2026, 8, 26, 8, 0).getTime();
const PETER_UNTIL = new Date(2026, 8, 30, 20, 0).getTime();

function deps(over: Partial<PausePromptDeps> = {}): PausePromptDeps & { log: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn>; ask: ReturnType<typeof vi.fn> } {
  return {
    getPauseUntil: async () => PETER_UNTIL,
    now: () => NOW,
    ask: vi.fn(async () => "keep" as const),
    resume: vi.fn(async () => {}),
    log: vi.fn(),
    ...over,
  } as never;
}

describe("pause wording", () => {
  it("reads the end the same way describePause does", () => {
    expect(pauseEndPhrase(PETER_UNTIL, NOW)).toBe("Wed 30 Sep");
    expect(describePause(PETER_UNTIL, NOW)).toBe(`Paused until ${pauseEndPhrase(PETER_UNTIL, NOW)}`);
    const sixTomorrow = new Date(2026, 8, 27, 6, 0).getTime();
    expect(pauseEndPhrase(sixTomorrow, NOW)).toBe("06:00 tomorrow");
  });
  it("names what is off on the dashboard line", () => {
    expect(pausedRowText(PETER_UNTIL, NOW)).toBe("Recording paused until Wed 30 Sep");
  });
  it("asks nothing when there is no live pause", () => {
    expect(pausePromptCopy(null, NOW)).toBeNull();
    expect(pausePromptCopy(NOW - 1, NOW)).toBeNull();
    expect(pausePromptCopy(Number.NaN, NOW)).toBeNull();
  });
  it("words the question plainly", () => {
    expect(pausePromptCopy(PETER_UNTIL, NOW)).toEqual({
      title: "Recording is paused",
      message: "Automatic recording is paused until Wed 30 Sep. Turn it back on?",
      resumeLabel: "Resume recording",
      keepLabel: "Keep paused",
    });
  });
  it("has no em dashes in anything a driver reads", () => {
    const c = pausePromptCopy(PETER_UNTIL, NOW)!;
    expect(Object.values(c).join(" ")).not.toMatch(/—/);
  });
});

describe("runPausePrompt", () => {
  it("does not ask when recording is on", async () => {
    const d = deps({ getPauseUntil: async () => null });
    expect(await runPausePrompt("shift", d)).toBe("not_paused");
    expect(d.ask).not.toHaveBeenCalled();
    expect(d.log).not.toHaveBeenCalled();
  });
  it("does not ask about a pause that has already ended", async () => {
    const d = deps({ getPauseUntil: async () => NOW - 60_000 });
    expect(await runPausePrompt("trip", d)).toBe("not_paused");
    expect(d.ask).not.toHaveBeenCalled();
  });
  it("resumes and logs when the driver says so", async () => {
    const d = deps({ ask: vi.fn(async () => "resume" as const) });
    expect(await runPausePrompt("shift", d)).toBe("resumed");
    expect(d.resume).toHaveBeenCalledTimes(1);
    expect(d.log).toHaveBeenCalledWith("pause_prompt.resumed", { source: "shift", hoursLeft: 108 });
  });
  it("keeps the pause and logs when the driver says so", async () => {
    const d = deps();
    expect(await runPausePrompt("trip", d)).toBe("kept");
    expect(d.resume).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith("pause_prompt.kept", { source: "trip", hoursLeft: 108 });
  });
  it("never throws, so the start always goes ahead", async () => {
    await expect(runPausePrompt("shift", deps({ getPauseUntil: async () => { throw new Error("db"); } }))).resolves.toBe("not_paused");
    await expect(runPausePrompt("shift", deps({ ask: vi.fn(async () => { throw new Error("ui"); }) }))).resolves.toBe("kept");
    await expect(
      runPausePrompt("shift", deps({ ask: vi.fn(async () => "resume" as const), resume: vi.fn(async () => { throw new Error("x"); }), log: vi.fn(() => { throw new Error("log"); }) }))
    ).resolves.toBe("resumed");
  });
});
