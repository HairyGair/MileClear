/**
 * The one bridge from Directions to the recorder (PLAN-recording.md section
 * 2): news only, never on guidance's stack, never a throw or a rejection.
 */
import { describe, it, expect, afterEach } from "vitest";
import { announceGuidance, setGuidanceHandler, type GuidanceIntent } from "../guidanceIntent";

const intent: GuidanceIntent = { kind: "started", sessionId: "dir_1", mode: "log", passenger: false, fix: null, atMs: 1 };

afterEach(() => setGuidanceHandler(null));

describe("announceGuidance", () => {
  it("is a no-op with no handler", async () => {
    await expect(announceGuidance(intent)).resolves.toBeUndefined();
  });

  it("runs the handler on a later tick, never on the caller's stack", async () => {
    const got: string[] = [];
    setGuidanceHandler((i) => {
      got.push(i.kind);
    });
    const p = announceGuidance(intent);
    expect(got).toEqual([]);
    await p;
    expect(got).toEqual(["started"]);
  });

  it("a throwing or rejecting handler never reaches guidance", async () => {
    setGuidanceHandler(() => {
      throw new Error("bug");
    });
    await expect(announceGuidance(intent)).resolves.toBeUndefined();
    setGuidanceHandler(async () => {
      throw new Error("bug");
    });
    await expect(announceGuidance(intent)).resolves.toBeUndefined();
  });

  it("one handler: a later registration replaces the first", async () => {
    const got: string[] = [];
    setGuidanceHandler(() => void got.push("a"));
    setGuidanceHandler(() => void got.push("b"));
    await announceGuidance(intent);
    expect(got).toEqual(["b"]);
  });
});
