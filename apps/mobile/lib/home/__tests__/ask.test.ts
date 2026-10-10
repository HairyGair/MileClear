import { describe, it, expect } from "vitest";
import { selectAsk, isQuietToday, ASK_ORDER, proAskLine, PRO_ASK_LINES, type AskId } from "../ask";

const all = Object.fromEntries(ASK_ORDER.map((id) => [id, true])) as Record<AskId, boolean>;

describe("selectAsk", () => {
  it("picks the first eligible in the fixed order", () => {
    expect(selectAsk({ statusRed: false, quietToday: false, eligible: all })).toBe("acquisition");
    expect(selectAsk({ statusRed: false, quietToday: false, eligible: { ...all, acquisition: false } })).toBe("vehicle");
  });

  it("follows the order from the spec", () => {
    expect(ASK_ORDER).toEqual([
      "acquisition", "vehicle", "odometer", "employer", "shift",
      "saved_places", "pro", "referral", "android_beta",
    ]);
  });

  it("walks down the list as asks drop out", () => {
    const e: Partial<Record<AskId, boolean>> = { ...all };
    const seen: (AskId | null)[] = [];
    for (let n = 0; n < ASK_ORDER.length + 1; n++) {
      const pick = selectAsk({ statusRed: false, quietToday: false, eligible: e });
      seen.push(pick);
      if (pick) e[pick] = false;
    }
    expect(seen).toEqual([...ASK_ORDER, null]);
  });

  it("shows nothing while the status line is red", () => {
    expect(selectAsk({ statusRed: true, quietToday: false, eligible: all })).toBeNull();
  });

  it("shows nothing for the rest of the day after a dismissal", () => {
    expect(selectAsk({ statusRed: false, quietToday: true, eligible: all })).toBeNull();
  });

  it("shows nothing when nothing is eligible", () => {
    expect(selectAsk({ statusRed: false, quietToday: false, eligible: {} })).toBeNull();
  });

  it("Pro comes before the referral and Android beta", () => {
    expect(
      selectAsk({ statusRed: false, quietToday: false, eligible: { pro: true, referral: true, android_beta: true } })
    ).toBe("pro");
  });
});

describe("isQuietToday", () => {
  const noon = new Date(2026, 9, 10, 12, 0).getTime();
  it("is true on the same local day", () => {
    expect(isQuietToday(new Date(2026, 9, 10, 8, 0).getTime(), noon)).toBe(true);
  });
  it("is false the next day, and when never dismissed", () => {
    expect(isQuietToday(new Date(2026, 9, 9, 23, 59).getTime(), noon)).toBe(false);
    expect(isQuietToday(null, noon)).toBe(false);
  });
});

describe("proAskLine", () => {
  it("rotates daily through lines that never repeat the hero figure", () => {
    const day = 24 * 60 * 60 * 1000;
    const lines = new Set([0, 1, 2, 3].map((n) => proAskLine(n * day)));
    expect(lines.size).toBe(PRO_ASK_LINES.length);
    for (const l of PRO_ASK_LINES) expect(l).not.toMatch(/£/);
  });
});
