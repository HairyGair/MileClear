/**
 * trips_1 and shifts_1 mean the same as first_trip and first_shift, so they
 * are retired: never awarded, never listed, but never deleted. Prisma is
 * mocked: nothing touches a database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    achievement: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    trip: { count: vi.fn(), aggregate: vi.fn() },
    shift: { count: vi.fn() },
    earning: { aggregate: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../../lib/prisma.js";
import { checkAndAwardAchievements, getAchievements } from "../../services/gamification.js";

const db = prisma as unknown as {
  achievement: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  trip: { count: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
  shift: { count: ReturnType<typeof vi.fn> };
  earning: { aggregate: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("checkAndAwardAchievements", () => {
  it("awards first_trip and first_shift but not trips_1 or shifts_1", async () => {
    db.achievement.findMany.mockResolvedValueOnce([]).mockResolvedValue([]);
    db.trip.count.mockResolvedValue(1);
    db.shift.count.mockResolvedValue(1);
    db.trip.aggregate.mockResolvedValue({ _sum: { distanceMiles: 3 } });
    db.earning.aggregate.mockResolvedValue({ _sum: { amountPence: 0 } });
    db.$queryRaw.mockResolvedValue([]);
    db.achievement.createMany.mockResolvedValue({ count: 2 });

    await checkAndAwardAchievements("u1");

    const data = db.achievement.createMany.mock.calls[0][0].data as { type: string }[];
    const types = data.map((d) => d.type);
    expect(types).toContain("first_trip");
    expect(types).toContain("first_shift");
    expect(types).not.toContain("trips_1");
    expect(types).not.toContain("shifts_1");
  });
});

describe("getAchievements", () => {
  it("asks the database to leave retired badges out, without deleting them", async () => {
    db.achievement.findMany.mockResolvedValue([]);
    await getAchievements("u1");
    const where = db.achievement.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe("u1");
    expect(where.type.notIn).toEqual(expect.arrayContaining(["trips_1", "shifts_1"]));
    expect(db.achievement.deleteMany).not.toHaveBeenCalled();
  });
});
