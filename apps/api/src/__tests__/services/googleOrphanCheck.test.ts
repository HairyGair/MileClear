import { describe, expect, it, vi } from "vitest";
import { checkOrphanAfterGrace, ORPHAN_GRACE_MS } from "../../services/googleOrphanCheck.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("checkOrphanAfterGrace", () => {
  it("stays quiet when the phone links the purchase within the grace period (Rabiu and Krzysztof, 27 Sep 2026)", async () => {
    let run: (() => void) | null = null;
    const alert = vi.fn();
    checkOrphanAfterGrace("t", 4, { isBound: async () => true, alert, schedule: (fn, ms) => { expect(ms).toBe(ORPHAN_GRACE_MS); run = fn; } });
    expect(alert).not.toHaveBeenCalled();
    run!(); await flush();
    expect(alert).not.toHaveBeenCalled();
  });

  it("alerts when the purchase is still unlinked after the grace period", async () => {
    let run: (() => void) | null = null;
    const alert = vi.fn();
    checkOrphanAfterGrace("t", 4, { isBound: async () => false, alert, schedule: (fn) => { run = fn; } });
    run!(); await flush();
    expect(alert).toHaveBeenCalledWith(4);
  });

  it("alerts if the re-check itself fails, rather than staying silent about money", async () => {
    let run: (() => void) | null = null;
    const alert = vi.fn();
    checkOrphanAfterGrace("t", 1, { isBound: async () => { throw new Error("db"); }, alert, schedule: (fn) => { run = fn; } });
    run!(); await flush();
    expect(alert).toHaveBeenCalledWith(1);
  });
});
