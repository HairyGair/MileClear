import { describe, it, expect, beforeEach, vi } from "vitest";
import type { HmrcCalculationListItem, HmrcCalculationSummary } from "../api/hmrc";
import { loadTaxSoFar, type TaxSoFarApi } from "./mtdTaxSoFarLoad";
import {
  invalidateTaxSoFarCache,
  peekTaxSoFarCache,
  TAX_SO_FAR_CACHE_MS,
  TAX_SO_FAR_SHORT_CACHE_MS,
} from "./mtdHubCache";

const YEAR = "2026-27";

function item(id: string, ts: string): HmrcCalculationListItem {
  return { calculationId: id, calculationTimestamp: ts, calculationType: "in-year" };
}

function summary(id: string, over: Partial<HmrcCalculationSummary> = {}): HmrcCalculationSummary {
  return { calculationId: id, taxYear: YEAR, ready: true, raw: {}, totalIncomeTaxAndNicsDue: 100, ...over };
}

const LIST = [item("old", "2026-08-01T10:00:00Z"), item("new", "2026-11-01T10:00:00Z")];

function fakeApi(byId: Record<string, HmrcCalculationSummary>, list: HmrcCalculationListItem[] = LIST) {
  const api = {
    list: vi.fn(async () => list),
    get: vi.fn(async (id: string) => byId[id]),
  };
  return api as typeof api & TaxSoFarApi;
}

let clock = 1_000_000;
const now = () => clock;

function load(api: TaxSoFarApi, opts: { forced?: boolean; isCancelled?: () => boolean } = {}) {
  return loadTaxSoFar({
    userId: "u1",
    taxYear: YEAR,
    forced: opts.forced ?? false,
    isCancelled: opts.isCancelled ?? (() => false),
    api,
    now,
  });
}

beforeEach(() => {
  invalidateTaxSoFarCache();
  clock = 1_000_000;
});

describe("loadTaxSoFar", () => {
  it("shows the newest usable calculation and keeps it 15 minutes", async () => {
    const api = fakeApi({ new: summary("new"), old: summary("old") });
    const r = await load(api);
    expect(r?.summary.calculationId).toBe("new");
    expect(r?.newestPending).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);

    clock += TAX_SO_FAR_CACHE_MS - 1;
    await load(api);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("falls back to the one before when the newest isn't finished, flagged, kept 2 minutes", async () => {
    const api = fakeApi({ new: summary("new", { ready: false }), old: summary("old") });
    const r = await load(api);
    expect(r?.summary.calculationId).toBe("old");
    expect(r?.newestPending).toBe(true);
    expect(peekTaxSoFarCache("u1", YEAR)?.ttl).toBe(TAX_SO_FAR_SHORT_CACHE_MS);
    expect(peekTaxSoFarCache("u1", YEAR)?.newestId).toBe("new");

    clock += TAX_SO_FAR_SHORT_CACHE_MS - 1;
    await load(api);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("after 2 minutes with the same newest still not finished, asks only about the newest", async () => {
    const api = fakeApi({ new: summary("new", { ready: false }), old: summary("old") });
    await load(api);
    expect(api.get).toHaveBeenCalledTimes(2);

    clock += TAX_SO_FAR_SHORT_CACHE_MS;
    const r = await load(api);
    expect(r?.summary.calculationId).toBe("old");
    expect(r?.newestPending).toBe(true);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(api.get.mock.calls[2][0]).toBe("new");
  });

  it("switches to the newest once HMRC finishes it, and keeps it 15 minutes", async () => {
    const byId = { new: summary("new", { ready: false }), old: summary("old") };
    const api = fakeApi(byId);
    await load(api);
    byId.new = summary("new");
    clock += TAX_SO_FAR_SHORT_CACHE_MS;
    const r = await load(api);
    expect(r?.summary.calculationId).toBe("new");
    expect(r?.newestPending).toBe(false);
    expect(peekTaxSoFarCache("u1", YEAR)?.ttl).toBe(TAX_SO_FAR_CACHE_MS);
  });

  it("treats a finished newest with no figure like an unfinished one", async () => {
    const api = fakeApi({ new: summary("new", { totalIncomeTaxAndNicsDue: undefined }), old: summary("old") });
    const r = await load(api);
    expect(r?.summary.calculationId).toBe("old");
    expect(r?.newestPending).toBe(true);
    expect(peekTaxSoFarCache("u1", YEAR)?.ttl).toBe(TAX_SO_FAR_SHORT_CACHE_MS);
  });

  it("none usable: null, kept 2 minutes", async () => {
    const api = fakeApi({ new: summary("new", { ready: false }), old: summary("old", { ready: false }) });
    expect(await load(api)).toBeNull();
    expect(peekTaxSoFarCache("u1", YEAR)?.ttl).toBe(TAX_SO_FAR_SHORT_CACHE_MS);
    await load(api);
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it("no calculations yet: null after one list read", async () => {
    const api = fakeApi({}, []);
    expect(await load(api)).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("pull to refresh (forced) skips a fresh cache", async () => {
    const api = fakeApi({ new: summary("new"), old: summary("old") });
    await load(api);
    await load(api, { forced: true });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("stops before each read once cancelled and caches nothing", async () => {
    const api = fakeApi({ new: summary("new"), old: summary("old") });
    let cancelled = false;
    api.list.mockImplementation(async () => {
      cancelled = true;
      return LIST;
    });
    const r = await load(api, { isCancelled: () => cancelled });
    expect(r).toBeUndefined();
    expect(api.get).not.toHaveBeenCalled();
    expect(peekTaxSoFarCache("u1", YEAR)).toBeNull();
  });

  it("does nothing at all when cancelled before starting", async () => {
    const api = fakeApi({ new: summary("new") });
    expect(await load(api, { isCancelled: () => true })).toBeUndefined();
    expect(api.list).not.toHaveBeenCalled();
  });

  it("a failed read throws and caches nothing", async () => {
    const api = fakeApi({});
    api.list.mockRejectedValue(new Error("HMRC down"));
    await expect(load(api)).rejects.toThrow("HMRC down");
    expect(peekTaxSoFarCache("u1", YEAR)).toBeNull();
  });

  it("never reads another driver's cache", async () => {
    const api = fakeApi({ new: summary("new") });
    await load(api);
    await loadTaxSoFar({ userId: "u2", taxYear: YEAR, forced: false, isCancelled: () => false, api, now });
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
