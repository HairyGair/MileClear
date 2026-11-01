/** The Tax tab quarterly card's data: pure, no mocks. */
import { describe, it, expect } from "vitest";
import { buildMtdSummary } from "../../services/hmrc/summary.js";
import type { SeenObligation } from "../../jobs/mtdDeadlineReminders.js";

const q = (start: string, end: string, due: string, status: "Open" | "Fulfilled"): SeenObligation => ({ start, end, due, status });
const Q1 = q("2026-04-06", "2026-07-05", "2026-08-07", "Fulfilled");
const Q2 = q("2026-07-06", "2026-10-05", "2026-11-07", "Open");
const Q3 = q("2026-10-06", "2027-01-05", "2027-02-07", "Open");
const Q4 = q("2027-01-06", "2027-04-05", "2027-05-07", "Open");

describe("buildMtdSummary", () => {
  it("is empty until HMRC's obligations have been seen", () => {
    expect(buildMtdSummary({ snapshots: [], okSubmissions: [], todayIso: "2026-11-01" })).toEqual({ taxYear: null, quarters: [] });
  });

  it("returns the running tax year oldest first", () => {
    const r = buildMtdSummary({
      snapshots: [{ obligations: [Q4, Q2, Q1, Q3, q("2025-04-06", "2025-07-05", "2025-08-07", "Fulfilled")] }],
      okSubmissions: [],
      todayIso: "2026-11-01",
    });
    expect(r.taxYear).toBe("2026-27");
    expect(r.quarters.map((x) => x.due)).toEqual(["2026-08-07", "2026-11-07", "2027-02-07", "2027-05-07"]);
    expect(r.quarters.map((x) => x.status)).toEqual(["Fulfilled", "Open", "Open", "Open"]);
  });

  it("counts a quarter as sent once an update covering it went from MileClear", () => {
    const r = buildMtdSummary({
      snapshots: [{ obligations: [Q1, Q2, Q3, Q4] }],
      okSubmissions: [{ taxYear: "2026-27", periodEnd: "2026-10-05" }],
      todayIso: "2026-11-01",
    });
    expect(r.quarters.map((x) => x.status)).toEqual(["Fulfilled", "Fulfilled", "Open", "Open"]);
  });

  it("ignores updates for another tax year", () => {
    const r = buildMtdSummary({
      snapshots: [{ obligations: [Q2] }],
      okSubmissions: [{ taxYear: "2025-26", periodEnd: "2026-01-05" }],
      todayIso: "2026-11-01",
    });
    expect(r.quarters[0].status).toBe("Open");
  });

  it("falls back to the newest year HMRC showed when the running one is missing", () => {
    const r = buildMtdSummary({
      snapshots: [{ obligations: [q("2025-04-06", "2025-07-05", "2025-08-07", "Fulfilled")] }],
      okSubmissions: [],
      todayIso: "2026-11-01",
    });
    expect(r.taxYear).toBe("2025-26");
  });
});
