import { describe, expect, it } from "vitest";
import { currentShiftId, localIdFromAliasKey, shiftIdAliasKey, shiftLockMoveSql, shiftRekeySteps } from "../shiftRekey";

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

describe("currentShiftId", () => {
  const dbWith = (rows: Record<string, string>) => ({
    getFirstAsync: async <T,>(_sql: string, params: string[]) =>
      (params[0] in rows ? { value: rows[params[0]] } : null) as T | null,
  });
  it("follows the alias to the server id", async () => {
    expect(await currentShiftId(dbWith({ [shiftIdAliasKey("L")]: "S" }), "L")).toBe("S");
  });
  it("keeps an id with no alias", async () => {
    expect(await currentShiftId(dbWith({}), "S")).toBe("S");
  });
  it("keeps the id if the read fails", async () => {
    const broken = { getFirstAsync: async () => { throw new Error("db"); } };
    expect(await currentShiftId(broken, "L")).toBe("L");
  });
});

describe("shiftLockMoveSql", () => {
  it("moves only this shift's lock and records the alias", () => {
    const sql = shiftLockMoveSql("local-1", "server-9")!;
    expect(sql).toContain("SET value = 'server-9' WHERE key = 'active_shift_id' AND value = 'local-1'");
    expect(sql).toContain(`('${shiftIdAliasKey("local-1")}', 'server-9')`);
  });
  it("refuses anything but a plain id", () => {
    expect(shiftLockMoveSql("x'; DROP TABLE trips; --", "s")).toBeNull();
    expect(shiftLockMoveSql("l", "")).toBeNull();
  });
});

// A tiny in-memory stand-in for the tables the re-key touches, to show the
// steps are safe to run twice (a kill part way, then the next sync).
function fakeTables() {
  const state = new Map<string, string>([["active_shift_id", "L"]]);
  const coords = [{ shift_id: "L" }, { shift_id: "L" }, { shift_id: "Q" }];
  const trips = [{ shift_id: "L" }];
  const run = (sql: string, p: string[]) => {
    if (sql.startsWith("UPDATE tracking_state")) {
      if (state.get("active_shift_id") === p[1]) state.set("active_shift_id", p[0]);
    } else if (sql.startsWith("INSERT OR REPLACE INTO tracking_state")) {
      state.set(p[0], p[1]);
    } else if (sql.startsWith("UPDATE shift_coordinates")) {
      for (const c of coords) if (c.shift_id === p[1]) c.shift_id = p[0];
    } else if (sql.startsWith("UPDATE trips")) {
      for (const t of trips) if (t.shift_id === p[1]) t.shift_id = p[0];
    }
  };
  return { state, coords, trips, run };
}

describe("re-running the re-key", () => {
  it("ends in the same place whether it runs once, twice, or is cut short and run again", () => {
    const once = fakeTables();
    for (const s of shiftRekeySteps("L", "S")) once.run(s.sql, s.params);

    const twice = fakeTables();
    for (const s of shiftRekeySteps("L", "S")) twice.run(s.sql, s.params);
    for (const s of shiftRekeySteps("L", "S")) twice.run(s.sql, s.params);

    const cut = fakeTables();
    for (const s of shiftRekeySteps("L", "S").slice(0, 2)) cut.run(s.sql, s.params);
    for (const s of shiftRekeySteps("L", "S")) cut.run(s.sql, s.params);

    for (const t of [twice, cut]) {
      expect([...t.state]).toEqual([...once.state]);
      expect(t.coords).toEqual(once.coords);
      expect(t.trips).toEqual(once.trips);
    }
    expect(once.state.get("active_shift_id")).toBe("S");
    expect(once.coords.map((c) => c.shift_id)).toEqual(["S", "S", "Q"]);
  });
  it("never moves another lock", () => {
    const t = fakeTables();
    t.state.set("active_shift_id", "__quick_trip__");
    for (const s of shiftRekeySteps("L", "S")) t.run(s.sql, s.params);
    expect(t.state.get("active_shift_id")).toBe("__quick_trip__");
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
