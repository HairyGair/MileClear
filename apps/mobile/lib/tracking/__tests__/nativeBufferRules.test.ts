import { describe, it, expect } from "vitest";
import { createSerialOpener, duplicateRowIds, missingNativeFixes, newestOnly } from "../nativeBufferRules";

const T0 = Date.parse("2026-10-15T15:32:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("createSerialOpener (single-flight open)", () => {
  function setup() {
    let armed = false;
    const log: string[] = [];
    let rescues = 0;
    const open = createSerialOpener<{ id: string }>({
      isOpen: async () => armed,
      open: async (s) => {
        // The full open: a slow rescue, then arm.
        log.push(`open:${s.id}:start`);
        rescues++;
        await new Promise((r) => setTimeout(r, 20));
        armed = true;
        log.push(`open:${s.id}:done`);
      },
      bufferOnly: async (s) => {
        log.push(`buffer:${s.id}`);
      },
    });
    return { open, log, rescues: () => rescues, disarm: () => (armed = false) };
  }

  it("runs one rescue when several opens arrive together and keeps every fix", async () => {
    const h = setup();
    await Promise.all([h.open({ id: "a" }), h.open({ id: "b" }), h.open({ id: "c" }), h.open({ id: "d" })]);
    expect(h.rescues()).toBe(1);
    // The first open ran whole before anyone else; the rest only buffered.
    expect(h.log).toEqual(["open:a:start", "open:a:done", "buffer:b", "buffer:c", "buffer:d"]);
  });

  it("opens again once the recording has closed", async () => {
    const h = setup();
    await h.open({ id: "a" });
    h.disarm();
    await h.open({ id: "b" });
    expect(h.rescues()).toBe(2);
  });

  it("a failed open does not block the ones behind it", async () => {
    let calls = 0;
    const open = createSerialOpener<number>({
      isOpen: async () => false,
      open: async () => {
        calls++;
        if (calls === 1) throw new Error("boom");
      },
      bufferOnly: async () => {},
    });
    const first = open(1).catch(() => "failed");
    const second = open(2);
    expect(await first).toBe("failed");
    await second;
    expect(calls).toBe(2);
  });

  it("falls back to a full open when it cannot tell whether a recording is open", async () => {
    let opened = 0;
    const open = createSerialOpener<number>({
      isOpen: async () => {
        throw new Error("db");
      },
      open: async () => {
        opened++;
      },
      bufferOnly: async () => {},
    });
    await open(1);
    expect(opened).toBe(1);
  });
});

describe("missingNativeFixes (reconcile adds only what is missing)", () => {
  const native = Array.from({ length: 10 }, (_, i) => ({ timestamp: iso(T0 + i * 10_000), n: i }));

  it("returns only the fixes the buffer lacks", () => {
    const have = native.slice(0, 4).map((f) => f.timestamp);
    const missing = missingNativeFixes(native, have);
    expect(missing.map((f) => f.n)).toEqual([4, 5, 6, 7, 8, 9]);
  });

  it("recognises the same fix spelled as an epoch", () => {
    const have = [String(T0), String(T0 + 10_000)];
    expect(missingNativeFixes(native, have)).toHaveLength(8);
  });

  it("returns nothing when the buffer already has every native fix", () => {
    expect(missingNativeFixes(native, native.map((f) => f.timestamp))).toEqual([]);
  });

  it("collapses repeats inside the native store itself", () => {
    const doubled = [...native, ...native];
    expect(missingNativeFixes(doubled, [])).toHaveLength(10);
  });

  it("skips fixes with unreadable times", () => {
    expect(missingNativeFixes([{ timestamp: "nope" }], [])).toEqual([]);
  });

  it("newestOnly keeps the tail", () => {
    expect(newestOnly([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
    expect(newestOnly([1, 2], 3)).toEqual([1, 2]);
  });
});

describe("duplicateRowIds (duplicate timestamps collapse)", () => {
  it("keeps the lowest id of each time and returns the extra copies", () => {
    const rows = [
      { id: 5, recorded_at: iso(T0) },
      { id: 2, recorded_at: iso(T0) },
      { id: 9, recorded_at: String(T0) }, // same fix as an epoch
      { id: 3, recorded_at: iso(T0 + 10_000) },
      { id: 4, recorded_at: iso(T0 + 10_000) },
    ];
    expect(duplicateRowIds(rows).sort((a, b) => a - b)).toEqual([4, 5, 9]);
  });

  it("never touches rows with unreadable times", () => {
    expect(duplicateRowIds([{ id: 1, recorded_at: "x" }, { id: 2, recorded_at: "x" }])).toEqual([]);
  });
});
