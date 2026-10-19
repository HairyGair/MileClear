import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { photonFirstProvider, SearchFailure, type PhotonPlace } from "../photonSearch";
import type { PlaceResult, PlaceSearchProvider } from "../placeSearch";

const NEAR = { lat: 54.97, lng: -1.61 };
const SAGE: PhotonPlace = { name: "Sage Gateshead", address: "St Mary's Square, Gateshead, NE8 2JR", lat: 54.9675, lng: -1.6008, kind: "place" };

function fallback(results: PlaceResult[] = [{ id: "gp:1", title: "From the old search", subtitle: null }]) {
  const calls: string[] = [];
  const p: PlaceSearchProvider = {
    search: async (q) => {
      calls.push(q);
      return results;
    },
    resolve: async () => ({ lat: 1, lng: 2, label: "resolved" }),
  };
  return { p, calls };
}

describe("our own search first", () => {
  it("answers from /navigation/search, with coordinates and a short address, sending near", async () => {
    const fb = fallback();
    const fetchPlaces = vi.fn(async () => [SAGE]);
    const provider = photonFirstProvider({ fetchPlaces, fallback: fb.p, lookupPostcode: async () => null });
    const r = await provider.search("sage", NEAR);
    expect(r).toEqual([
      { id: expect.stringMatching(/^ph:0:/), title: "Sage Gateshead", subtitle: "St Mary's Square, Gateshead, NE8 2JR", lat: 54.9675, lng: -1.6008 },
    ]);
    expect(fetchPlaces).toHaveBeenCalledWith("sage", NEAR, expect.anything());
    expect(fb.calls).toEqual([]);
    expect(await provider.resolve(r[0])).toEqual({ lat: 54.9675, lng: -1.6008, label: "Sage Gateshead" });
  });

  it("2 characters is enough; 1 is not", async () => {
    const fetchPlaces = vi.fn(async () => [SAGE]);
    const provider = photonFirstProvider({ fetchPlaces, fallback: fallback().p, lookupPostcode: async () => null });
    expect(await provider.search("s", NEAR)).toEqual([]);
    expect(fetchPlaces).not.toHaveBeenCalled();
    expect((await provider.search("sa", NEAR)).length).toBe(1);
  });

  it("a postcode is looked up first", async () => {
    const fetchPlaces = vi.fn(async () => [SAGE]);
    const pc: PlaceResult = { id: "pc:NE8 2JR", title: "NE8 2JR", subtitle: "Gateshead", lat: 54.96, lng: -1.6 };
    const provider = photonFirstProvider({ fetchPlaces, fallback: fallback().p, lookupPostcode: async () => pc });
    expect(await provider.search("NE8 2JR", NEAR)).toEqual([pc]);
    expect(fetchPlaces).not.toHaveBeenCalled();
  });

  it("no places from ours is an answer, not a reason to fall back", async () => {
    const fb = fallback();
    const provider = photonFirstProvider({ fetchPlaces: async () => [], fallback: fb.p, lookupPostcode: async () => null });
    expect(await provider.search("zzzz", NEAR)).toEqual([]);
    expect(fb.calls).toEqual([]);
  });
});

describe("silent fallback to the existing search", () => {
  for (const kind of ["unavailable", "offline"] as const) {
    it(`${kind}: the existing search answers, nothing is said`, async () => {
      const fb = fallback();
      const provider = photonFirstProvider({
        fetchPlaces: async () => {
          throw new SearchFailure(kind);
        },
        fallback: fb.p,
        lookupPostcode: async () => null,
      });
      expect((await provider.search("sage", NEAR))[0].title).toBe("From the old search");
      expect(fb.calls).toEqual(["sage"]);
    });
  }

  it("too slow (3 s): aborted and the existing search answers", async () => {
    vi.useFakeTimers();
    const fb = fallback();
    let aborted = false;
    const provider = photonFirstProvider({
      fetchPlaces: (_q, _n, signal) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new SearchFailure("aborted"));
          });
        }),
      fallback: fb.p,
      lookupPostcode: async () => null,
    });
    const p = provider.search("sage", NEAR);
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await p)[0].title).toBe("From the old search");
    expect(aborted).toBe(true);
    vi.useRealTimers();
  });

  it("bad input: no results, no fallback", async () => {
    const fb = fallback();
    const provider = photonFirstProvider({
      fetchPlaces: async () => {
        throw new SearchFailure("bad_input");
      },
      fallback: fb.p,
      lookupPostcode: async () => null,
    });
    expect(await provider.search("!!", NEAR)).toEqual([]);
    expect(fb.calls).toEqual([]);
  });
});

describe("stale requests", () => {
  it("a newer search aborts the older one, which never answers or falls back", async () => {
    const fb = fallback();
    const resolvers: Array<(v: PhotonPlace[]) => void> = [];
    const signals: AbortSignal[] = [];
    const provider = photonFirstProvider({
      fetchPlaces: (_q, _n, signal) => {
        signals.push(signal);
        return new Promise((resolve, reject) => {
          resolvers.push(resolve);
          signal.addEventListener("abort", () => reject(new SearchFailure("aborted")));
        });
      },
      fallback: fb.p,
      lookupPostcode: async () => null,
    });
    const first = provider.search("sa", NEAR);
    const second = provider.search("sage", NEAR);
    expect(signals[0].aborted).toBe(true);
    await expect(first).rejects.toMatchObject({ kind: "aborted" });
    resolvers[1]([SAGE]);
    expect((await second)[0].title).toBe("Sage Gateshead");
    expect(fb.calls).toEqual([]);
  });

  it("cancel() (field cleared, screen closed) aborts what is in flight", async () => {
    let signal: AbortSignal | null = null;
    const provider = photonFirstProvider({
      fetchPlaces: (_q, _n, s) => {
        signal = s;
        return new Promise(() => {});
      },
      fallback: fallback().p,
      lookupPostcode: async () => null,
    });
    void provider.search("sage", NEAR).catch(() => {});
    provider.cancel();
    expect(signal!.aborted).toBe(true);
  });
});

describe("the search text is never logged", () => {
  it("no console call in the search code", () => {
    const root = join(__dirname, "..", "..", "..");
    for (const f of ["lib/navigation/photonSearch.ts", "lib/api/navigation.ts", "components/directions/DestinationPicker.tsx"]) {
      expect(readFileSync(join(root, f), "utf8"), f).not.toMatch(/console\./);
    }
  });
});
