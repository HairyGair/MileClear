/**
 * GET /trips and GET /trips/summary with a client filter (23 Oct 2026): one
 * Project / client matched however it was typed, trips with no client, and
 * the free-text search reaching the Project / client. The summary takes the
 * same filter so the Trips tab's stats card agrees with the list. Synthetic
 * data only.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../helpers/build-app.js";
import { makeAccessToken } from "../helpers/tokens.js";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    vehicle: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    appEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../services/mileage.js", () => ({
  upsertMileageSummary: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/appEvents.js", () => ({ logEvent: vi.fn() }));

import { tripRoutes } from "../../routes/trips/index.js";
import { prisma } from "../../lib/prisma.js";
import {
  isLabelCollisionCount,
  labelCollisionCount,
  labelQueryRaw,
  type LabelMockOptions,
  type SpellingRow,
} from "../helpers/projectLabels.js";

const USER_ID = "00000000-0000-0000-0000-0000000000d3";
const auth = { authorization: `Bearer ${makeAccessToken(USER_ID)}` };

/** Stored spellings, byte for byte, as the spellings query returns them. */
const LABELS: SpellingRow[] = [
  { label: "NHS Trust", trips: 3 },
  { label: "NHS  Trust", trips: 1 },
  { label: "Private practice", trips: 2 },
];

async function createTestApp() {
  const app = await buildApp();
  await app.register(tripRoutes, { prefix: "/trips" });
  return app;
}

/** The where of the list's findMany (the list's count must use the same one). */
function listWhere(): Record<string, unknown> {
  const where = vi.mocked(prisma.trip.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
  const listCount = vi.mocked(prisma.trip.count).mock.calls.find((c) => !isLabelCollisionCount(c[0] as never));
  expect(listCount![0]!.where).toEqual(where);
  return where;
}

function useLabels(rows: SpellingRow[], opts: LabelMockOptions = {}) {
  vi.mocked(prisma.$queryRaw).mockImplementation(labelQueryRaw(USER_ID, rows, opts) as never);
  vi.mocked(prisma.trip.count).mockImplementation((async (args: { where?: Record<string, unknown> }) =>
    isLabelCollisionCount(args) ? labelCollisionCount(args, rows, opts) : 0) as never);
}

/** The where of the summary's classification groupBy (the second groupBy call). */
function summaryWhere(): Record<string, unknown> {
  const calls = vi.mocked(prisma.trip.groupBy).mock.calls;
  return (calls.find((c) => (c[0] as { by: string[] }).by[0] === "classification")![0] as { where: Record<string, unknown> }).where;
}

describe("trips: client filter", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(prisma.trip.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.trip.groupBy).mockResolvedValue([] as never);
    useLabels(LABELS);
    app = await createTestApp();
  });

  it("lists one client's trips by every stored spelling, scoped to the driver", async () => {
    const res = await app.inject({ method: "GET", url: "/trips?projectLabel=nhs%20trust", headers: auth });
    expect(res.statusCode).toBe(200);
    const where = listWhere();
    expect(where).toMatchObject({ userId: USER_ID, isPhantomTrip: false });
    expect(where.AND).toEqual([{ projectLabel: { in: ["NHS Trust", "NHS  Trust"] } }]);
    // The spellings lookup is for this driver only.
    expect(vi.mocked(prisma.$queryRaw).mock.calls[0].slice(1)).toContain(USER_ID);
  });

  it("accent-only spellings are separate clients, and the list stays exact for each", async () => {
    useLabels(
      [{ label: "Cafe", trips: 2 }, { label: "Café", trips: 3 }],
      // The database's accent-blind `in` for one also matches the other's trips.
      { accentTwins: 3, ids: ["t-cafe-1", "t-cafe-2"] }
    );
    const res = await app.inject({ method: "GET", url: "/trips?projectLabel=Cafe", headers: auth });
    expect(res.statusCode).toBe(200);
    // Not "nothing" (the old groupBy folded the two), and not both clients' trips.
    expect(listWhere().AND).toEqual([{ id: { in: ["t-cafe-1", "t-cafe-2"] } }]);
    const idsQuery = vi.mocked(prisma.$queryRaw).mock.calls.find((c) => String((c[0] as string[]).join("?")).includes("SELECT id"))!;
    expect(idsQuery.slice(1)).toContain(USER_ID);
  });

  it("a client none of the driver's trips has lists nothing, not an error", async () => {
    const res = await app.inject({ method: "GET", url: "/trips?projectLabel=Acme", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(0);
    expect(listWhere().AND).toEqual([{ projectLabel: { in: [] } }]);
  });

  it("noProjectLabel=true lists trips with no client, without a label lookup", async () => {
    const res = await app.inject({ method: "GET", url: "/trips?noProjectLabel=true", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(listWhere().AND).toEqual([{ OR: [{ projectLabel: null }, { projectLabel: "" }] }]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("refuses one client and no client together, and a blank or overlong label", async () => {
    const both = await app.inject({ method: "GET", url: "/trips?projectLabel=NHS&noProjectLabel=true", headers: auth });
    expect(both.statusCode).toBe(400);
    for (const q of ["projectLabel=", "projectLabel=%20%20", `projectLabel=${"x".repeat(101)}`, "noProjectLabel=yes"]) {
      const res = await app.inject({ method: "GET", url: `/trips?${q}`, headers: auth });
      expect(res.statusCode, q).toBe(400);
    }
    expect(prisma.trip.findMany).not.toHaveBeenCalled();
  });

  it("the search box also finds a trip by its Project / client, and keeps working with the client filter", async () => {
    await app.inject({ method: "GET", url: "/trips?q=NHS&noProjectLabel=false&projectLabel=Private%20practice", headers: auth });
    const where = listWhere();
    expect(where.OR).toContainEqual({ projectLabel: { contains: "NHS" } });
    expect(where.OR).toContainEqual({ startAddress: { contains: "NHS" } });
    expect(where.AND).toEqual([{ projectLabel: { in: ["Private practice"] } }]);
  });

  it("without a client filter the list is unchanged", async () => {
    await app.inject({ method: "GET", url: "/trips?classification=business", headers: auth });
    expect(listWhere().AND).toBeUndefined();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("the summary takes the same client filter, so the stats card agrees with the list", async () => {
    const res = await app.inject({ method: "GET", url: "/trips/summary?projectLabel=NHS%20Trust&classification=business", headers: auth });
    expect(res.statusCode).toBe(200);
    expect(summaryWhere()).toMatchObject({
      userId: USER_ID,
      AND: [{ projectLabel: { in: ["NHS Trust", "NHS  Trust"] } }],
    });

    vi.mocked(prisma.trip.groupBy).mockClear();
    await app.inject({ method: "GET", url: "/trips/summary?noProjectLabel=true", headers: auth });
    expect(summaryWhere().AND).toEqual([{ OR: [{ projectLabel: null }, { projectLabel: "" }] }]);

    const both = await app.inject({ method: "GET", url: "/trips/summary?projectLabel=NHS&noProjectLabel=true", headers: auth });
    expect(both.statusCode).toBe(400);
  });
});
