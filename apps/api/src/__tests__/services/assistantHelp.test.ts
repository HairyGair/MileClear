/**
 * EmSee help knowledge, trips_list and account_status.
 *
 * The question bank (helpQuestionBank.ts) is the list of things drivers
 * actually ask, each pinned to the written answer that covers it. A new kind
 * of question goes there, with an answer in packages/shared/src/data/help.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    vehicle: { findMany: vi.fn(), count: vi.fn() },
    savedLocation: { count: vi.fn() },
    user: { findUnique: vi.fn() },
    orgMembership: { findFirst: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma.js";
import { HELP_AREAS, HELP_ENTRIES, helpForArea, searchHelp } from "../../services/assistantHelp.js";
import { QUESTION_BANK } from "./helpQuestionBank.js";
import { ASSISTANT_TOOLS, runAssistantTool } from "../../services/assistantTools.js";
import { SYSTEM_PROMPT, plainAnswer } from "../../services/assistant.js";

const ME = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-10-09T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.trip.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.trip.count).mockResolvedValue(0 as never);
  vi.mocked(prisma.vehicle.count).mockResolvedValue(1 as never);
  vi.mocked(prisma.savedLocation.count).mockResolvedValue(2 as never);
  vi.mocked(prisma.orgMembership.findFirst).mockResolvedValue(null as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    isPremium: true,
    premiumExpiresAt: new Date("2026-11-01T10:00:00Z"),
    referralProUntil: null,
    workType: "gig",
    dashboardMode: "work",
    createdAt: new Date("2026-05-01T10:00:00Z"),
  } as never);
});

describe("help knowledge", () => {
  it("has written answers for every area, with unique ids", () => {
    for (const area of HELP_AREAS) expect(helpForArea(area).answers.length, area).toBeGreaterThanOrEqual(4);
    const ids = HELP_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every question in the bank, in the area EmSee would open", () => {
    const byId = new Map(HELP_ENTRIES.map((e) => [e.id, e]));
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(120);
    for (const { q, area, id } of QUESTION_BANK) {
      const entry = byId.get(id);
      expect(entry, `${q} -> ${id}`).toBeDefined();
      expect(entry!.area, q).toBe(area);
    }
    // Every written answer is reachable from at least one real question.
    const used = new Set(QUESTION_BANK.map((b) => b.id));
    for (const e of HELP_ENTRIES) expect(used.has(e.id), `no bank question for ${e.id}`).toBe(true);
  });

  it("finds the right answer for every bank question in the top 3 matches", () => {
    const misses: string[] = [];
    for (const { q, id } of QUESTION_BANK) {
      const ids = searchHelp(q, 3).map((m) => HELP_ENTRIES.find((e) => e.q === m.q)?.id);
      if (!ids.includes(id)) misses.push(`${q} -> ${id} (got ${ids.join(", ")})`);
    }
    expect(misses).toEqual([]);
  });

  it("each bank question's expected facts are in its written answer", () => {
    // The live eval checks EmSee's answer against `expect`; the written answer
    // must carry those facts first (either the main text or the Android one).
    const byId = new Map(HELP_ENTRIES.map((e) => [e.id, e]));
    for (const b of QUESTION_BANK) {
      const e = byId.get(b.id)!;
      const text = `${e.q} ${e.a} ${e.android ?? ""}`;
      for (const re of b.expect) expect(text, `${b.q} -> ${b.id} needs ${re}`).toMatch(re);
      for (const re of b.reject ?? []) expect(text, `${b.q} -> ${b.id} must not say ${re}`).not.toMatch(re);
    }
  });

  it("keeps to the house wording rules", () => {
    for (const e of HELP_ENTRIES) {
      const text = `${e.q} ${e.a} ${e.android ?? ""}`;
      expect(text, e.id).not.toMatch(/—|–/); // no em or en dashes
      expect(text, e.id).not.toMatch(/HMRC[- ](ready|approved|compliant|recognised|recognized|accepted)/i);
      expect(text, e.id).not.toMatch(/HMRC accepts|submits? (your|the) (tax )?return|files? (your|the) return for you/i);
      expect(text, e.id).not.toMatch(/\b(color|center|organize|recognize)\b/i); // UK spelling
      expect(e.a.length, e.id).toBeLessThan(900);
    }
  });

  it("states the current rates and the free/Pro split that the rest of the app uses", () => {
    const text = HELP_ENTRIES.map((e) => e.a).join(" ");
    expect(text).toMatch(/55p a mile for the first 10,000/);
    expect(text).toMatch(/45p and 25p/);
    expect(text).toMatch(/24p a mile/);
    expect(text).toMatch(/£4\.99 a month/);
    expect(text).toMatch(/1 vehicle and 2 saved places/);
    expect(text).toMatch(/send their quarterly updates to HMRC from Tax > Your tax details > Quarterly updates/); // MTD quarterly updates are live
    expect(text).toMatch(/end-of-year tax return isn't in MileClear yet/); // the final declaration is not built
    expect(text).not.toMatch(/\btest (version|service)\b/i);
    expect(text).not.toMatch(/Show Phantom|Data Quality|avatar menu|Work & Tax|Tax exports/i); // retired screens
  });
});

describe("mileclear_help tool", () => {
  it("finds answers from the driver's own words", async () => {
    const r = await runAssistantTool(ME, "mileclear_help", { question: "how do i stop it tracking while im on holiday" }, NOW);
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.content);
    expect(out.best_matches[0].q).toMatch(/pause/i);
    expect(out.areas).toBeDefined();
  });

  it("needs a question or an area", async () => {
    const r = await runAssistantTool(ME, "mileclear_help", {}, NOW);
    expect(r.ok).toBe(false);
  });

  it("returns one area's answers and the other areas to try", async () => {
    const r = await runAssistantTool(ME, "mileclear_help", { area: "pro_and_billing" }, NOW);
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.content);
    expect(out.answers.some((a: { q: string }) => /cancel/i.test(a.q))).toBe(true);
    expect(Object.keys(out.other_areas)).not.toContain("pro_and_billing");
    expect(Object.keys(out.other_areas)).toHaveLength(HELP_AREAS.length - 1);
  });

  it("rejects an unknown area", async () => {
    const r = await runAssistantTool(ME, "mileclear_help", { area: "weather" }, NOW);
    expect(r.ok).toBe(false);
  });

  it("is registered with the same areas the knowledge has", () => {
    const tool = ASSISTANT_TOOLS.find((t) => t.name === "mileclear_help")!;
    const props = (tool.input_schema as unknown as { properties: { area: { enum: readonly string[] }; question: object } }).properties;
    expect([...props.area.enum]).toEqual([...HELP_AREAS]);
    expect(props.question).toBeDefined();
  });

  it("is named in the system prompt, with the rule against guessing", () => {
    expect(SYSTEM_PROMPT).toMatch(/mileclear_help/);
    expect(SYSTEM_PROMPT).toMatch(/Never guess a menu path or invent a feature/);
    expect(SYSTEM_PROMPT).toMatch(/trips_list/);
    expect(SYSTEM_PROMPT).toMatch(/account_status/);
  });
});

describe("trips_list tool", () => {
  it("lists the driver's own trips with UK times and no places", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      {
        startedAt: new Date("2026-10-08T07:05:00Z"),
        endedAt: new Date("2026-10-08T07:40:00Z"),
        distanceMiles: 12.34,
        classification: "unclassified",
        platformTag: "amazon_flex",
        isManualEntry: false,
      },
    ] as never);
    const r = await runAssistantTool(ME, "trips_list", { from: "2026-10-08", to: "2026-10-08" }, NOW);
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.content);
    expect(out.trips[0]).toMatchObject({ day: "8 Oct 2026", start: "08:05", end: "08:40", miles: "12.3 mi", classification: "not sorted yet" });
    const call = vi.mocked(prisma.trip.findMany).mock.calls[0][0] as { where: { userId: string }; select: object };
    expect(call.where.userId).toBe(ME);
    for (const k of Object.keys(call.select)) expect(k).not.toMatch(/Lat$|Lng$|address|coordinates|notes/i);
    expect(r.period).toBe("8 Oct 2026");
  });

  it("refuses more than 7 days at once", async () => {
    const r = await runAssistantTool(ME, "trips_list", { from: "2026-10-01", to: "2026-10-08" }, NOW);
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/at most 7 days/);
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
  });
});

describe("account_status tool", () => {
  it("reports Pro, limits and trips to sort for this driver only", async () => {
    vi.mocked(prisma.trip.count).mockResolvedValue(5 as never);
    const r = await runAssistantTool(ME, "account_status", {}, NOW);
    expect(r.ok).toBe(true);
    const out = JSON.parse(r.content);
    expect(out.pro).toMatchObject({ active: true, from: "their own subscription", until: "1 Nov 2026" });
    expect(out.vehicles).toEqual({ count: 1, free_plan_limit: 1 });
    expect(out.saved_places).toEqual({ count: 2, free_plan_limit: 2 });
    expect(out.trips_not_sorted_yet).toBe(5);
    for (const c of vi.mocked(prisma.trip.count).mock.calls) expect((c[0] as { where: { userId: string } }).where.userId).toBe(ME);
    expect((vi.mocked(prisma.user.findUnique).mock.calls[0][0] as { where: { id: string } }).where.id).toBe(ME);
  });

  it("takes no input, so a model cannot ask about someone else", async () => {
    const r = await runAssistantTool(ME, "account_status", { userId: "someone-else" }, NOW);
    expect(r.ok).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("plainAnswer", () => {
  it("removes markdown and dashes the app would show as symbols", () => {
    expect(plainAnswer("Tap **I've Arrived** to save.")).toBe("Tap I've Arrived to save.");
    expect(plainAnswer("## Steps\n1. Open it")).toBe("Steps\n1. Open it");
    expect(plainAnswer("Fuel is included \u2014 you can't claim it")).toBe("Fuel is included, you can't claim it");
    expect(plainAnswer("- a list line stays")).toBe("- a list line stays");
    expect(plainAnswer("about 2\u20134% a shift")).toBe("about 2 to 4% a shift");
  });
});
