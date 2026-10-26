/**
 * Milesheet price question (Oct 2026): asked once per org after approving.
 * An answer closes it for good; a skip only for the rest of that month.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: { appEvent: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({}) } },
}));

import { prisma } from "../../lib/prisma.js";
import { priceResponseSchema, recordPriceResponse, shouldAskPrice } from "../../services/teamPriceQuestion.js";

const p = prisma as any;

// Every stored event, so findFirst can answer the way the database would.
let events: Array<{ type: string; metadata: Record<string, unknown> }> = [];

function matches(where: any, e: { type: string; metadata: Record<string, unknown> }): boolean {
  if (where.type !== e.type) return false;
  const conds = [where.metadata, ...(where.AND ?? []).map((a: any) => a.metadata)].filter(Boolean);
  return conds.every((c: any) => e.metadata[c.path.replace("$.", "")] === c.equals);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-02T10:00:00Z"));
  events = [];
  p.appEvent.findFirst.mockImplementation(async ({ where }: any) => events.find((e) => matches(where, e)) ?? null);
  p.appEvent.create.mockImplementation(async ({ data }: any) => {
    events.push({ type: data.type, metadata: data.metadata });
    return {};
  });
});

afterEach(() => vi.useRealTimers());

describe("price question", () => {
  it("is asked until someone in the org answers, then never again", async () => {
    expect(await shouldAskPrice("org-1")).toBe(true);
    expect(
      await recordPriceResponse({ orgId: "org-1", userId: "u-1", via: "portal", answer: "gbp_4", comment: "  per driver  " })
    ).toBe("recorded");
    expect(events[0]).toEqual({
      type: "team.price_answer",
      metadata: { orgId: "org-1", answer: "gbp_4", comment: "per driver", via: "portal", month: "2026-11" },
    });
    expect(await shouldAskPrice("org-1")).toBe(false);

    // A second admin, or the email link, cannot add a second answer.
    expect(await recordPriceResponse({ orgId: "org-1", userId: null, via: "email_link", answer: "gbp_2" })).toBe(
      "already_answered"
    );
    expect(events.filter((e) => e.type === "team.price_answer")).toHaveLength(1);

    // Next month too.
    vi.setSystemTime(new Date("2026-12-02T10:00:00Z"));
    expect(await shouldAskPrice("org-1")).toBe(false);
    // Other orgs are unaffected.
    expect(await shouldAskPrice("org-2")).toBe(true);
  });

  it("a skip hides it for the rest of the month and lets it come back next month", async () => {
    expect(await recordPriceResponse({ orgId: "org-1", userId: null, via: "email_link", skip: true })).toBe("skipped");
    expect(events[0]).toEqual({ type: "team.price_skipped", metadata: { orgId: "org-1", month: "2026-11", via: "email_link" } });
    expect(await shouldAskPrice("org-1")).toBe(false);

    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    expect(await shouldAskPrice("org-1")).toBe(true);
    expect(await recordPriceResponse({ orgId: "org-1", userId: "u-1", via: "portal", answer: "would_not_pay" })).toBe(
      "recorded"
    );
    expect(await shouldAskPrice("org-1")).toBe(false);
  });

  it("an empty comment is stored as null", async () => {
    await recordPriceResponse({ orgId: "org-1", userId: null, via: "email_link", answer: "gbp_6_plus", comment: "   " });
    expect(events[0].metadata.comment).toBeNull();
  });

  it("the request body needs an answer from the list, or a skip", () => {
    expect(priceResponseSchema.safeParse({}).success).toBe(false);
    expect(priceResponseSchema.safeParse({ answer: "gbp_10" }).success).toBe(false);
    expect(priceResponseSchema.safeParse({ answer: "gbp_2" }).success).toBe(true);
    expect(priceResponseSchema.safeParse({ skip: true }).success).toBe(true);
    expect(priceResponseSchema.safeParse({ answer: "gbp_2", comment: "x".repeat(1001) }).success).toBe(false);
  });
});
