/**
 * EmSee help knowledge, trips_list and account_status.
 *
 * The question bank is the list of things drivers actually ask (support
 * inbox, feedback, missing-trip replies, app reviews), each pinned to the
 * written answer that covers it. A new kind of question should be added here
 * with an answer in services/assistantHelp.ts.
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
import { HELP_AREAS, HELP_ENTRIES, helpForArea, type HelpArea } from "../../services/assistantHelp.js";
import { ASSISTANT_TOOLS, runAssistantTool } from "../../services/assistantTools.js";
import { SYSTEM_PROMPT, plainAnswer } from "../../services/assistant.js";

const ME = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-10-09T12:00:00Z");

/** [what a driver asks, the area EmSee should open, the answer that covers it] */
export const QUESTION_BANK: [string, HelpArea, string][] = [
  ["What does this app actually do?", "getting_started", "what-it-does"],
  ["I've just downloaded it, what now?", "getting_started", "first-steps"],
  ["How do I switch to personal mode?", "getting_started", "work-personal-mode"],
  ["Can I use it if I'm employed, not self-employed?", "getting_started", "who-for"],
  ["What does 'You drive for' mean?", "getting_started", "you-drive-for"],
  ["I drive a company car, what do I pick?", "getting_started", "you-drive-for"],
  ["What are the green ticks at the top of settings?", "recording_trips", "settings-checks"],
  ["Is there an Android version?", "getting_started", "android"],
  ["Do I have to press anything to record a trip?", "recording_trips", "automatic-trips"],
  ["What's the Start Trip button for?", "recording_trips", "start-trip"],
  ["Why did my Start Trip end while I was waiting at the depot?", "recording_trips", "start-trip"],
  ["What's this 'Still on your trip?' message?", "recording_trips", "still-on-your-trip"],
  ["What's a shift and how is it graded?", "recording_trips", "shifts"],
  ["I'm on holiday, can I stop it recording for a week?", "recording_trips", "pause-recording"],
  ["How do I turn off automatic tracking?", "recording_trips", "turn-off-automatic"],
  ["Is it going to kill my battery?", "recording_trips", "battery"],
  ["My 20 minute wait split my trip in two", "missing_or_wrong_trips", "split-trip"],
  ["How long a stop before it starts a new trip?", "recording_trips", "journey-end"],
  ["How do I get rid of the lock screen thing?", "recording_trips", "live-activity"],
  ["What permissions does it need?", "recording_trips", "permissions"],
  ["Will it work in a tunnel or with no signal?", "recording_trips", "offline"],
  ["My trip from this morning isn't there", "missing_or_wrong_trips", "missing-trip"],
  ["Why do my trips show up hours later?", "missing_or_wrong_trips", "late-trip"],
  ["The distance on yesterday's trip is way off", "missing_or_wrong_trips", "wrong-distance"],
  ["It logged a trip while I was sat at home", "missing_or_wrong_trips", "phantom-trip"],
  ["It recorded my train journey", "missing_or_wrong_trips", "passenger"],
  ["My trip is still recording and I parked an hour ago", "missing_or_wrong_trips", "trip-not-ending"],
  ["My trips aren't on the website", "missing_or_wrong_trips", "web-missing"],
  ["How do I mark a trip as business?", "managing_trips", "classify"],
  ["Does driving to the depot count as business?", "managing_trips", "what-is-business"],
  ["I forgot to track a trip, can I add it?", "managing_trips", "add-past-trip"],
  ["How do I change the time on a trip?", "managing_trips", "edit-trip"],
  ["Can I join two trips together?", "managing_trips", "merge-trips"],
  ["How do I split a trip in two?", "managing_trips", "split-a-trip"],
  ["How do I delete a trip?", "managing_trips", "delete-trip"],
  ["How do I tag a trip as Amazon Flex?", "managing_trips", "platform-tag"],
  ["Can I see miles per client?", "managing_trips", "projects"],
  ["My employer wants odometer readings", "managing_trips", "odometer"],
  ["Can it mark my work trips automatically?", "managing_trips", "auto-classify"],
  ["What's the mileage rate this year?", "tax_and_claims", "rates"],
  ["Why are some trips at 45p?", "tax_and_claims", "rates"],
  ["Is the mileage claim money I get paid?", "tax_and_claims", "claim-meaning"],
  ["Can I claim fuel as well as mileage?", "tax_and_claims", "claim-meaning"],
  ["How do I fill in my tax return with this?", "tax_and_claims", "sa-wizard"],
  ["Does MileClear submit my tax return?", "tax_and_claims", "sa-wizard"],
  ["How do I send my mileage to my accountant?", "tax_and_claims", "exports"],
  ["Can my accountant log in?", "tax_and_claims", "accountant-access"],
  ["How is my tax estimate worked out?", "tax_and_claims", "tax-estimate"],
  ["When do I pay my tax bill?", "tax_and_claims", "payment-plan"],
  ["This is my first tax return, help", "tax_and_claims", "first-return"],
  ["My boss pays 30p a mile, can I claim the rest?", "tax_and_claims", "employee"],
  ["I have a full-time job too", "tax_and_claims", "other-income"],
  ["Uber sent my earnings to HMRC, how do I check them?", "tax_and_claims", "hmrc-check"],
  ["My insurer wants proof of my business miles", "tax_and_claims", "certificate"],
  ["Is MileClear HMRC approved?", "tax_and_claims", "hmrc-approved"],
  ["Does it do Making Tax Digital?", "tax_and_claims", "mtd"],
  ["When does the tax year end?", "tax_and_claims", "tax-year"],
  ["How do I add my Deliveroo earnings?", "money", "earnings"],
  ["How do I add a parking receipt?", "money", "expenses"],
  ["Can I just screenshot my Uber earnings?", "money", "snap-statement"],
  ["Can I upload my Amazon Flex earnings file?", "money", "csv-import"],
  ["Can it read my bank?", "money", "bank"],
  ["Can I invoice a client?", "money", "invoices"],
  ["Do I need to log fuel?", "money", "fuel"],
  ["I got a parking ticket, can the app prove where I was?", "money", "ticket-defender"],
  ["Does it know about ULEZ charges?", "money", "caz"],
  ["How do I add my van?", "vehicles_and_places", "add-vehicle"],
  ["Will it remind me when my MOT is due?", "vehicles_and_places", "mot-reminders"],
  ["How do I save my home address?", "vehicles_and_places", "saved-places"],
  ["How do I set my working hours?", "vehicles_and_places", "work-schedule"],
  ["What do I get with Pro?", "pro_and_billing", "free-vs-pro"],
  ["Is tracking free?", "pro_and_billing", "free-vs-pro"],
  ["How much is Pro?", "pro_and_billing", "price"],
  ["How do I cancel my subscription?", "pro_and_billing", "cancel"],
  ["I paid but it still says free", "pro_and_billing", "restore"],
  ["How do I get Pro for free?", "pro_and_billing", "refer"],
  ["My company uses MileClear, am I Pro?", "pro_and_billing", "team-pro"],
  ["I logged in and all my trips are gone", "account_and_app", "sign-in"],
  ["How do I change my email address?", "account_and_app", "change-email"],
  ["How do I delete my account?", "account_and_app", "delete-account"],
  ["Can I download everything you hold about me?", "account_and_app", "my-data"],
  ["Can I use it on my laptop?", "account_and_app", "website"],
  ["How do I update the app?", "account_and_app", "updates"],
  ["How do I speak to someone?", "account_and_app", "contact"],
  ["Can I put a password on the app?", "account_and_app", "app-lock"],
  ["Stop sending me emails", "account_and_app", "emails"],
  ["What can you do?", "account_and_app", "emsee"],
  ["Is there a group for drivers?", "account_and_app", "community"],
  ["Who can see my trips?", "account_and_app", "privacy"],
  ["Where are my stats?", "insights_and_alerts", "insights"],
  ["How do I see my monthly summary?", "insights_and_alerts", "recaps"],
  ["What's my streak?", "insights_and_alerts", "achievements"],
  ["Too many notifications, how do I turn some off?", "insights_and_alerts", "notifications"],
  ["Where's the cheapest fuel near me?", "insights_and_alerts", "fuel-prices"],
  ["What are road alerts?", "insights_and_alerts", "road-alerts"],
  ["How do I compare to other drivers?", "insights_and_alerts", "benchmarks"],
];

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
    for (const [question, area, id] of QUESTION_BANK) {
      const entry = byId.get(id);
      expect(entry, `${question} -> ${id}`).toBeDefined();
      expect(entry!.area, question).toBe(area);
    }
    // Every written answer is reachable from at least one real question.
    const used = new Set(QUESTION_BANK.map(([, , id]) => id));
    for (const e of HELP_ENTRIES) expect(used.has(e.id), `no bank question for ${e.id}`).toBe(true);
  });

  it("keeps to the house wording rules", () => {
    for (const e of HELP_ENTRIES) {
      const text = `${e.q} ${e.a}`;
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
    expect(text).toMatch(/test service only/); // MTD is sandbox only
  });
});

describe("mileclear_help tool", () => {
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
    const props = (tool.input_schema as unknown as { properties: { area: { enum: readonly string[] } } }).properties;
    expect([...props.area.enum]).toEqual([...HELP_AREAS]);
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
