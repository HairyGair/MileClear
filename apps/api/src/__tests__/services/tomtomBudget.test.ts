/**
 * TomTom's free allowance is 2,500 requests a MONTH (17 Oct 2026: the code
 * had assumed a day, and every request from 14 Oct got a 403). The budget is
 * now per UTC month, paced per day. A 403 or 429 stops the rest of the UTC
 * day (a 403 then sends a single probe the next day), surviving a restart.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const store = vi.hoisted(() => ({
  events: [] as { type: string; metadata: unknown; createdAt: Date }[],
  dbDown: 0,
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    appEvent: {
      findMany: vi.fn(async (args: { where: { type: string; createdAt: { gte: Date } } }) => {
        if (store.dbDown > 0) {
          store.dbDown--;
          throw new Error("Can't reach database server");
        }
        return store.events
          .filter((e) => e.type === args.where.type && e.createdAt >= args.where.createdAt.gte)
          .map((e) => ({ metadata: e.metadata }));
      }),
    },
  },
}));
vi.mock("../../services/appEvents.js", () => ({
  logEvent: (type: string, _userId: string | null, metadata: unknown) => {
    store.events.push({ type, metadata, createdAt: new Date() });
  },
}));

import {
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
  stoppedToday: null,
  forbiddenSince: null,
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

  it("stops at today's allowance, at the month cap, and on a 403 or 429 day", () => {
    const now = new Date("2026-10-01T06:00:00Z");
    expect(budgetAllows(state({ usedMonth: 73, usedToday: 73 }), 2300, now)).toBe(true);
    expect(budgetAllows(state({ usedMonth: 74, usedToday: 74 }), 2300, now)).toBe(false);
    const last = new Date("2026-10-31T06:00:00Z");
    expect(budgetAllows(state({ day: "2026-10-31", usedMonth: 2300 }), 2300, last)).toBe(false);
    expect(budgetAllows(state({ usedMonth: 3, usedToday: 3, stoppedToday: "tomtom_403_day" }), 2300, now)).toBe(false);
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
  it("a new UTC day resets today's count and any day stop, and keeps the probe mark", () => {
    const s = state({ day: "2026-10-05", usedMonth: 400, usedToday: 74, stoppedToday: "tomtom_403_day", forbiddenSince: "2026-10-05" });
    expect(rollBudget(s, new Date("2026-10-05T23:59:00Z"))).toBe(s);
    expect(rollBudget(s, new Date("2026-10-06T00:00:00Z"))).toEqual({ ...s, day: "2026-10-06", usedToday: 0, stoppedToday: null });
  });

  it("the 1st at 00:00 UTC resets the counts, and carries a probe mark", () => {
    const s = state({ day: "2026-10-31", usedMonth: 2300, usedToday: 40, stoppedToday: "tomtom_403_day", forbiddenSince: "2026-10-31" });
    expect(rollBudget(s, new Date("2026-10-31T23:59:59Z"))).toBe(s);
    expect(rollBudget(s, new Date("2026-11-01T00:00:00Z"))).toEqual({
      month: "2026-11",
      usedMonth: 0,
      day: "2026-11-01",
      usedToday: 0,
      stoppedToday: null,
      forbiddenSince: "2026-10-31",
    });
    expect(utcMonthKey(new Date("2026-10-31T23:30:00Z"))).toBe("2026-10"); // 00:30 UK on the 1st, still October in UTC
  });

  it("never rolls backwards: an older clock leaves a newer day or month as it is", () => {
    const nov = state({ month: "2026-11", day: "2026-11-01", usedMonth: 3, usedToday: 3, stoppedToday: "tomtom_429_day" });
    expect(rollBudget(nov, new Date("2026-10-31T23:59:59Z"))).toBe(nov);
    const d18 = state({ day: "2026-10-18", usedMonth: 900, usedToday: 5, stoppedToday: "tomtom_403_day" });
    expect(rollBudget(d18, new Date("2026-10-17T23:59:59Z"))).toBe(d18);
  });
});

describe("TomTom restore on boot", () => {
  const NOW = new Date("2026-10-17T05:00:00Z");

  it("trusts an up-to-date state file as it is, so nightly restarts do not eat the month", () => {
    const file = state({ day: "2026-10-17", usedMonth: 700, usedToday: 20 });
    const cps = [
      { month: "2026-10", usedMonth: 650, day: "2026-10-16", usedToday: 50 },
      { month: "2026-10", usedMonth: 700, day: "2026-10-17", usedToday: 20 },
    ];
    expect(restoreBudget(file, cps, NOW, 2300)).toMatchObject({ usedMonth: 700, usedToday: 20, stoppedToday: null });
  });

  it("without the file, or with one behind the checkpoints, adds the 25-request margin", () => {
    const cps = [
      { month: "2026-10", usedMonth: 650, day: "2026-10-16", usedToday: 50 },
      { month: "2026-10", usedMonth: 675, day: "2026-10-17", usedToday: 0 },
    ];
    expect(restoreBudget(null, cps, NOW, 2300)).toMatchObject({ usedMonth: 700, usedToday: 25 });
    const behind = state({ day: "2026-10-17", usedMonth: 600, usedToday: 5 });
    expect(restoreBudget(behind, cps, NOW, 2300)).toMatchObject({ usedMonth: 700, usedToday: 25 });
  });

  it("a stop (403 or 429) comes back only on its own UTC day; a 403 also marks the next day for a probe", () => {
    const today403 = [{ month: "2026-10", usedMonth: 300, day: "2026-10-17", usedToday: 3, stoppedToday: "tomtom_403_day", forbiddenSince: "2026-10-17" }];
    expect(restoreBudget(null, today403, NOW, 2300)).toMatchObject({ stoppedToday: "tomtom_403_day", forbiddenSince: "2026-10-17" });
    const yesterday403 = [{ month: "2026-10", usedMonth: 300, day: "2026-10-16", usedToday: 3, stoppedToday: "tomtom_403_day", forbiddenSince: "2026-10-16" }];
    expect(restoreBudget(null, yesterday403, NOW, 2300)).toMatchObject({ stoppedToday: null, forbiddenSince: "2026-10-16" });
    const today429 = [{ month: "2026-10", usedMonth: 300, day: "2026-10-17", usedToday: 3, stoppedToday: "tomtom_429_day" }];
    expect(restoreBudget(null, today429, NOW, 2300)).toMatchObject({ stoppedToday: "tomtom_429_day", forbiddenSince: null });
    const yesterday429 = [{ month: "2026-10", usedMonth: 300, day: "2026-10-16", usedToday: 3, stoppedToday: "tomtom_429_day" }];
    expect(restoreBudget(null, yesterday429, NOW, 2300)).toMatchObject({ stoppedToday: null, forbiddenSince: null });
  });

  it("old rows: the month is the sum of each day, and their \"tomtom_403\" is a stop for its own day only", () => {
    const cps = [
      { day: "2026-10-03", used: 350, stopped: null },
      { day: "2026-10-03", used: 375, stopped: null },
      { day: "2026-10-04", used: 250, stopped: null },
      { day: "2026-10-14", used: 0, stopped: "tomtom_403" },
      { day: "2026-10-16", used: 0, stopped: "tomtom_403" },
      { day: "2026-10-15", used: 0, stopped: "tomtom_429" },
    ];
    const s = restoreBudget(null, cps, NOW, 2300);
    expect(s.usedMonth).toBe(400 + 275 + 25 + 25 + 25);
    expect(s).toMatchObject({ stoppedToday: null, forbiddenSince: "2026-10-16" });
    // The same rows read on the 16th: stopped for that day
    expect(restoreBudget(null, cps, new Date("2026-10-16T09:00:00Z"), 2300).stoppedToday).toBe("tomtom_403");
    // and the old state file shape
    expect(restoreBudget({ day: "2026-10-17", used: 30, stopped: "tomtom_403" }, [], NOW, 2300)).toMatchObject({
      usedMonth: 30,
      usedToday: 30,
      stoppedToday: "tomtom_403",
      forbiddenSince: "2026-10-17",
    });
  });

  it("ignores last month's counts, but a 403 on the 31st still makes the 1st start with a probe", () => {
    const file = state({ month: "2026-09", day: "2026-09-30", usedMonth: 2299, stoppedToday: "tomtom_403_day", forbiddenSince: "2026-09-30" });
    expect(restoreBudget(file, [], new Date("2026-10-01T05:00:00Z"), 2300)).toEqual({
      month: "2026-10",
      usedMonth: 0,
      day: "2026-10-01",
      usedToday: 0,
      stoppedToday: null,
      forbiddenSince: "2026-09-30",
    });
  });

  it("database unreadable: trusts this month's file, else assumes the whole month is gone", () => {
    expect(restoreBudget(state({ day: "2026-10-17", usedMonth: 410, usedToday: 9 }), null, NOW, 2300)).toMatchObject({ usedMonth: 410, usedToday: 9 });
    expect(restoreBudget(null, null, NOW, 2300).usedMonth).toBe(2300);
    expect(restoreBudget(state({ month: "2026-09", day: "2026-09-30", usedMonth: 5 }), null, NOW, 2300).usedMonth).toBe(2300);
  });
});

describe("TomTom budget across restarts (IO)", () => {
  let dir: string;
  const fetchMock = vi.fn();
  const ok = () => new Response(JSON.stringify({ incidents: [] }), { status: 200 });
  const at = (iso: string) => vi.setSystemTime(new Date(iso));
  const reasons = () =>
    store.events.map((e) => (e.metadata as { reason?: string }).reason).filter((r): r is string => !!r);

  async function boot() {
    vi.resetModules();
    return await import("../../services/tomtomTraffic.js");
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    dir = mkdtempSync(path.join(tmpdir(), "tomtom-budget-"));
    process.env.ROAD_ALERTS_STATE_DIR = dir;
    process.env.TOMTOM_API_KEY = "test-key";
    store.events.length = 0;
    store.dbDown = 0;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.ROAD_ALERTS_STATE_DIR;
    delete process.env.TOMTOM_API_KEY;
    delete process.env.TOMTOM_MONTHLY_REQUEST_CAP;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("a 403 stops the rest of the UTC day (and the credit), survives a restart, then one probe a day", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 403 }));
    at("2026-10-17T06:00:00Z");
    let tt = await boot();
    expect(await tt.isTomTomServing()).toBe(true);
    await tt.getTileEvents(["70:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await tt.isTomTomServing()).toBe(false);
    expect(await tt.screenFreshnessMs()).toBeNull();
    await tt.getTileEvents(["71:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Restart later that day, with and without the state file: still stopped
    at("2026-10-17T22:00:00Z");
    tt = await boot();
    await tt.getTileEvents(["72:-2"], 10 * 60000);
    rmSync(path.join(dir, "tomtom-budget.json"));
    expect(existsSync(path.join(dir, "tomtom-budget.json"))).toBe(false);
    tt = await boot();
    await tt.getTileEvents(["73:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await tt.isTomTomServing()).toBe(false);
    expect(reasons()).toEqual(["tomtom_403_day"]);

    // 18 Oct after a restart: credited again, and exactly one probe goes out
    // even when the screen and the job ask at once. Still 403: stop again.
    at("2026-10-18T00:05:00Z");
    tt = await boot();
    expect(await tt.isTomTomServing()).toBe(true);
    await Promise.all([tt.getTileEvents(["74:-2", "75:-2"], 10 * 60000), tt.getTileEvents(["76:-2"], 10 * 60000)]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await tt.isTomTomServing()).toBe(false);
    expect(reasons()).toEqual(["tomtom_403_day", "tomtom_403_day"]);

    // 19 Oct: the probe is answered, and requests flow again
    fetchMock.mockImplementation(async () => ok());
    at("2026-10-19T06:00:00Z");
    await tt.getTileEvents(["77:-2", "78:-2", "79:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(await tt.budgetSnapshot()).toMatchObject({ stoppedToday: null, forbiddenSince: null, usedToday: 3 });
  });

  it("a 429 stops the rest of the UTC day only, keeps the credit, survives a restart, and clears the next day", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 429 }));
    at("2026-10-17T06:00:00Z");
    let tt = await boot();
    await tt.getTileEvents(["70:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await tt.isTomTomServing()).toBe(true);
    expect(await tt.screenFreshnessMs()).toBeNull();
    await tt.getTileEvents(["71:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    at("2026-10-17T22:00:00Z");
    rmSync(path.join(dir, "tomtom-budget.json"));
    tt = await boot();
    await tt.getTileEvents(["72:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reasons()).toEqual(["tomtom_429_day"]);

    fetchMock.mockImplementation(async () => ok());
    at("2026-10-18T00:05:00Z");
    tt = await boot();
    await tt.getTileEvents(["73:-2", "74:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(3); // no probe needed after a 429
    expect(await tt.budgetSnapshot()).toMatchObject({ stoppedToday: null, forbiddenSince: null });
  });

  it("a job holding 31 Oct 23:59:59 and a screen at 00:00:05 on 1 Nov: nothing is lost or counted twice", async () => {
    at("2026-10-31T23:59:59Z");
    const tt = await boot();
    await tt.budgetSnapshot(); // loaded
    let answerJob: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => (answerJob = resolve)));
    fetchMock.mockImplementation(async () => ok());

    // The job's request goes at 23:59:59 and is slow to answer
    const job = tt.getTileEvents(["70:-2"], 10 * 60000);
    await new Promise((r) => setImmediate(r));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await tt.budgetSnapshot()).toMatchObject({ month: "2026-10", usedMonth: 1 });

    // The screen asks at 00:00:05 on 1 Nov: a fresh month
    at("2026-11-01T00:00:05Z");
    await tt.getTileEvents(["71:-2"], 10 * 60000);
    expect(await tt.budgetSnapshot()).toMatchObject({ month: "2026-11", usedMonth: 1, usedToday: 1 });

    // The job's answer arrives and it carries on: counted in November, and
    // November's count is never wiped back to an October state
    answerJob(ok());
    await job;
    await tt.getTileEvents(["72:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(await tt.budgetSnapshot()).toMatchObject({ month: "2026-11", day: "2026-11-01", usedMonth: 2, usedToday: 2 });
  });

  it("no file and the database down: assumes the month is gone, saves nothing, and asks the database again next time", async () => {
    fetchMock.mockImplementation(async () => ok());
    at("2026-10-17T06:00:00Z");
    store.dbDown = 1;
    const tt = await boot();
    expect(await tt.budgetSnapshot()).toMatchObject({ usedMonth: 2300 });
    // The database is back: the next call reads it and requests go again
    await tt.getTileEvents(["70:-2"], 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await tt.budgetSnapshot()).toMatchObject({ usedMonth: 1, usedToday: 1 });
  });

  it("no file and the database down: no request goes while the guess stands", async () => {
    fetchMock.mockImplementation(async () => ok());
    at("2026-10-17T06:00:00Z");
    store.dbDown = 2; // the snapshot and the next call both fail
    const tt = await boot();
    await tt.budgetSnapshot();
    await tt.getTileEvents(["70:-2"], 10 * 60000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(path.join(dir, "tomtom-budget.json"))).toBe(false);
  });

  it("enforces today's allowance, across a restart, and gives a new one the next day", async () => {
    // 310 on the 1st of a 31-day month = 10 today
    process.env.TOMTOM_MONTHLY_REQUEST_CAP = "310";
    fetchMock.mockImplementation(async () => ok());
    at("2026-10-01T06:00:00Z");
    let tt = await boot();
    const tiles = Array.from({ length: 15 }, (_, i) => `${70 + i}:-2`);
    await tt.getTileEvents(tiles, 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(await tt.budgetSnapshot()).toMatchObject({ usedMonth: 10, usedToday: 10, todayAllowance: 10 });

    tt = await boot();
    await tt.getTileEvents(tiles.map((t) => t.replace(":-2", ":-3")), 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(10);

    // The state file was up to date, so the restart took it as exact (no
    // margin). 2 Oct: (310 - 10) / 30 = 10 more.
    at("2026-10-02T06:00:00Z");
    await tt.getTileEvents(tiles.map((t) => t.replace(":-2", ":-4")), 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(20);
    expect(await tt.budgetSnapshot()).toMatchObject({ usedMonth: 20, usedToday: 10, todayAllowance: 10 });

    // Restart with the state file gone: the 2 Oct checkpoint (20) plus the
    // 25 margin, and today's 10 plus 25, so nothing more today.
    rmSync(path.join(dir, "tomtom-budget.json"));
    tt = await boot();
    expect(await tt.budgetSnapshot()).toMatchObject({ usedMonth: 45, usedToday: 35 });
    await tt.getTileEvents(tiles.map((t) => t.replace(":-2", ":-5")), 10 * 60000);
    expect(fetchMock).toHaveBeenCalledTimes(20);
  });
});
