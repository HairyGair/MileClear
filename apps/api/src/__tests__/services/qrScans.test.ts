import { describe, it, expect } from "vitest";
import { qrScanRollup } from "../../services/qrScans.js";

const NOW = new Date("2026-10-02T12:00:00Z");
const at = (iso: string, store: string) => ({ createdAt: new Date(iso), metadata: { link: "app", store } });

describe("qrScanRollup", () => {
  it("counts by store, by UK day and in the last 24 hours", () => {
    const r = qrScanRollup(
      [
        at("2026-10-02T09:00:00Z", "ios"),
        at("2026-10-02T10:00:00Z", "android"),
        at("2026-10-01T16:30:00Z", "ios"),
        at("2026-09-30T23:30:00Z", "other"), // 00:30 BST on 1 Oct
      ],
      NOW
    );
    expect(r.total).toBe(4);
    expect(r.byStore).toEqual({ ios: 2, android: 1, other: 1 });
    expect(r.last24h).toBe(3);
    expect(r.byDay[0]).toEqual({ date: "2026-10-02", total: 2, ios: 1, android: 1, other: 0 });
    expect(r.byDay[1]).toEqual({ date: "2026-10-01", total: 2, ios: 1, android: 0, other: 1 });
    expect(r.byDay).toHaveLength(14);
    expect(r.firstAt).toBe("2026-09-30T23:30:00.000Z");
    expect(r.lastAt).toBe("2026-10-02T10:00:00.000Z");
  });

  it("is all zeros with no scans", () => {
    const r = qrScanRollup([], NOW);
    expect(r.total).toBe(0);
    expect(r.byStore).toEqual({ ios: 0, android: 0, other: 0 });
    expect(r.firstAt).toBeNull();
  });

  it("files an unknown store under other", () => {
    expect(qrScanRollup([{ createdAt: NOW, metadata: { store: "blackberry" } }], NOW).byStore.other).toBe(1);
  });
});
