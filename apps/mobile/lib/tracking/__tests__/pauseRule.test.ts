import { describe, expect, it } from "vitest";
import {
  describeOffSince,
  describePause,
  isPauseActive,
  pauseChoices,
  pauseWakeDecision,
  tomorrowAtResumeHour,
} from "../pauseRule";

// Wed 16 Sep 2026 11:30 local.
const NOW = new Date(2026, 8, 16, 11, 30).getTime();

describe("pause choices", () => {
  it("offers 6am tomorrow and a week", () => {
    const c = pauseChoices(NOW);
    expect(c.map((x) => x.id)).toEqual(["tomorrow", "week"]);
    const t = new Date(c[0].until);
    expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([17, 6, 0]);
    expect(c[1].until - NOW).toBe(7 * 24 * 3600 * 1000);
  });
  it("a pause started after 6am still ends at 6am the NEXT day, never the same morning", () => {
    const late = new Date(2026, 8, 16, 23, 50).getTime();
    expect(new Date(tomorrowAtResumeHour(late)).getDate()).toBe(17);
  });
});

describe("isPauseActive", () => {
  it("is live only while the end is ahead", () => {
    expect(isPauseActive(NOW + 1000, NOW)).toBe(true);
    expect(isPauseActive(NOW - 1000, NOW)).toBe(false);
  });
  it("treats a missing or broken value as not paused, never paused forever", () => {
    expect(isPauseActive(null, NOW)).toBe(false);
    expect(isPauseActive(undefined, NOW)).toBe(false);
    expect(isPauseActive(Number.NaN, NOW)).toBe(false);
  });
});

describe("pauseWakeDecision", () => {
  it("records when there is no pause at all", () => {
    expect(pauseWakeDecision(null, NOW)).toBe("record");
    expect(pauseWakeDecision(undefined, NOW)).toBe("record");
  });
  it("sleeps while the pause is still running", () => {
    expect(pauseWakeDecision(NOW + 60_000, NOW)).toBe("sleep");
  });
  it("resumes on the first wake after the end time, with no app open", () => {
    expect(pauseWakeDecision(NOW - 1, NOW)).toBe("resume");
  });
  it("resumes Samantha's phone at 09:40 instead of losing her day", () => {
    // Pause set 20:00 on Sun 20 Sep, due to end 06:00 on Mon 21 Sep. Her
    // first drive of the working day was 09:40.
    const until = new Date(2026, 8, 21, 6, 0).getTime();
    const firstDrive = new Date(2026, 8, 21, 9, 40).getTime();
    expect(pauseWakeDecision(until, new Date(2026, 8, 20, 22, 0).getTime())).toBe("sleep");
    expect(pauseWakeDecision(until, firstDrive)).toBe("resume");
  });
  it("clears a malformed pause rather than stranding the recorder on it", () => {
    expect(pauseWakeDecision(Number.NaN, NOW)).toBe("resume");
  });
});

describe("describePause", () => {
  it("names tomorrow morning", () => {
    expect(describePause(tomorrowAtResumeHour(NOW), NOW)).toBe("Paused until 06:00 tomorrow");
  });
  it("names a later day", () => {
    expect(describePause(NOW + 7 * 24 * 3600 * 1000, NOW)).toBe("Paused until Wed 23 Sep");
  });
  it("names today when it ends today", () => {
    expect(describePause(new Date(2026, 8, 16, 18, 0).getTime(), NOW)).toBe("Paused until 18:00 today");
  });
});

describe("describeOffSince", () => {
  it("names the day the switch went off", () => {
    expect(describeOffSince(new Date(2026, 8, 3, 9, 0).getTime())).toBe("Recording has been off since Thu 3 Sep.");
  });
});
