import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchTaxOverview = vi.fn();
vi.mock("../api/tax", () => ({ fetchTaxOverview: (...a: unknown[]) => fetchTaxOverview(...a) }));
vi.mock("../db", () => ({
  getDatabase: async () => ({
    getFirstAsync: async () => null,
    runAsync: async () => undefined,
  }),
}));
vi.mock("../auth/context", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("react", () => ({ useCallback: (f: unknown) => f, useEffect: () => {}, useState: () => [0, () => {}] }));

import { clearTaxOverviewCache, getTaxOverviewState, load } from "../tax/useTaxOverview";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("tax overview and sign out", () => {
  beforeEach(() => {
    fetchTaxOverview.mockReset();
    clearTaxOverviewCache();
  });

  it("drops a response that lands after sign out", async () => {
    const d = deferred<{ data: { marker: string } }>();
    fetchTaxOverview.mockReturnValueOnce(d.promise);
    const running = load({});
    clearTaxOverviewCache(); // driver signs out while the request runs
    d.resolve({ data: { marker: "old driver" } });
    await running;
    expect(getTaxOverviewState().data).toBeNull();
    expect(getTaxOverviewState().loading).toBe(false);
  });

  it("lets the next driver load while the old request is still running", async () => {
    const old = deferred<{ data: { marker: string } }>();
    fetchTaxOverview.mockReturnValueOnce(old.promise);
    const oldRun = load({});
    clearTaxOverviewCache();
    fetchTaxOverview.mockResolvedValueOnce({ data: { marker: "new driver" } });
    await load({});
    old.resolve({ data: { marker: "old driver" } });
    await oldRun;
    expect((getTaxOverviewState().data as unknown as { marker: string }).marker).toBe("new driver");
  });

  it("still stores a normal response", async () => {
    fetchTaxOverview.mockResolvedValueOnce({ data: { marker: "me" } });
    await load({});
    expect((getTaxOverviewState().data as unknown as { marker: string }).marker).toBe("me");
  });
});
