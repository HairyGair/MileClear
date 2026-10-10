import { describe, it, expect } from "vitest";
import { createTtlCache } from "../ttlCache";

describe("createTtlCache", () => {
  it("reuses an answer inside the window, refetches after it, and on force", async () => {
    let t = 0;
    let calls = 0;
    const c = createTtlCache(1000, () => t);
    const load = async () => ++calls;
    expect(await c.get("a", load)).toBe(1);
    t = 999;
    expect(await c.get("a", load)).toBe(1);
    t = 1000;
    expect(await c.get("a", load)).toBe(2);
    expect(await c.get("a", load, true)).toBe(3);
  });
  it("does not keep failures", async () => {
    const c = createTtlCache(1000, () => 0);
    await expect(c.get("a", async () => { throw new Error("x"); })).rejects.toThrow();
    expect(await c.get("a", async () => 5)).toBe(5);
  });
});
