import { describe, it, expect } from "vitest";
import {
  inferPeriod,
  monthlyEquivalentPence,
  classifyProSource,
  reconstructTrend,
  lastNMonths,
} from "../../services/subscriptionTruth.js";

const NOW = new Date("2026-08-21T08:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("inferPeriod", () => {
  it("reads the product id when stamped", () => {
    expect(inferPeriod("com.mileclear.premium.annual", days(10), NOW)).toEqual({ period: "annual", inferred: false });
    expect(inferPeriod("com.mileclear.premium.monthly", days(300), NOW)).toEqual({ period: "monthly", inferred: false });
  });
  it("infers annual from a far-out expiry, monthly otherwise", () => {
    expect(inferPeriod(null, days(300), NOW)).toEqual({ period: "annual", inferred: true });
    expect(inferPeriod(null, days(22), NOW)).toEqual({ period: "monthly", inferred: true });
    expect(inferPeriod(null, null, NOW)).toEqual({ period: "monthly", inferred: true });
  });
});

describe("monthlyEquivalentPence", () => {
  it("prices annual at a twelfth of £44.99", () => {
    expect(monthlyEquivalentPence("monthly")).toBe(499);
    expect(monthlyEquivalentPence("annual")).toBe(375);
  });
});

describe("classifyProSource", () => {
  const base = {
    isPremium: true,
    premiumExpiresAt: days(20),
    stripeSubscriptionId: null,
    appleOriginalTransactionId: null,
    referralProUntil: null,
  };
  const sandbox = new Set(["2000001221162405"]);

  it("Stripe and production Apple are paying", () => {
    expect(classifyProSource({ ...base, stripeSubscriptionId: "sub_1" }, sandbox, NOW)).toBe("paying");
    expect(classifyProSource({ ...base, appleOriginalTransactionId: "270003058283817" }, sandbox, NOW)).toBe("paying");
  });
  it("an Apple txn seen on a sandbox webhook is sandbox, not revenue", () => {
    expect(classifyProSource({ ...base, appleOriginalTransactionId: "2000001221162405" }, sandbox, NOW)).toBe("sandbox");
  });
  it("premium with no subscription ids is a comp grant", () => {
    expect(classifyProSource({ ...base, premiumExpiresAt: null }, sandbox, NOW)).toBe("comp");
  });
  it("a flagged row whose expiry has passed is not Pro", () => {
    expect(classifyProSource({ ...base, premiumExpiresAt: days(-1), stripeSubscriptionId: "sub_1" }, sandbox, NOW)).toBeNull();
  });
  it("referral credit counts even with isPremium false", () => {
    expect(classifyProSource({ ...base, isPremium: false, referralProUntil: days(10) }, sandbox, NOW)).toBe("referral");
    expect(classifyProSource({ ...base, isPremium: false, referralProUntil: days(-10) }, sandbox, NOW)).toBeNull();
  });
});

describe("reconstructTrend", () => {
  it("walks backwards from today's paying count", () => {
    const rows = reconstructTrend(
      20,
      [
        { month: "2026-08", kind: "new" },
        { month: "2026-08", kind: "new" },
        { month: "2026-08", kind: "churn" },
        { month: "2026-07", kind: "new" },
        { month: "2026-06", kind: "churn" },
      ],
      ["2026-06", "2026-07", "2026-08"]
    );
    expect(rows).toEqual([
      { month: "2026-06", payingAtMonthEnd: 18, newPaid: 0, churned: 1 },
      { month: "2026-07", payingAtMonthEnd: 19, newPaid: 1, churned: 0 },
      { month: "2026-08", payingAtMonthEnd: 20, newPaid: 2, churned: 1 },
    ]);
  });
  it("ignores events outside the requested months", () => {
    const rows = reconstructTrend(5, [{ month: "2025-01", kind: "new" }], ["2026-08"]);
    expect(rows).toEqual([{ month: "2026-08", payingAtMonthEnd: 5, newPaid: 0, churned: 0 }]);
  });
});

describe("lastNMonths", () => {
  it("ends at the current month and crosses the year boundary", () => {
    expect(lastNMonths(3, new Date("2026-01-15T00:00:00Z"))).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});
