import { describe, it, expect } from "vitest";
import { exportErrorMessage } from "../exportError";

const FALLBACK = "Download failed";

describe("exportErrorMessage", () => {
  it("shows the server's own sentence", () => {
    const body = JSON.stringify({
      error: "There are no trips in that car in the 2026-27 tax year yet, so this export would come out empty.",
    });
    expect(exportErrorMessage(body, FALLBACK)).toMatch(/^There are no trips in that car/);
  });

  it("reads the newer { error: { message } } shape too", () => {
    expect(exportErrorMessage(JSON.stringify({ error: { code: "X", message: "Invalid vehicle" } }), FALLBACK)).toBe(
      "Invalid vehicle"
    );
  });

  it("falls back for anything that isn't a JSON error sentence", () => {
    expect(exportErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(exportErrorMessage("", FALLBACK)).toBe(FALLBACK);
    expect(exportErrorMessage("<html>Bad gateway</html>", FALLBACK)).toBe(FALLBACK);
    expect(exportErrorMessage("%PDF-1.4", FALLBACK)).toBe(FALLBACK);
    expect(exportErrorMessage(JSON.stringify({ error: "   " }), FALLBACK)).toBe(FALLBACK);
    expect(exportErrorMessage(JSON.stringify({ error: 42 }), FALLBACK)).toBe(FALLBACK);
    expect(exportErrorMessage(JSON.stringify(["x"]), FALLBACK)).toBe(FALLBACK);
    expect(exportErrorMessage("null", FALLBACK)).toBe(FALLBACK);
    expect(exportErrorMessage(JSON.stringify({ error: "x".repeat(401) }), FALLBACK)).toBe(FALLBACK);
  });
});
