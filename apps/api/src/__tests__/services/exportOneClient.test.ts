/**
 * One-client trip reports (driver feedback, 23 Oct 2026: "I use my car for
 * more than one business and therefore mileage is charged to different
 * clients"). The CSV and Trip Report take a Project / client. Synthetic data
 * only.
 *
 * What must hold:
 *  - only that client's trips, matched by projectLabelKey (case and spaces
 *    don't matter), the same rule Miles by project groups by;
 *  - the 10,000-mile higher rate is the driver's whole year, so a one-client
 *    report prices each trip exactly as the full report does and never gives
 *    each client its own 10,000;
 *  - the one-client PDF names the client and drops the "Business miles by
 *    project" table, which would only repeat the boxes at the top.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    trip: { findMany: vi.fn(), groupBy: vi.fn(), count: vi.fn() },
    $queryRaw: vi.fn(),
    vehicle: { findFirst: vi.fn() },
    earning: { findMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("../../services/odometer.js", () => ({
  odometerForExportTrips: vi.fn(async () => new Map()),
}));
vi.mock("../../services/postcodeLookup.js", () => ({
  postcodesFor: vi.fn(async (pts: unknown[]) => pts.map(() => null)),
}));

import { prisma } from "../../lib/prisma.js";
import { fetchExportTrips } from "../../services/export-data.js";
import {
  generateTripsCsv,
  generateTripsPdf,
  ONE_CLIENT_ALLOWANCE_NOTE,
  ONE_CLIENT_MOTORBIKE_NOTE,
  oneClientNote,
  reportProjectRows,
} from "../../services/export.js";
import {
  loadProjectLabels,
  noProjectLabelTripWhere,
  projectLabelTripWhere,
  resolveProjectLabel,
} from "../../services/projectTotals.js";
import { labelCollisionCount, labelQueryRaw, type LabelMockOptions, type SpellingRow } from "../helpers/projectLabels.js";

const USER = "00000000-0000-0000-0000-0000000000d1";
const CAR = { id: "va", make: "Nissan", model: "Qashqai", vehicleType: "car", registrationPlate: "AB12 CDE", isPrimary: true };

function trip(id: string, day: string, miles: number, classification: string, projectLabel: string | null) {
  return {
    id,
    vehicleId: CAR.id,
    vehicle: { make: CAR.make, model: CAR.model, vehicleType: CAR.vehicleType, providedByOthers: false },
    startedAt: new Date(`${day}T09:00:00Z`),
    endedAt: new Date(`${day}T10:00:00Z`),
    distanceMiles: miles,
    classification,
    startAddress: "A",
    endAddress: "B",
    startLat: 51.5, startLng: -0.1, endLat: 51.6, endLng: -0.2,
    platformTag: null,
    businessPurpose: null,
    projectLabel,
  };
}

// 2026-27: 6,000 business miles for NHS Trust, then 6,000 for Private
// practice, so the driver crosses 10,000 part way through the second client.
const TRIPS = [
  trip("t1", "2026-05-01", 6000, "business", "NHS Trust"),
  trip("t2", "2026-06-01", 6000, "business", "Private practice"),
  trip("t3", "2026-07-01", 100, "business", " nhs  trust "), // same client, typed differently
  trip("t4", "2026-08-01", 50, "personal", null),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.trip.findMany).mockResolvedValue(TRIPS as never);
  vi.mocked(prisma.earning.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ fullName: "Sam", displayName: null, email: "s@example.com" } as never);
  vi.mocked(prisma.vehicle.findFirst).mockResolvedValue(CAR as never);
});

describe("resolveProjectLabel", () => {
  const SPELLINGS: SpellingRow[] = [
    { label: "NHS  Trust", trips: 1 },
    { label: "NHS Trust", trips: 4 },
    { label: "Private practice", trips: 2 },
  ];
  function useLabels(rows: SpellingRow[], opts: LabelMockOptions = {}) {
    vi.mocked(prisma.$queryRaw).mockImplementation(labelQueryRaw(USER, rows, opts) as never);
    vi.mocked(prisma.trip.count).mockImplementation((async (args: { where?: Record<string, unknown> }) =>
      labelCollisionCount(args, rows, opts)) as never);
  }
  beforeEach(() => useLabels(SPELLINGS));

  it("finds every stored spelling of the client and names it by the most used", async () => {
    const match = await resolveProjectLabel(USER, "  nhs trust");
    expect(match).toEqual({
      key: "nhs trust",
      label: "NHS Trust",
      spellings: ["NHS  Trust", "NHS Trust"],
      where: { projectLabel: { in: ["NHS  Trust", "NHS Trust"] } },
    });
    expect(vi.mocked(prisma.$queryRaw).mock.calls[0].slice(1)).toContain(USER);
    expect(vi.mocked(prisma.trip.count).mock.calls[0][0]).toMatchObject({ where: { userId: USER } });
  });

  it("is null for a client none of the driver's trips has, or a blank label", async () => {
    expect(await resolveProjectLabel(USER, "Acme")).toBeNull();
    expect(await resolveProjectLabel(USER, "   ")).toBeNull();
    expect(await resolveProjectLabel("someone-else", "NHS Trust")).toBeNull();
  });

  it("keeps accent-only spellings apart, and goes byte-exact when the database would mix them", async () => {
    useLabels([{ label: "Cafe", trips: 2 }, { label: "Café", trips: 3 }], { accentTwins: 3, ids: ["a", "b"] });
    const plain = await resolveProjectLabel(USER, "cafe");
    expect(plain?.label).toBe("Cafe");
    expect(plain?.where).toEqual({ id: { in: ["a", "b"] } });
    const accented = await resolveProjectLabel(USER, "CAFÉ");
    expect(accented?.label).toBe("Café");
  });

  it("loadProjectLabels lists accent-only spellings as two clients, beyond 30", async () => {
    const many: SpellingRow[] = [
      { label: "Cafe", trips: 1 },
      { label: "Café", trips: 1 },
      ...Array.from({ length: 40 }, (_, i) => ({ label: `Client ${i}`, trips: 1 })),
    ];
    useLabels(many);
    const labels = await loadProjectLabels(USER);
    expect(labels).toContain("Cafe");
    expect(labels).toContain("Café");
    expect(labels).toHaveLength(42);
  });

  it("the filters: the match's own where, and no client covers blank labels", () => {
    const where = { projectLabel: { in: ["NHS Trust"] } };
    expect(projectLabelTripWhere({ where })).toBe(where);
    expect(noProjectLabelTripWhere()).toEqual({ OR: [{ projectLabel: null }, { projectLabel: "" }] });
  });
});

describe("fetchExportTrips with a projectKey", () => {
  it("keeps only that client's trips, however the label was typed", async () => {
    const nhs = await fetchExportTrips({ userId: USER, taxYear: "2026-27", projectKey: "nhs trust" });
    expect(nhs.map((r) => r.distanceMiles)).toEqual([6000, 100]);
    const none = await fetchExportTrips({ userId: USER, taxYear: "2026-27", projectKey: "acme" });
    expect(none).toEqual([]);
  });

  it("prices each trip as the full report does: one 10,000 per driver, not per client", async () => {
    const all = await fetchExportTrips({ userId: USER, taxYear: "2026-27" });
    const priv = await fetchExportTrips({ userId: USER, taxYear: "2026-27", projectKey: "private practice" });

    // The second client's trip straddles the driver's 10,000: 4,000 at 55p, 2,000 at 25p.
    expect(priv[0].deductionPence).toBe(4000 * 55 + 2000 * 25);
    expect(priv[0]).toEqual(all[1]);

    // NHS Trust's later trip is past the 10,000, so it is at 25p.
    const nhs = await fetchExportTrips({ userId: USER, taxYear: "2026-27", projectKey: "nhs trust" });
    expect(nhs[1].hmrcRatePence).toBe(25);

    // The one-client reports add up to the full report's business trips.
    const sum = (rows: { deductionPence: number }[]) => rows.reduce((s, r) => s + r.deductionPence, 0);
    expect(sum(nhs) + sum(priv)).toBe(sum(all));
  });

  it("combines with one car: both must match", async () => {
    vi.mocked(prisma.trip.findMany).mockResolvedValue([
      ...TRIPS,
      { ...trip("t5", "2026-09-01", 10, "business", "NHS Trust"), vehicleId: "vb", vehicle: { make: "Ford", model: "Fiesta", vehicleType: "car", providedByOthers: false } },
    ] as never);
    const rows = await fetchExportTrips({ userId: USER, taxYear: "2026-27", projectKey: "nhs trust", vehicleId: "vb" });
    expect(rows.map((r) => r.distanceMiles)).toEqual([10]);
  });
});

describe("the one-client documents", () => {
  it("the CSV has only that client's rows", async () => {
    const csv = await generateTripsCsv(USER, { taxYear: "2026-27", project: { key: "private practice", label: "Private practice" } });
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(1 + 1);
    expect(csv).toContain("Private practice");
    expect(csv).not.toContain("NHS");
  });

  it("the PDF is titled with the client", async () => {
    const one = await generateTripsPdf(USER, { taxYear: "2026-27", project: { key: "nhs trust", label: "NHS Trust" } });
    expect(one.subarray(0, 4).toString()).toBe("%PDF");
    expect(one.toString("latin1")).toContain("(Trip Report: NHS Trust)");
    const full = await generateTripsPdf(USER, { taxYear: "2026-27" });
    expect(full.toString("latin1")).toContain("(Trip Report)");
  });

  it("with a car too, the title names both", async () => {
    const pdf = await generateTripsPdf(USER, {
      taxYear: "2026-27",
      project: { key: "nhs trust", label: "NHS Trust" },
      vehicle: { ...CAR, registrationPlate: null },
    });
    // The middle dot makes PDFKit store the title as UTF-16.
    const utf16 = (s: string) => "þÿ" + [...s].map((c) => "\u0000" + c).join("");
    expect(pdf.toString("latin1")).toContain(utf16("Trip Report: NHS Trust · Nissan Qashqai"));
  });

  it("a one-client report has no Business miles by project table; the full report keeps it", async () => {
    const all = await fetchExportTrips({ userId: USER, taxYear: "2026-27" });
    expect(reportProjectRows(all, undefined).map((r) => r.label)).toEqual(["NHS Trust", "Private practice"]);
    const nhs = await fetchExportTrips({ userId: USER, taxYear: "2026-27", projectKey: "nhs trust" });
    expect(reportProjectRows(nhs, { key: "nhs trust", label: "NHS Trust" })).toEqual([]);
  });

  it("the note says the 10,000 is shared across clients, in plain words", () => {
    expect(ONE_CLIENT_ALLOWANCE_NOTE).toContain("first 10,000 business miles");
    expect(ONE_CLIENT_ALLOWANCE_NOTE).toContain("not 10,000 per client");
    expect(ONE_CLIENT_ALLOWANCE_NOTE).toContain("this client's share");
    expect(oneClientNote("car")).toBe(ONE_CLIENT_ALLOWANCE_NOTE);
    expect(oneClientNote(undefined)).toBe(ONE_CLIENT_ALLOWANCE_NOTE);
    expect(oneClientNote("motorbike")).toBe(ONE_CLIENT_MOTORBIKE_NOTE);
    for (const note of [ONE_CLIENT_ALLOWANCE_NOTE, ONE_CLIENT_MOTORBIKE_NOTE]) {
      expect(note).not.toContain(String.fromCharCode(0x2014)); // no em dash
      expect(note).not.toContain("HMRC");
    }
  });
});
