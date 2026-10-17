/**
 * TomTom's free allowance is 2,500 requests a MONTH (17 Oct 2026: the code
 * had assumed a day, and every request from 14 Oct got a 403). The budget is
 * now per UTC month, paced per day, and a 403/429 stops it until the 1st,
 * surviving a restart.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const store = vi.hoisted(() => ({ events: [] as { type: string; metadata: unknown; createdAt: Date }[], clock: new Date() }));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    appEvent: {
      findMany: vi.fn(async (args: { where: { type: string; createdAt: { gte: Date } } }) =>
        store.events
          .filter((e) => e.type === args.where.type && e.createdAt >= args.where.createdAt.gte)
          .map((e) => ({ metadata: e.metadata }))
      ),
    },
  },
}));
vi.mock("../../services/appEvents.js", () => ({
  logEvent: (type: string, _userId: string | null, metadata: unknown) => {
    store.events.push({ type, metadata, createdAt: new Date(store.clock) });
  },
}));

import {
  BUDGET_EVENT,
  MAX_MONTHLY_CAP,
  budgetAllows,
  dayAllowance,
  daysLeftInMonth,
  monthlyCap,
  restoreBudget,
  rollBudget,
  screenMaxAgeMs,
  utcMonthKey,
  type BudgetState,
} from "../../services/tomtomTraffic.js";

const state = (over: Partial<BudgetState>): BudgetState => ({
  month: "2026-10",
  usedMonth: 0,
  day: "2026-10-01",
  usedToday: 0,
  stopped: null,
  stoppedToday: null,
  ...over,
});

describe("TomTom monthly cap", () => {
  afterEach(() => {
    delete process.env.TOMTOM_MONTHLY_REQUEST_CAP;
  });

  it("is 2,300 by default; the env var can lower it but never raise it", () => {
    expect(MAX_MONTHLY_CAP).toBe(2300);
    expect(monthlyCap()).toBe(2300);
    process.env.TOMTOM_MONTHLY_REQUEST_CAP = "1000";
    expect(monthlyCap()).toBe(1000);
    process.env.TOMTOM_MONTHLY_REQUEST_CAP = "5000";
    expect(monthlyCap()).toBe(2300);
    process.env.TOMTOM_MONTHLY_REQUEST_CAP = "nonsense";
    expect(monthlyCap()).toBe(2300);
    process.env.TOMTOM_MONTHLY_REQUEST_CAP = "-5";
    expect(monthlyCap()).toBe(2300);
  });
});

describe("TomTom pacing", () => {
  it("counts the days left in the month, today included", () => {
    expect(daysLeftInMonth(new Date("2026-10-01T00:00:00Z"))).toBe(31);
    expect(daysLeftInMonth(new Date("2026-10-17T12:00:00Z"))).toBe(15);
    expect(daysLeftInMonth(new Date("2026-10-31T23:59:00Z"))).toBe(1);
    expect(daysLeftInMonth(new Date("2026-11-01T00:00:00Z"))).toBe(30);
    expect(daysLeftInMonth(new Date("2027-02-01T00:00:00Z"))).toBe(28);
  });

  it("the 1st of a 31-day month with 2,300 gets 74", () => {
    expect(dayAllowance(state({}), 2300, new Date("2026-10-01T06:00:00Z"))).toBe(74);
  });

  it("mid-month after heavy use: 1,500 gone before the 17th leaves 53 a day", () => {
    const now = new Date("2026-10-17T06:00:00Z");
    expect(dayAllowance(state({ day: "2026-10-17", usedMonth: 1500 }), 2300, now)).toBe(53);
    // Spending today does not shrink today's allowance as it goes
    expect(dayAllowance(state({ day: "2026-10-17", usedMonth: 1530, usedToday: 30 }), 2300, now)).toBe(53);
  });

  it("a quiet stretch carries forward: nothing used by the 17th leaves 153 a day", () => {
    expect(dayAllowance(state({ day: "2026-10-17" }), 2300, new Date("2026-10-17T06:00:00Z"))).toBe(153);
  });

  it("the last day gets whatever is left; an overspent month gets nothing", () => {
    const last = new Date("2026-10-31T06:00:00Z");
    expect(dayAllowance(state({ day: "2026-10-31", usedMonth: 2250 }), 2300, last)).toBe(50);
    expect(dayAllowance(state({ day: "2026-10-31", usedMonth: 2525 }), 2300, last)).toBe(0);
  });

  it("stops at today's allowance, at the month cap, after a 403 and after a 429", () => {
    const now = new Date("2026-10-01T06:00:00Z");
    expect(budgetAllows(state({ usedMonth: 73, usedToday: 73 }), 2300, now)).toBe(true);
    expect(budgetAllows(state({ usedMonth: 74, usedToday: 74 }), 2300, now)).toBe(false);
    const last = new Date("2026-10-31T06:00:00Z");
    expect(budgetAllows(state({ day: "2026-10-31", usedMonth: 2300 }), 2300, last)).toBe(false);
    expect(budgetAllows(state({ usedMonth: 3, usedToday: 3, stopped: "tomtom_403_month" }), 2300, now)).toBe(false);
    expect(budgetAllows(state({ usedMonth: 3, usedToday: 3, stoppedToday: "tomtom_429_day" }), 2300, now)).toBe(false);
  });

  it("the screen backs off as today's allowance runs down", () => {
    expect(screenMaxAgeMs(10, 74)).toBe(10 * 60000);
    expect(screenMaxAgeMs(52, 74)).toBe(60 * 60000);
    expect(screenMaxAgeMs(67, 74)).toBeNull();
    expect(screenMaxAgeMs(0, 0)).toBeNull();
  });
});

describe("TomTom month and day roll", () => {
  it("a new UTC day resets today's count and a 429 stop, and keeps a 403 stop", () => {
    const s = state({ day: "2026-10-05", usedMonth: 400, usedToday: 74, stopped: "tomtom_403_month", stoppedToday: "tomtom_429_day" });
    expect(rollBudget(s, new Date("2026-10-05T23:59:00Z"))).toBe(s);
    expect(rollBudget(s, new Date("2026-10-06T00:00:00Z"))).toEqual({
      ...s,
      day: "2026-10-06",
      usedToday: 0,
      stoppedToday: null,
    });
  });

  it("the 1st at 00:00 UTC resets everything, a 403 stop included", () => {
    const s = state({ day: "2026-10-31", usedMonth: 2300, usedToday: 40, stopped: "tomtom_403_month" });
    expect(rollBudget(s, new Date("2026-10-31T23:59:59Z"))).toBe(s);
    expect(rollBudget(s, new Date("2026-11-01T00:00:00Z"))).toEqual({
      month: "2026-11",
      usedMonth: 0,
      day: "2026-11-01",
      usedToday: 0,
      stopped: null,
      stoppedToday: null,
    });
    expect(utcMonthKey(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10"); // 00:30 UK on the 1st, still October in UTC
  });
});

describe("TomTom restore on boot", () => {
  const NOW = new Date("2026-10-17T05:00:00Z");

  it("trusts an up-to-date state file as it is, so nightly restarts do not eat the month", () => {
    const file = state({ day: "2026-10-17", usedMonth: 700, usedToday: 20 });
    const cps = [
      { month: "2026-10", usedMonth: 650, day: "2026-10-16", usedToday: 50, stopped: null },
      { month: "2026-10", usedMonth: 700, day: "2026-10-17", usedToday: 20, stopped: null },
    ];
    expect(restoreBudget(file, cps, NOW, 2300)).toMatchObject({ usedMonth: 700, usedToday: 20, stopped: null });
  });

  it("without the file, or with one behind the checkpoints, adds the 25-request margin", () => {
    const cps = [
      { month: "2026-10", usedMonth: 650, day: "2026-10-16", usedToday: 50, stopped: null },
      { month: "2026-10", usedMonth: 675, day: "2026-10-17", usedToday: 0, stopped: null },
    ];
    expect(restoreBudget(null, cps, NOW, 2300)).toMatchObject({ usedMonth: 700, usedToday: 25 });
    const behind = state({ day: "2026-10-17", usedMonth: 600, usedToday: 5 });
    expect(restoreBudget(behind, cps, NOW, 2300)).toMatchObject({ usedMonth: 700, usedToday: 25 });
  });

  it("a 403 stop in either the file or a checkpoint survives for the month", () => {
    const cps = [{ month: "2026-10", usedMonth: 300, day: "2026-10-03", usedToday: 3, stopped: "tomtom_403_month", stoppedToday: null }];
    expect(restoreBudget(null, cps, NOW, 2300)).toMatchObject({ stopped: "tomtom_403_month", stoppedToday: null });
    const file = state({ day: "2026-10-12", usedMonth: 310, stopped: "tomtom_403_month" });
    expect(restoreBudget(file, [], NOW, 2300).stopped).toBe("tomtom_403_month");
  });

  it("a 429 stop survives only for its own UTC day, and never stops the month", () => {
    const today = [{ month: "2026-10", usedMonth: 300, day: "2026-10-17", usedToday: 3, stopped: null, stoppedToday: "tomtom_429_day" }];
    expect(restoreBudget(null, today, NOW, 2300)).toMatchObject({ stopped: null, stoppedToday: "tomtom_429_day" });
    const yesterday = [{ month: "2026-10", usedMonth: 300, day: "2026-10-16", usedToday: 3, stopped: null, stoppedToday: "tomtom_429_day" }];
    expect(restoreBudget(null, yesterday, NOW, 2300)).toMatchObject({ stopped: null, stoppedToday: null });
    // Rows from before 17 Oct put a 429 in `stopped`: still only its own day
    const legacy = [{ day: "2026-10-16", used: 40, stopped: "tomtom_429" }];
    expect(restoreBudget(null, legacy, NOW, 2300)).toMatchObject({ stopped: null, stoppedToday: null });
    expect(restoreBudget({ day: "2026-10-17", used: 5, stopped: "tomtom_429" }, [], NOW, 2300)).toMatchObject({
      stopped: null,
      stoppedToday: "tomtom_429",
    });
  });

  it("ignores last month's file and checkpoints", () => {
    const file = state({ month: "2026-09", day: "2026-09-30", usedMonth: 2299, stopped: "tomtom_403" });
    const cps = [{ month: "2026-09", usedMonth: 2275, day: "2026-09-30", usedToday: 10, stopped: "tomtom_403" }];
    expect(restoreBudget(file, cps, NOW, 2300)).toEqual({
      month: "2026-10",
      usedMonth: 0,
      day: "2026-10-17",
      usedToday: 0,
      stopped: null,
      stoppedToday: null,
    });
  });

  it("reads the old per-day checkpoints: the month is the sum of each day, and their 403 stops the month", () => {
    const cps = [
      { day: "2026-10-03", used: 350, stopped: null },
      { day: "2026-10-03", used: 375, stopped: null },
      { day: "2026-10-04", used: 250, stopped: null },
      { day: "2026-10-14", used: 0, stopped: "tomtom_403" },
    ];
    const s = restoreBudget(null, cps, NOW, 2300);
    expect(s.usedMonth).toBe(400 + 275 + 25);
    expect(s.stopped).toBe("tomtom_403");
    // and the old state file shape
    expect(restoreBudget({ day: "2026-10-17", used: 30, stopped: null }, [], NOW, 2300)).toMatchObject({ usedMonth: 30, usedToday: 30 });
  });

  it("assumes half the month is gone when the database cannot be read", () => {
    expect(restoreBudget(null, null, NOW, 2300).usedMonth).toBe(1150);
  });
});

describe("TomTom budget across a restart (IO)", () => {
  let dir: string;
  const fetchMock = vi.fn();

  async function boot() {
    vi.resetModules();
    return await import("../../services/tomtomTraffic.js");
  }

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "tomtom-budget-"));
    process.env.ROAD_ALERTS_STATE_DIR = dir;
    process.env.TOMTOM_API_KEY = "test-key";
    store.events.length = 0;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.ROAD_ALERTS_STATE_DIR;
    delete process.env.TOMTOM_API_KEY;
    delete process.env.TOMTOM_MONTHLY_REQUEST_CAP;
    vi.unstubAllGlobals();
  });

  it("a 403 stops TomTom for the month, a restart does not retry it, and the 1st does", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 403 }));
    store.clock = new Date("2026-10-17T06:00:00Z");
    let tt = await boot();
    expect(await tt.isTomTomServing(store.clock)).toBe(true);
    await tt.getTileEvents(["70:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await tt.isTomTomServing(store.clock)).toBe(false);
    expect(await tt.screenFreshnessMs(store.clock)).toBeNull();
    await tt.getTileEvents(["71:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Restart the next day: still stopped
    store.clock = new Date("2026-10-18T06:00:00Z");
    tt = await boot();
    await tt.getTileEvents(["72:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await tt.isTomTomServing(store.clock)).toBe(false);

    // Restart with the state file gone: the checkpoint alone keeps it stopped
    rmSync(path.join(dir, "tomtom-budget.json"));
    expect(existsSync(path.join(dir, "tomtom-budget.json"))).toBe(false);
    tt = await boot();
    await tt.getTileEvents(["73:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const stopEvents = store.events.filter((e) => e.type === BUDGET_EVENT && (e.metadata as { reason?: string }).reason);
    expect(stopEvents.map((e) => (e.metadata as { reason: string }).reason)).toEqual(["tomtom_403_month"]);
    expect((stopEvents[0].metadata as BudgetState).stopped).toBe("tomtom_403_month");

    // 1 November: a fresh month, TomTom is asked again
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ incidents: [] }), { status: 200 }));
    store.clock = new Date("2026-11-01T00:05:00Z");
    expect(await tt.isTomTomServing(store.clock)).toBe(true);
    await tt.getTileEvents(["74:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a 429 stops TomTom for the rest of the UTC day only, across a restart, and the next day asks again", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    store.clock = new Date("2026-10-17T06:00:00Z");
    let tt = await boot();
    await tt.getTileEvents(["70:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Still serving (and credited) for the month; no more requests today
    expect(await tt.isTomTomServing(store.clock)).toBe(true);
    expect(await tt.screenFreshnessMs(store.clock)).toBeNull();
    await tt.getTileEvents(["71:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Restart later the same day: still stopped, from the file or the checkpoint alone
    store.clock = new Date("2026-10-17T22:00:00Z");
    tt = await boot();
    await tt.getTileEvents(["72:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    rmSync(path.join(dir, "tomtom-budget.json"));
    tt = await boot();
    await tt.getTileEvents(["73:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const reasons = store.events
      .map((e) => (e.metadata as { reason?: string }).reason)
      .filter((r): r is string => !!r);
    expect(reasons).toEqual(["tomtom_429_day"]);

    // 00:05 UTC the next day, after a restart: asked again
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ incidents: [] }), { status: 200 }));
    store.clock = new Date("2026-10-18T00:05:00Z");
    tt = await boot();
    await tt.getTileEvents(["74:-2"], 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await tt.budgetSnapshot(store.clock)).toMatchObject({ stopped: null, stoppedToday: null });
  });

  it("enforces today's allowance, across a restart, and gives a new one the next day", async () => {
    // 310 on the 1st of a 31-day month = 10 today
    process.env.TOMTOM_MONTHLY_REQUEST_CAP = "310";
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ incidents: [] }), { status: 200 }));
    store.clock = new Date("2026-10-01T06:00:00Z");
    let tt = await boot();
    const tiles = Array.from({ length: 15 }, (_, i) => `${70 + i}:-2`);
    await tt.getTileEvents(tiles, 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(await tt.budgetSnapshot(store.clock)).toMatchObject({ usedMonth: 10, usedToday: 10, todayAllowance: 10 });

    tt = await boot();
    await tt.getTileEvents(tiles.map((t) => t.replace(":-2", ":-3")), 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(10);

    // The state file was up to date, so the restart took it as exact (no
    // margin). 2 Oct: (310 - 10) / 30 = 10 more.
    store.clock = new Date("2026-10-02T06:00:00Z");
    await tt.getTileEvents(tiles.map((t) => t.replace(":-2", ":-4")), 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(await tt.budgetSnapshot(store.clock)).toMatchObject({ usedMonth: 20, usedToday: 10, todayAllowance: 10 });

    // Restart with the state file gone: the 2 Oct checkpoint (20) plus the
    // 25 margin, and today's 10 plus 25, so nothing more today.
    rmSync(path.join(dir, "tomtom-budget.json"));
    tt = await boot();
    expect(await tt.budgetSnapshot(store.clock)).toMatchObject({ usedMonth: 45, usedToday: 35 });
    await tt.getTileEvents(tiles.map((t) => t.replace(":-2", ":-5")), 10 * 60000, store.clock);
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
});
