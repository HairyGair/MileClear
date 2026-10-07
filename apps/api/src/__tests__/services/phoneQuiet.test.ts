/**
 * "Open MileClear before you drive" (7 Oct 2026): only a phone that was
 * nearly flat and unplugged at its last drive start counts.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
const { looksLikeFlatBattery } = await import("../../services/phoneQuiet.js");

describe("looksLikeFlatBattery", () => {
  it("is true at 10% or less, unplugged", () => {
    expect(looksLikeFlatBattery({ batteryPercent: 5, charging: false })).toBe(true);
    expect(looksLikeFlatBattery({ batteryPercent: 10, charging: false })).toBe(true);
  });
  it("is false above 10%, while charging, or when unknown", () => {
    expect(looksLikeFlatBattery({ batteryPercent: 11, charging: false })).toBe(false);
    expect(looksLikeFlatBattery({ batteryPercent: 5, charging: true })).toBe(false);
    expect(looksLikeFlatBattery({ batteryPercent: null, charging: false })).toBe(false);
    expect(looksLikeFlatBattery({ batteryPercent: 5, charging: null })).toBe(false);
  });
});
