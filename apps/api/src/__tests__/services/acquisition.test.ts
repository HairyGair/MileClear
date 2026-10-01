import { describe, it, expect } from "vitest";
import { acquisitionRollup } from "../../services/acquisition.js";

const ev = (userId: string, type: string, iso: string, metadata: unknown = {}) => ({ userId, type, createdAt: new Date(iso), metadata });

describe("acquisitionRollup", () => {
  it("counts each driver's latest answer once", () => {
    const r = acquisitionRollup([
      ev("a", "user.acquisition_source", "2026-10-01T10:00:00Z", { source: "facebook" }),
      ev("a", "user.acquisition_source", "2026-10-02T10:00:00Z", { source: "friend" }),
      ev("b", "user.acquisition_source", "2026-10-01T11:00:00Z", { source: "friend" }),
      ev("c", "user.acquisition_source", "2026-10-01T12:00:00Z", { source: "other", detail: "Uber driver forum" }),
    ]);
    expect(r.answered).toBe(3);
    expect(r.bySource.find((s) => s.value === "friend")?.count).toBe(2);
    expect(r.bySource.find((s) => s.value === "facebook")?.count).toBe(0);
    expect(r.bySource[0].value).toBe("friend");
    expect(r.otherDetails).toEqual([{ detail: "Uber driver forum", at: "2026-10-01T12:00:00.000Z" }]);
  });

  it("counts a skip only for drivers who never answered", () => {
    const r = acquisitionRollup([
      ev("a", "user.acquisition_source_skipped", "2026-10-01T10:00:00Z"),
      ev("b", "user.acquisition_source_skipped", "2026-10-01T10:00:00Z"),
      ev("b", "user.acquisition_source", "2026-10-03T10:00:00Z", { source: "google" }),
    ]);
    expect(r.answered).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it("lists every option even with no answers", () => {
    const r = acquisitionRollup([]);
    expect(r.answered).toBe(0);
    expect(r.bySource.length).toBeGreaterThanOrEqual(9);
  });
});
