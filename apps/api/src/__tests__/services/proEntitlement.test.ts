/**
 * The shared Pro entitlement rule (services/proEntitlement.ts): personal
 * subscription, referral credit, or an active membership of an entitled
 * org (free pilot or Stripe-subscribed). premiumMiddleware, the free caps,
 * /user/profile and /billing/status all answer through it.
 *
 * orgMembership.findFirst is faked with a tiny evaluator over fixture rows
 * so the org conditions in the real `where` are what gets tested, not a
 * canned return value.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface MembershipRow {
  id: string;
  userId: string;
  status: string;
  org: { pilotFree: boolean; stripeSubscriptionId: string | null };
}

let memberships: MembershipRow[] = [];
let userRow: Record<string, unknown> | null = null;

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => userRow) },
    orgMembership: {
      findFirst: vi.fn(async ({ where }: { where: any }) => {
        const orgMatches = (org: MembershipRow["org"]) =>
          (where.org.OR as any[]).some((cond) =>
            "pilotFree" in cond
              ? org.pilotFree === cond.pilotFree
              : cond.stripeSubscriptionId?.not === null
                ? org.stripeSubscriptionId !== null
                : false
          );
        const hit = memberships.find(
          (m) => m.userId === where.userId && m.status === where.status && orgMatches(m.org)
        );
        return hit ? { id: hit.id } : null;
      }),
    },
  },
}));

import { getProEntitlement, isProUser } from "../../services/proEntitlement.js";
import { prisma } from "../../lib/prisma.js";

const USER_ID = "00000000-0000-0000-0000-0000000000e1";
const DAY = 86_400_000;
const future = () => new Date(Date.now() + 10 * DAY);
const past = () => new Date(Date.now() - DAY);

const FREE = { isPremium: false, premiumExpiresAt: null, referralProUntil: null };

function member(org: MembershipRow["org"], status = "active"): MembershipRow {
  return { id: "m1", userId: USER_ID, status, org };
}

beforeEach(() => {
  vi.clearAllMocks();
  memberships = [];
  userRow = null;
});

describe("getProEntitlement", () => {
  it("a paying subscription is Pro without a team query", async () => {
    const ent = await getProEntitlement(USER_ID, { ...FREE, isPremium: true, premiumExpiresAt: future() });
    expect(ent).toMatchObject({ isPro: true, source: "subscription" });
    expect(prisma.orgMembership.findFirst).not.toHaveBeenCalled();
  });

  it("a subscription with no expiry (comp grant) is Pro", async () => {
    expect(await isProUser(USER_ID, { ...FREE, isPremium: true })).toBe(true);
  });

  it("an expired subscription is not Pro", async () => {
    const ent = await getProEntitlement(USER_ID, { ...FREE, isPremium: true, premiumExpiresAt: past() });
    expect(ent).toEqual({ isPro: false, source: "none", until: null });
  });

  it("active referral credit is Pro", async () => {
    const until = future();
    const ent = await getProEntitlement(USER_ID, { ...FREE, referralProUntil: until });
    expect(ent).toEqual({ isPro: true, source: "referral", until });
  });

  it("expired referral credit is not Pro", async () => {
    expect(await isProUser(USER_ID, { ...FREE, referralProUntil: past() })).toBe(false);
  });

  it("an active member of a free-pilot org is Pro via team", async () => {
    memberships = [member({ pilotFree: true, stripeSubscriptionId: null })];
    const ent = await getProEntitlement(USER_ID, FREE);
    expect(ent).toEqual({ isPro: true, source: "team", until: null });
  });

  it("an active member of an org with a Stripe subscription is Pro via team", async () => {
    memberships = [member({ pilotFree: false, stripeSubscriptionId: "sub_team" })];
    expect(await getProEntitlement(USER_ID, FREE)).toMatchObject({ isPro: true, source: "team" });
  });

  it("an active member of an org that is neither a pilot nor subscribed is not Pro", async () => {
    memberships = [member({ pilotFree: false, stripeSubscriptionId: null })];
    expect(await isProUser(USER_ID, FREE)).toBe(false);
  });

  it("an inactive membership of an entitled org is not Pro", async () => {
    memberships = [
      member({ pilotFree: true, stripeSubscriptionId: "sub_team" }, "disabled"),
      member({ pilotFree: true, stripeSubscriptionId: null }, "invited"),
    ];
    expect(await isProUser(USER_ID, FREE)).toBe(false);
  });

  it("a personal subscription outranks team membership as the source", async () => {
    memberships = [member({ pilotFree: true, stripeSubscriptionId: null })];
    const ent = await getProEntitlement(USER_ID, { ...FREE, isPremium: true, premiumExpiresAt: future() });
    expect(ent.source).toBe("subscription");
  });

  it("loads the user when no row is passed, and a missing user is not Pro", async () => {
    userRow = { ...FREE, referralProUntil: future() };
    expect(await isProUser(USER_ID)).toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    userRow = null;
    memberships = [member({ pilotFree: true, stripeSubscriptionId: null })];
    expect(await isProUser(USER_ID)).toBe(false);
    expect(await isProUser(USER_ID, null)).toBe(false);
  });
});
