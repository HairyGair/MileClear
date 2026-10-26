/**
 * Milesheet month-end nudge: when it may go, and what it says.
 * Pure functions plus the planner with prisma mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    orgMembership: { findMany: vi.fn() },
    appEvent: { findMany: vi.fn(), create: vi.fn() },
    trip: { groupBy: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));
vi.mock("../../lib/push.js", () => ({ sendPushNotifications: vi.fn() }));
vi.mock("../../services/email.js", () => ({ sendAdminEmail: vi.fn() }));

import {
  buildMonthEndNudge,
  clockMonth,
  inMonthEndWindow,
  londonClock,
  planMonthEndNudges,
  runTeamMonthEndNudgeJob,
  teamMonthEndEvent,
} from "../../jobs/teamMonthEndNudge.js";
import { prisma } from "../../lib/prisma.js";
import { sendPushNotifications } from "../../lib/push.js";
import { sendAdminEmail } from "../../services/email.js";

describe("window", () => {
  it("opens at 18:00 UK two days before the month ends", () => {
    // The clocks went back on 25 Oct 2026, so the 29th is on GMT.
    expect(inMonthEndWindow(londonClock(new Date("2026-10-29T17:59:00Z")))).toBe(false); // 17:59 GMT
    expect(inMonthEndWindow(londonClock(new Date("2026-10-29T18:00:00Z")))).toBe(true); // 18:00 GMT
    expect(inMonthEndWindow(londonClock(new Date("2026-09-28T17:00:00Z")))).toBe(true); // 18:00 BST, 28 of 30
    expect(inMonthEndWindow(londonClock(new Date("2026-10-28T19:00:00Z")))).toBe(false);
    expect(inMonthEndWindow(londonClock(new Date("2026-10-31T21:00:00Z")))).toBe(true); // 21:00 GMT, last day
  });

  it("follows each month's length, February included", () => {
    expect(inMonthEndWindow(londonClock(new Date("2027-02-26T18:30:00Z")))).toBe(true); // 26 of 28
    expect(inMonthEndWindow(londonClock(new Date("2026-11-28T18:30:00Z")))).toBe(true); // 28 of 30
    expect(inMonthEndWindow(londonClock(new Date("2026-11-27T18:30:00Z")))).toBe(false);
  });

  it("uses the UK month, not UTC, near midnight", () => {
    // 23:30 UTC on 31 Mar is 00:30 BST on 1 Apr.
    expect(clockMonth(londonClock(new Date("2027-03-31T23:30:00Z")))).toBe("2027-04");
  });
});

describe("wording", () => {
  it("names the day the month ends, the team and the count", () => {
    const m = buildMonthEndNudge(londonClock(new Date("2026-10-29T17:30:00Z")), "Maids Of Glory", 14);
    expect(m.title).toBe("October ends on Saturday");
    expect(m.body).toBe("Maids Of Glory approves your October business miles next. You have 14 trips to sort first.");
  });

  it("says tomorrow, tonight and 1 trip", () => {
    expect(buildMonthEndNudge(londonClock(new Date("2026-10-30T18:30:00Z")), "A", 1).title).toBe("October ends tomorrow");
    const last = buildMonthEndNudge(londonClock(new Date("2026-10-31T19:30:00Z")), "A", 1);
    expect(last.title).toBe("October ends tonight");
    expect(last.body).toContain("You have 1 trip to sort");
  });

  it("has no em or en dashes", () => {
    const m = buildMonthEndNudge(londonClock(new Date("2026-10-29T17:30:00Z")), "A", 3);
    for (const s of Object.values(m)) expect(s).not.toMatch(/[–—]/);
  });
});

describe("planner and job", () => {
  const NOW = new Date("2026-10-29T18:30:00Z");
  beforeEach(() => {
    vi.mocked(prisma.orgMembership.findMany).mockReset().mockResolvedValue([
      { userId: "u1", org: { name: "Team A", memberships: [{ id: "admin" }] } },
      { userId: "u2", org: { name: "No Manager", memberships: [] } },
      { userId: "u3", org: { name: "Team B", memberships: [{ id: "invited-admin" }] } },
      { userId: "u4", org: { name: "Team C", memberships: [{ id: "a" }] } },
    ] as never);
    vi.mocked(prisma.appEvent.findMany).mockReset().mockResolvedValue([{ userId: "u4" }] as never);
    vi.mocked(prisma.appEvent.create).mockReset().mockResolvedValue({} as never);
    vi.mocked(prisma.trip.groupBy).mockReset().mockResolvedValue([
      { userId: "u1", _count: 5 },
      { userId: "u3", _count: 2 },
    ] as never);
    vi.mocked(prisma.user.findMany).mockReset().mockResolvedValue([
      { id: "u1", email: "a@x.test", pushToken: "ExponentPushToken[1]", pushPrefs: null },
      { id: "u3", email: "b@x.test", pushToken: null, pushPrefs: null },
    ] as never);
    vi.mocked(sendPushNotifications).mockReset();
    vi.mocked(sendAdminEmail).mockReset();
  });

  it("skips teams with no manager and drivers already nudged this month", async () => {
    const plan = await planMonthEndNudges(NOW);
    expect(plan.map((p) => p.userId)).toEqual(["u1", "u3"]);
    const where = vi.mocked(prisma.trip.groupBy).mock.calls[0][0].where as { userId: { in: string[] }; classification: string };
    expect(where.userId.in).toEqual(["u1", "u3"]);
    expect(where.classification).toBe("unclassified");
  });

  it("does nothing outside the window or when not switched on", async () => {
    await runTeamMonthEndNudgeJob(new Date("2026-10-20T18:30:00Z"));
    expect(prisma.orgMembership.findMany).not.toHaveBeenCalled();
    delete process.env.TEAM_MONTH_END_NUDGE;
    await runTeamMonthEndNudgeJob(NOW);
    expect(prisma.appEvent.create).not.toHaveBeenCalled();
    expect(sendPushNotifications).not.toHaveBeenCalled();
  });

  it("pushes to drivers with a token, emails the rest, recording each first", async () => {
    process.env.TEAM_MONTH_END_NUDGE = "1";
    try {
      await runTeamMonthEndNudgeJob(NOW);
    } finally {
      delete process.env.TEAM_MONTH_END_NUDGE;
    }
    expect(vi.mocked(prisma.appEvent.create).mock.calls.map((c) => c[0].data.type)).toEqual([
      teamMonthEndEvent("2026-10"),
      teamMonthEndEvent("2026-10"),
    ]);
    const pushes = vi.mocked(sendPushNotifications).mock.calls[0][0];
    expect(pushes).toHaveLength(1);
    expect(pushes[0].data).toMatchObject({ action: "open_unclassified_trips" });
    expect(vi.mocked(sendAdminEmail).mock.calls[0][0].to).toBe("b@x.test");
  });
});
