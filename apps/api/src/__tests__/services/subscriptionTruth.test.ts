import { describe, it, expect } from "vitest";
import {
  googlePaidEventsFrom,
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
  it("an active team membership grants Pro as 'team' when nothing personal does", () => {
    expect(classifyProSource({ ...base, isPremium: false, hasTeamMembership: true }, sandbox, NOW)).toBe("team");
    // A paying subscription outranks the team badge.
    expect(classifyProSource({ ...base, stripeSubscriptionId: "sub_1", hasTeamMembership: true }, sandbox, NOW)).toBe("paying");
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


describe("Google Play (27 Sep 2026: Android subscribers were counted as comp)", () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const base = { isPremium: true, premiumExpiresAt: future, stripeSubscriptionId: null, appleOriginalTransactionId: null, referralProUntil: null };

  it("counts a Play subscriber as paying, not comp", () => {
    expect(classifyProSource({ ...base, googlePlayPurchaseToken: "tok" }, new Set())).toBe("paying");
    expect(classifyProSource({ ...base, googlePlayPurchaseToken: null }, new Set())).toBe("comp");
  });

  it("counts each Play subscriber as new once, even when a purchase is validated twice", () => {
    const t = new Date("2026-09-27T13:54:15Z");
    const ev = googlePaidEventsFrom([
      { type: "billing.google_play_validated", userId: "k", createdAt: t, metadata: {} },
      { type: "billing.google_play_validated", userId: "k", createdAt: new Date(t.getTime() + 500), metadata: {} },
      { type: "billing.google_play_validated", userId: "r", createdAt: t, metadata: {} },
    ]);
    expect(ev).toEqual([{ month: "2026-09", kind: "new" }, { month: "2026-09", kind: "new" }]);
  });

  it("counts a churn only when Google says access ended", () => {
    const t = new Date("2026-10-27T13:54:15Z");
    const ev = googlePaidEventsFrom([
      { type: "billing.google_play_rtdn", userId: "k", createdAt: t, metadata: { active: true } },
      { type: "billing.google_play_rtdn", userId: "k", createdAt: t, metadata: { active: false } },
      { type: "billing.google_play_rtdn", userId: "k", createdAt: new Date(t.getTime() + 1000), metadata: { active: false } },
    ]);
    expect(ev).toEqual([{ month: "2026-10", kind: "churn" }]);
  });
});
