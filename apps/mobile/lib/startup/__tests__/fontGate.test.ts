import { describe, expect, it, vi } from "vitest";
import { waitForFonts } from "../fontGate";

describe("font gate", () => {
  it("resolves loaded as soon as the fonts load", async () => {
    expect(await waitForFonts(() => Promise.resolve(), 50)).toBe("loaded");
  });
  it("resolves failed (not stuck) when loading rejects or throws", async () => {
    expect(await waitForFonts(() => Promise.reject(new Error("x")), 50)).toBe("failed");
    expect(await waitForFonts(() => { throw new Error("x"); }, 50)).toBe("failed");
  });
  it("gives up after the timeout when loading never finishes", async () => {
    vi.useFakeTimers();
    const p = waitForFonts(() => new Promise(() => {}), 3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toBe("timeout");
    vi.useRealTimers();
  });
});
