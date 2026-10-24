import { describe, it, expect } from "vitest";
import { pauseFixWindow } from "../pauseRule";

// Celerio, 23-24 Oct 2026: paused "For a week", four drives still saved.
const START = Date.UTC(2026, 9, 23, 10, 51);
const UNTIL = START + 7 * 24 * 3600 * 1000;

describe("pauseFixWindow", () => {
  it("is the pause, from its start to its end", () => {
    expect(pauseFixWindow({ until: UNTIL, startedAt: START, armed: false })).toEqual({ fromMs: START, toMs: UNTIL });
  });

  it("is the same with a recording armed: the start time keeps the earlier drive", () => {
    expect(pauseFixWindow({ until: UNTIL, startedAt: START, armed: true })).toEqual({ fromMs: START, toMs: UNTIL });
  });

  it("covers everything before the end for a pause with no start time", () => {
    expect(pauseFixWindow({ until: UNTIL, startedAt: null, armed: false })).toEqual({ fromMs: 0, toMs: UNTIL });
  });

  it("drops nothing for a pause with no start time while a recording is armed", () => {
    expect(pauseFixWindow({ until: UNTIL, startedAt: null, armed: true })).toBeNull();
  });

  it("drops nothing with no pause or a malformed one", () => {
    expect(pauseFixWindow({ until: null, startedAt: START, armed: false })).toBeNull();
    expect(pauseFixWindow({ until: Number.NaN, startedAt: null, armed: false })).toBeNull();
    expect(pauseFixWindow({ until: START, startedAt: UNTIL, armed: false })).toBeNull();
  });
});
