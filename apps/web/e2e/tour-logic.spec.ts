import { test, expect } from "@playwright/test";
import { buildTourSteps, tripsBody, type TourCtx } from "../src/components/dashboard/tour/steps";
import { placeCard, ringRect } from "../src/components/dashboard/tour/position";
import { isExistingAccount, parseTourState, readTourState, shouldAutoStart, tourKey, writeTourState } from "../src/lib/dashboard/tour";

// Pure helpers behind the first-use tour. No browser involved.

const base: TourCtx = {
  mode: "work",
  baseMode: "work",
  isCompanyDriver: false,
  isGigDriver: true,
  isEmployee: false,
  workType: "gig",
  unclassified: 3,
  existingAccount: true,
  homeKind: "figure",
};
const ids = (c: Partial<TourCtx>) => buildTourSteps({ ...base, ...c }).map((s) => s.id);

test.describe("buildTourSteps", () => {
  test("six stops, seven with the switch, five without a Home card", () => {
    expect(ids({})).toEqual(["opening", "home", "trips", "slot3", "more", "account"]);
    expect(ids({ baseMode: "both" })).toEqual(["opening", "home", "trips", "slot3", "more", "mode", "account"]);
    expect(ids({ homeKind: "none" })).toEqual(["opening", "trips", "slot3", "more", "account"]);
  });
  test("Home stop follows what Home shows", () => {
    const t = (k: TourCtx["homeKind"]) => buildTourSteps({ ...base, homeKind: k }).find((s) => s.id === "home");
    expect(t("figure")?.title).toBe("Your business miles");
    expect(t("empty")?.body).toBe("Once you mark trips as Business, your miles and what they are worth show up here.");
    expect(t("personal")?.title).toBe("Your driving at a glance");
    expect(t("setup")?.title).toBe("A couple of things first");
    expect(t("setup")?.target).toEqual(["home-setup"]);
  });
  test("slot 3 by driver type", () => {
    const body = (c: Partial<TourCtx>) => buildTourSteps({ ...base, ...c }).find((s) => s.id === "slot3")!;
    expect(body({}).body).toContain("put by each week");
    expect(body({ isGigDriver: false, isEmployee: true, workType: "employee" }).body).toContain("Mileage Allowance Relief");
    expect(body({ isCompanyDriver: true, isGigDriver: false, isEmployee: true }).body).toBe("Your business miles and downloads for the tax year.");
    expect(body({ isGigDriver: false, workType: null }).body).toContain("Tell us how you work in Settings");
    expect(body({ mode: "personal" }).title).toBe("Insights");
  });
  test("Trips copy and count", () => {
    expect(tripsBody("work", 1)).toMatch(/ 1 waiting now\.$/);
    expect(tripsBody("both", 3)).toMatch(/ 3 waiting now\.$/);
    expect(tripsBody("work", 0)).not.toContain("waiting");
    expect(tripsBody("personal", 5)).toBe("Every trip your phone recorded, newest first. Fix one, or add a trip you made without the app.");
  });
  test("opening differs for new accounts", () => {
    const o = (existing: boolean) => buildTourSteps({ ...base, existingAccount: existing })[0].title;
    expect(o(true)).toBe("Your dashboard has a new look");
    expect(o(false)).toBe("Welcome to MileClear on the web");
  });
  test("no em dash, no HMRC, no Premium in any copy", () => {
    const variants: Partial<TourCtx>[] = [
      {},
      { isGigDriver: false, isEmployee: true },
      { isCompanyDriver: true },
      { mode: "personal", baseMode: "personal" },
      { baseMode: "both" },
      { existingAccount: false, unclassified: 0 },
      { isGigDriver: false, workType: null },
    ];
    for (const v of variants) {
      for (const k of ["figure", "empty", "personal", "setup"] as const) {
        for (const s of buildTourSteps({ ...base, ...v, homeKind: k })) {
          const text = `${s.title} ${s.body} ${s.srWhere}`;
          expect(text).not.toMatch(/—|–/);
          expect(text).not.toMatch(/HMRC|Premium|Coming soon/i);
          expect(s.body.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});

test.describe("placeCard", () => {
  const vp = { w: 1440, h: 900 };
  const card = { w: 340, h: 220 };
  test("right of a rail item", () => {
    const p = placeCard({ top: 200, left: 12, width: 216, height: 52 }, card, vp, "right", "center");
    expect(p.side).toBe("right");
    expect(p.left).toBe(12 + 216 + 16);
    expect(p.top).toBe(200 + 26 - 110);
  });
  test("flips when the preferred side does not fit", () => {
    const p = placeCard({ top: 300, left: 1300, width: 100, height: 40 }, card, vp, "right", "center");
    expect(p.side).toBe("left");
    const q = placeCard({ top: 780, left: 100, width: 600, height: 100 }, card, vp, "below", "start");
    expect(q.side).toBe("above");
  });
  test("minRoom pushes a tight 'below' above", () => {
    const q = placeCard({ top: 400, left: 100, width: 600, height: 300 }, card, vp, "below", "start", { minRoom: 260 });
    expect(q.side).toBe("above");
  });
  test("end alignment keeps the right edges together", () => {
    const p = placeCard({ top: 10, left: 1350, width: 48, height: 48 }, card, vp, "below", "end");
    expect(p.left + card.w).toBe(1398);
  });
  test("clamps inside a 320 px viewport", () => {
    const p = placeCard({ top: 100, left: 10, width: 300, height: 600 }, card, { w: 320, h: 400 }, "below", "start");
    expect(p.left).toBeGreaterThanOrEqual(16);
    expect(p.top).toBeGreaterThanOrEqual(16);
    expect(p.left + card.w).toBeLessThanOrEqual(320 - 16 + 340);
  });
  test("ringRect pads and clips", () => {
    expect(ringRect({ top: 100, left: 50, width: 200, height: 40 }, 6)).toEqual({ top: 94, left: 44, width: 212, height: 52 });
    expect(ringRect({ top: 20, left: 0, width: 100, height: 400 }, 6, { top: 60, bottom: 300 })).toEqual({ top: 60, left: -6, width: 112, height: 240 });
  });
});

test.describe("tour state", () => {
  test("bad JSON and odd values read as empty", () => {
    expect(parseTourState(null)).toEqual({ state: null, autoStarts: 0, at: null });
    expect(parseTourState("{nope").state).toBeNull();
    expect(parseTourState('"x"').autoStarts).toBe(0);
    expect(parseTourState('{"state":"weird","autoStarts":"2"}')).toEqual({ state: null, autoStarts: 0, at: null });
  });
  test("round trip through a fake store", () => {
    const store = new Map<string, string>();
    const io = { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => void store.set(k, v), now: () => new Date("2026-10-09T10:00:00Z") };
    writeTourState("u1", { autoStarts: 1 }, io);
    writeTourState("u1", { state: "done" }, io);
    expect(JSON.parse(store.get(tourKey("u1"))!)).toEqual({ state: "done", autoStarts: 1, at: "2026-10-09T10:00:00.000Z" });
    expect(readTourState("u1", io.get).state).toBe("done");
    expect(readTourState("u2", io.get).state).toBeNull();
  });
  test("storage that throws never throws", () => {
    const g = globalThis as unknown as { window?: unknown };
    g.window = { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } };
    try {
      expect(readTourState("u1").state).toBeNull();
      expect(() => writeTourState("u1", { state: "done" })).not.toThrow();
    } finally {
      delete g.window;
    }
  });
  test("auto start rules", () => {
    expect(shouldAutoStart({ state: null, autoStarts: 0, at: null })).toBe(true);
    expect(shouldAutoStart({ state: null, autoStarts: 1, at: null })).toBe(true);
    expect(shouldAutoStart({ state: null, autoStarts: 2, at: null })).toBe(false);
    expect(shouldAutoStart({ state: "done", autoStarts: 0, at: null })).toBe(false);
    expect(shouldAutoStart({ state: "skipped", autoStarts: 0, at: null })).toBe(false);
  });
  test("existing vs new account", () => {
    expect(isExistingAccount("2026-01-01T00:00:00.000Z")).toBe(true);
    expect(isExistingAccount("2026-12-01T00:00:00.000Z")).toBe(false);
    expect(isExistingAccount(null)).toBe(true);
    expect(isExistingAccount("garbage")).toBe(true);
  });
});
