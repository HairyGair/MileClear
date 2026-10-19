import { describe, it, expect } from "vitest";
import { joinPreview } from "../joinTotalRule";

const total = {
  id: "total",
  startedAt: "2026-10-17T09:00:00.000Z",
  endedAt: "2026-10-17T17:00:00.000Z",
  distanceMiles: 84,
  isTypedTotal: true,
};
const trip = (id: string, start: string, end: string | null, miles: number) => ({
  id,
  startedAt: `2026-10-17T${start}:00.000Z`,
  endedAt: end ? `2026-10-17T${end}:00.000Z` : null,
  distanceMiles: miles,
});

describe("joinPreview", () => {
  it("adds the miles up for ordinary trips", () => {
    expect(joinPreview([trip("a", "09:00", "09:20", 4), trip("b", "09:30", "09:50", 6.5)])).toEqual({ kind: "plain", miles: 10.5 });
  });

  it("shows the total's miles, not the sum, when joining into a total", () => {
    expect(joinPreview([total, trip("a", "12:00", "12:20", 6.1)])).toEqual({ kind: "into_total", miles: 84 });
    expect(joinPreview([trip("a", "12:00", null, 1), total])).toEqual({ kind: "into_total", miles: 84 });
  });

  it("refuses a drive outside the shift's hours (the drive home after it)", () => {
    expect(joinPreview([total, trip("home", "17:20", "17:50", 12)])).toEqual({
      kind: "refused",
      problem: "Only trips inside the shift's hours can be joined into its total.",
    });
    expect(joinPreview([total, trip("across", "16:50", "17:10", 3)]).kind).toBe("refused");
  });

  it("refuses two totals", () => {
    expect(joinPreview([total, { ...total, id: "other" }]).kind).toBe("refused");
  });
});
