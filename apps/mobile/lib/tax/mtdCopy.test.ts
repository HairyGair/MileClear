import { describe, it, expect } from "vitest";
import { connectionLine, isConnectionExpired } from "./mtdCopy";

const now = new Date("2026-10-10T12:00:00Z");
describe("mtdCopy", () => {
  it("detects an expired token", () => {
    expect(isConnectionExpired("2026-10-09T23:28:00Z", now)).toBe(true);
    expect(isConnectionExpired("2026-10-11T00:00:00Z", now)).toBe(false);
  });
  it("treats missing and placeholder dates as unknown", () => {
    expect(isConnectionExpired(undefined, now)).toBe(false);
    expect(isConnectionExpired("1970-01-01T00:00:00Z", now)).toBe(false);
    expect(isConnectionExpired("nonsense", now)).toBe(false);
  });
  it("words the line", () => {
    expect(connectionLine("2026-10-09T23:28:00Z", "x", now)).toBe("Your test connection has expired. Connect again to carry on.");
    expect(connectionLine("2026-10-11T00:00:00Z", "11 Oct 2026, 01:00", now)).toBe("Your test connection renews by itself while you use it.");
  });
});
