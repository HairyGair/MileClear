import { describe, it, expect } from "vitest";
import { withKeyLock } from "../../lib/keyedLock.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withKeyLock", () => {
  it("runs work for the same key one at a time, in order (two uploads of one drive)", async () => {
    const saved: string[] = [];
    let inside = 0;
    let maxInside = 0;
    const upload = (name: string) =>
      withKeyLock("trip-create:katy", async () => {
        inside++;
        maxInside = Math.max(maxInside, inside);
        // check-then-insert: a second copy must see the first
        const dup = saved.length > 0;
        await sleep(5);
        if (!dup) saved.push(name);
        inside--;
        return dup ? "existing" : "created";
      });
    const results = await Promise.all([upload("a"), upload("b"), upload("c"), upload("d")]);
    expect(results).toEqual(["created", "existing", "existing", "existing"]);
    expect(saved).toEqual(["a"]);
    expect(maxInside).toBe(1);
  });

  it("different keys do not wait for each other", async () => {
    const order: string[] = [];
    await Promise.all([
      withKeyLock("trip-create:a", async () => { await sleep(20); order.push("a"); }),
      withKeyLock("trip-create:b", async () => { order.push("b"); }),
    ]);
    expect(order).toEqual(["b", "a"]);
  });

  it("a failure is passed back but does not block the next caller", async () => {
    await expect(withKeyLock("k", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(withKeyLock("k", async () => "ok")).resolves.toBe("ok");
  });
});
