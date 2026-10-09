/**
 * Ask MileClear tools: every query is scoped to the driver id the route
 * passes in, inputs are validated before anything is queried, and nothing
 * location-shaped comes back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    earning: { findMany: vi.fn(), aggregate: vi.fn() },
    trip: { findMany: vi.fn() },
    expense: { findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    fuelLog: { findMany: vi.fn() },
    vehicle: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/taxSnapshot.js", () => ({
  buildTaxSnapshot: vi.fn(async () => ({
    filingDeadline: "2028-01-31T23:59:59.000Z",
    ytd: { grossEarningsPence: 500000, taxableProfitPence: 300000, estimatedTaxPence: 40000 },
  })),
}));

import { prisma } from "../../lib/prisma.js";
import {
  ASSISTANT_TOOLS,
  runAssistantTool,
  londonMidnight,
  londonDayKey,
  mondayOf,
} from "../../services/assistantTools.js";

const ME = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-10-04T12:00:00Z");

function allWhereUserIds(): unknown[] {
  const ids: unknown[] = [];
  const models = prisma as unknown as Record<string, Record<string, { mock?: { calls: unknown[][] } }>>;
  for (const model of Object.values(models)) {
    for (const fn of Object.values(model)) {
      for (const call of fn.mock?.calls ?? []) {
        const arg = call[0] as { where?: { userId?: unknown; id?: unknown } } | undefined;
        if (arg?.where) ids.push(arg.where.userId ?? arg.where.id);
      }
    }
  }
  return ids;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.earning.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.earning.aggregate).mockResolvedValue({ _sum: { amountPence: 0 }, _count: 0 } as never);
  vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.expense.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amountPence: 0 }, _count: 0 } as never);
  vi.mocked(prisma.expense.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.fuelLog.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.vehicle.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    workType: "self_employed",
    employerMileageRatePence: null,
    employerMileageRatePenceAfter10k: null,
  } as never);
});

describe("dates", () => {
  it("finds London midnight on both sides of the clock change", () => {
    expect(londonMidnight("2026-09-01").toISOString()).toBe("2026-08-31T23:00:00.000Z");
    expect(londonMidnight("2026-12-01").toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(londonDayKey(new Date("2026-08-31T23:30:00Z"))).toBe("2026-09-01");
  });

  it("weeks start on Monday", () => {
    expect(mondayOf("2026-10-04")).toBe("2026-09-28"); // a Sunday
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
  });
});

describe("scoping", () => {
  it("every tool queries only the driver id it is given", async () => {
    const range = { from: "2026-04-06", to: "2026-10-04" };
    const calls: [string, unknown][] = [
      ["earnings_summary", { ...range, group_by: "month" }],
      ["mileage_summary", { ...range, group_by: "week" }],
      ["expenses_summary", range],
      ["fuel_summary", range],
      ["best_worst_week", { ...range, metric: "earnings" }],
      ["best_worst_week", { ...range, metric: "business_miles" }],
      ["tax_year_figures", {}],
      ["can_i_claim", { item: "phone" }],
    ];
    for (const [name, input] of calls) {
      const r = await runAssistantTool(ME, name, input, NOW);
      expect(r.ok, `${name}: ${r.content}`).toBe(true);
    }
    const ids = allWhereUserIds();
    expect(ids.length).toBeGreaterThan(8);
    for (const id of ids) expect(id).toBe(ME);
  });

  it("rejects a user id supplied by the model, before any query", async () => {
    const r = await runAssistantTool(ME, "earnings_summary", {
      from: "2026-09-01",
      to: "2026-09-30",
      userId: "someone-else",
    }, NOW);
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(/Invalid input/);
    expect(prisma.earning.findMany).not.toHaveBeenCalled();
  });

  it("has no user id in any tool schema", () => {
    for (const t of ASSISTANT_TOOLS) {
      const props = Object.keys((t.input_schema as { properties: object }).properties);
      expect(props.some((p) => /user/i.test(p)), t.name).toBe(false);
      expect(t.input_schema.additionalProperties).toBe(false);
    }
  });

  it("never selects coordinates, addresses, routes or station names", async () => {
    await runAssistantTool(ME, "mileage_summary", { from: "2026-09-01", to: "2026-09-30" }, NOW);
    await runAssistantTool(ME, "fuel_summary", { from: "2026-09-01", to: "2026-09-30" }, NOW);
    const selects = [
      ...vi.mocked(prisma.trip.findMany).mock.calls,
      ...vi.mocked(prisma.fuelLog.findMany).mock.calls,
    ].map((c) => Object.keys((c[0] as { select: object }).select));
    for (const keys of selects) {
      for (const k of keys) expect(k).not.toMatch(/Lat$|Lng$|^latitude$|^longitude$|address|polyline|coordinates|station|notes/i);
    }
  });
});

describe("input validation", () => {
  it.each([
    [{ from: "2026-13-01", to: "2026-12-01" }, /real date/],
    [{ from: "2026-02-30", to: "2026-03-01" }, /real date/],
    [{ from: "2026-10-01", to: "2026-09-01" }, /on or before/],
    [{ from: "2022-01-01", to: "2026-01-02" }, /3 years/],
    [{ from: "2026-09-01" }, /to/],
    [{ from: "2026-09-01", to: "2026-09-30", platform: "bolt" }, /platform/],
    [{ from: "2026-09-01", to: "2026-09-30", group_by: "day" }, /group_by/],
  ])("earnings_summary rejects %j", async (input, msg) => {
    const r = await runAssistantTool(ME, "earnings_summary", input, NOW);
    expect(r.ok).toBe(false);
    expect(r.content).toMatch(msg);
    expect(prisma.earning.findMany).not.toHaveBeenCalled();
  });

  it("rejects a future or malformed tax year", async () => {
    expect((await runAssistantTool(ME, "tax_year_figures", { tax_year: "2030-31" }, NOW)).ok).toBe(false);
    expect((await runAssistantTool(ME, "tax_year_figures", { tax_year: "2026-28" }, NOW)).ok).toBe(false);
    expect((await runAssistantTool(ME, "tax_year_figures", { tax_year: "2026" }, NOW)).ok).toBe(false);
  });

  it("returns an error result for an unknown tool", async () => {
    const r = await runAssistantTool(ME, "delete_everything", {}, NOW);
    expect(r).toEqual({ ok: false, content: "Unknown tool: delete_everything", period: null });
  });
});

describe("figures", () => {
  it("adds up earnings by platform and month, in pence with formatted strings", async () => {
    vi.mocked(prisma.earning.findMany).mockResolvedValue([
      { platform: "uber", amountPence: 12345, periodStart: new Date("2026-09-02T00:00:00Z") },
      { platform: "uber", amountPence: 10000, periodStart: new Date("2026-09-20T00:00:00Z") },
      { platform: "deliveroo", amountPence: 5000, periodStart: new Date("2026-08-15T00:00:00Z") },
    ] as never);
    const r = await runAssistantTool(ME, "earnings_summary", { from: "2026-08-01", to: "2026-09-30", group_by: "month" }, NOW);
    const out = JSON.parse(r.content);
    expect(out.total).toEqual({ pence: 27345, formatted: "£273.45" });
    expect(out.byPlatform[0]).toMatchObject({ platform: "Uber / Uber Eats", pence: 22345 });
    expect(out.groups.map((g: { label: string }) => g.label)).toEqual(["Aug 2026", "Sep 2026"]);
    expect(r.period).toBe("1 Aug 2026 to 30 Sep 2026");
  });

  it("gives cars and vans one 10,000-mile threshold at that year's rate", async () => {
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([
      { id: "car", vehicleType: "car", isPrimary: true },
      { id: "van", vehicleType: "van", isPrimary: false },
    ] as never);
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      { distanceMiles: 8000, vehicleId: "car" },
      { distanceMiles: 4000, vehicleId: "van" },
    ] as never);
    const r = await runAssistantTool(ME, "tax_year_figures", { tax_year: "2025-26" }, NOW);
    const out = JSON.parse(r.content);
    // 2025-26: 10,000 at 45p + 2,000 at 25p = £4,500 + £500.
    expect(out.mileageAllowance.pence).toBe(500000);
    expect(out.isCurrentTaxYear).toBe(false);
    expect(out.estimateSoFar).toBeUndefined();
  });

  it("keeps the approved rates apart from an employer's rate (an employee's 40p is not 'the rate')", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      workType: "both",
      employerMileageRatePence: 40,
      employerMileageRatePenceAfter10k: 25,
    } as never);
    vi.mocked(prisma.vehicle.findMany).mockResolvedValue([{ id: "car", vehicleType: "car", isPrimary: true }] as never);
    const out = JSON.parse((await runAssistantTool(ME, "tax_year_figures", {}, NOW)).content);
    expect(out.mileageRates.approved.carAndVan).toMatch(/^55p a mile for the first 10,000.*25p after$/);
    expect(out.mileageRates.approved.motorbike).toBe("24p a mile");
    expect(out.mileageRates.employer.rate).toMatch(/^40p a mile/);
  });

  it("has no employer rate for a self-employed driver", async () => {
    const out = JSON.parse((await runAssistantTool(ME, "tax_year_figures", {}, NOW)).content);
    expect(out.mileageRates.approved.carAndVan).toMatch(/^55p/);
    expect(out.mileageRates.employer).toBeUndefined();
  });

  it("finds the best and worst week, leaving empty weeks out", async () => {
    vi.mocked(prisma.earning.findMany).mockResolvedValue([
      { amountPence: 30000, periodStart: new Date("2026-09-07T00:00:00Z") },
      { amountPence: 10000, periodStart: new Date("2026-09-08T00:00:00Z") },
      { amountPence: 5000, periodStart: new Date("2026-09-21T00:00:00Z") },
    ] as never);
    const out = JSON.parse(
      (await runAssistantTool(ME, "best_worst_week", { from: "2026-09-01", to: "2026-09-30", metric: "earnings" }, NOW)).content
    );
    expect(out.best).toMatchObject({ week: "Mon 7 Sep 2026 to Sun 13 Sep 2026", pence: 40000 });
    expect(out.worst).toMatchObject({ pence: 5000 });
    expect(out.weeksWithRecords).toBe(2);
  });

  it("answers 'can I claim my phone' with guidance and the driver's own phone expenses", async () => {
    vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amountPence: 8400 }, _count: 3 } as never);
    const out = JSON.parse((await runAssistantTool(ME, "can_i_claim", { item: "phone" }, NOW)).content);
    expect(out.found).toBe(true);
    expect(out.guidance).toMatch(/general guidance/i);
    expect(out.yourRecords).toMatchObject({ category: "Phone (Business %)", taxYear: "2026-27", pence: 8400, entries: 3 });
    expect(JSON.stringify(out)).not.toMatch(/[–—]/);
    const where = vi.mocked(prisma.expense.aggregate).mock.calls[0][0]!.where as { userId: string; category: string };
    expect(where).toMatchObject({ userId: ME, category: "phone" });
  });
});
