import { describe, expect, it } from "vitest";
import { localIdFromAliasKey, shiftIdAliasKey, shiftRekeySteps } from "../shiftRekey";

describe("shiftRekeySteps", () => {
  const steps = shiftRekeySteps("local-1", "server-9");

  it("moves the tracking lock first, and only this shift's", () => {
    expect(steps[0].sql).toContain("UPDATE tracking_state SET value = ?");
    expect(steps[0].sql).toContain("key = 'active_shift_id' AND value = ?");
    expect(steps[0].params).toEqual(["server-9", "local-1"]);
  });

  it("remembers the old id so late fixes can be folded in at End Shift", () => {
    expect(steps[1].params).toEqual([shiftIdAliasKey("local-1"), "server-9"]);
  });

  it("then moves the breadcrumbs and trips", () => {
    expect(steps[2].sql).toContain("shift_coordinates");
    expect(steps[2].params).toEqual(["server-9", "local-1"]);
    expect(steps[3].sql).toContain("UPDATE trips");
    expect(steps[3].params).toEqual(["server-9", "local-1"]);
  });
});

describe("alias keys", () => {
  it("round-trips the local id", () => {
    expect(localIdFromAliasKey(shiftIdAliasKey("abc"))).toBe("abc");
  });
  it("rejects anything else", () => {
    expect(localIdFromAliasKey("active_shift_id")).toBeNull();
    expect(localIdFromAliasKey("shift_id_alias:")).toBeNull();
  });
});
