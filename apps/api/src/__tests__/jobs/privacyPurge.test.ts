import { describe, it, expect, vi, beforeEach } from "vitest";

const deleteMany = {
  refreshToken: vi.fn(),
  verificationCode: vi.fn(),
  passwordResetToken: vi.fn(),
  routeCache: vi.fn(),
};
vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    refreshToken: { deleteMany: (a: unknown) => deleteMany.refreshToken(a) },
    verificationCode: { deleteMany: (a: unknown) => deleteMany.verificationCode(a) },
    passwordResetToken: { deleteMany: (a: unknown) => deleteMany.passwordResetToken(a) },
    routeCache: { deleteMany: (a: unknown) => deleteMany.routeCache(a) },
  },
}));

import { privacyPurgeCutoffs, runPrivacyPurgeJob } from "../../jobs/privacyPurge.js";

describe("privacy purge", () => {
  beforeEach(() => {
    for (const fn of Object.values(deleteMany)) fn.mockReset().mockResolvedValue({ count: 0 });
  });

  it("keeps a day of grace on tokens and 90 days on cached routes", () => {
    const now = new Date("2026-10-11T12:00:00Z");
    const c = privacyPurgeCutoffs(now);
    expect(c.tokensExpiredBefore.toISOString()).toBe("2026-10-10T12:00:00.000Z");
    expect(c.routesIdleSince.toISOString()).toBe("2026-07-13T12:00:00.000Z");
  });

  it("deletes only expired tokens and codes, and only idle routes", async () => {
    const now = new Date("2026-10-11T12:00:00Z");
    const { tokensExpiredBefore, routesIdleSince } = privacyPurgeCutoffs(now);
    await runPrivacyPurgeJob(now);

    const tokenWhere = { where: { expiresAt: { lt: tokensExpiredBefore } } };
    expect(deleteMany.refreshToken).toHaveBeenCalledWith(tokenWhere);
    expect(deleteMany.verificationCode).toHaveBeenCalledWith(tokenWhere);
    expect(deleteMany.passwordResetToken).toHaveBeenCalledWith(tokenWhere);
    expect(deleteMany.routeCache).toHaveBeenCalledWith({
      where: {
        OR: [
          { lastHitAt: null, computedAt: { lt: routesIdleSince } },
          { lastHitAt: { lt: routesIdleSince } },
        ],
      },
    });
  });
});
