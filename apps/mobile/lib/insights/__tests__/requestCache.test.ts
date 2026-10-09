import { describe, it, expect, vi } from "vitest";
import { RequestCache } from "../requestCache";

function setup() {
  let t = 1_000_000;
  const cache = new RequestCache(() => t, 60_000);
  return { cache, advance: (ms: number) => (t += ms) };
}

describe("RequestCache", () => {
  it("shares one request between two callers asking at once", async () => {
    const { cache } = setup();
    const load = vi.fn().mockResolvedValue("stats");
    const [a, b] = await Promise.all([cache.get("stats", load), cache.get("stats", load)]);
    expect(a).toBe("stats");
    expect(b).toBe("stats");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reuses a finished answer inside the freshness window and refetches after it", async () => {
    const { cache, advance } = setup();
    const load = vi.fn().mockResolvedValue(1);
    await cache.get("k", load);
    advance(59_000);
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(1);
    advance(2_000);
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps different params apart", async () => {
    const { cache } = setup();
    const load = vi.fn().mockResolvedValue(1);
    await cache.get("recap|weekly|2026-10-07", load);
    await cache.get("recap|monthly|2026-10-07", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("invalidate drops finished answers so pull to refresh reloads", async () => {
    const { cache } = setup();
    const load = vi.fn().mockResolvedValue(1);
    await cache.get("k", load);
    cache.invalidate();
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("invalidate leaves a request that is still on the wire shared", async () => {
    const { cache } = setup();
    let resolve!: (v: number) => void;
    const load = vi.fn(() => new Promise<number>((r) => (resolve = r)));
    const first = cache.get("k", load);
    cache.invalidate();
    const second = cache.get("k", load);
    resolve(7);
    expect(await first).toBe(7);
    expect(await second).toBe(7);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never caches a failure", async () => {
    const { cache } = setup();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("ok");
    await expect(cache.get("k", load)).rejects.toThrow("offline");
    expect(await cache.get("k", load)).toBe("ok");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("whenIdle fires after the last request finishes", async () => {
    const { cache } = setup();
    let resolveA!: (v: number) => void;
    let resolveB!: (v: number) => void;
    const a = cache.get("a", () => new Promise<number>((r) => (resolveA = r)));
    const b = cache.get("b", () => new Promise<number>((r) => (resolveB = r)));
    const idle = vi.fn();
    cache.whenIdle(idle);
    expect(cache.pending()).toBe(2);
    resolveA(1);
    await a;
    expect(idle).not.toHaveBeenCalled();
    resolveB(2);
    await b;
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it("whenIdle fires straight away when nothing is on the wire, and can be cancelled", () => {
    const { cache } = setup();
    const idle = vi.fn();
    cache.whenIdle(idle);
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it("a different driver starts empty", async () => {
    const { cache } = setup();
    const load = vi.fn().mockResolvedValue(1);
    cache.setScope("a");
    await cache.get("k", load);
    cache.setScope("b");
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
