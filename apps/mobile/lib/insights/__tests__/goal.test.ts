import { describe, expect, it } from "vitest";
import { goalRowText, parseGoalInput } from "../goal";

describe("parseGoalInput", () => {
  it("accepts whole and decimal miles", () => {
    expect(parseGoalInput("50")).toEqual({ ok: true, miles: 50 });
    expect(parseGoalInput(" 62.46 ")).toEqual({ ok: true, miles: 62.5 });
    expect(parseGoalInput("1,200")).toEqual({ ok: true, miles: 1200 });
  });
  it("rejects blank, zero, negative and words", () => {
    for (const t of ["", "  ", "0", "-5", "abc", "5 miles", "1e3"]) expect(parseGoalInput(t).ok).toBe(false);
  });
});

describe("goalRowText", () => {
  it("offers to set one, then to change it", () => {
    expect(goalRowText(null, "personal").title).toBe("Set a weekly goal");
    expect(goalRowText(null, "work").sub).not.toContain("dial");
    expect(goalRowText(150, "work").title).toBe("Weekly goal: 150 miles");
  });
});
