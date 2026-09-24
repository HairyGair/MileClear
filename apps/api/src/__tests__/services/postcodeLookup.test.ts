import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();
vi.mock("../../lib/redis.js", () => ({
  cacheGet: vi.fn(async (k: string) => store.get(k) ?? null),
  cacheSet: vi.fn(async (k: string, v: string) => void store.set(k, v)),
}));

import { postcodeKey, parseBulkReverse, postcodesFor } from "../../services/postcodeLookup.js";

beforeEach(() => {
  store.clear();
  vi.restoreAllMocks();
});

describe("postcodeKey", () => {
  it("rounds to about 11 m and refuses unusable points", () => {
    expect(postcodeKey({ lat: 54.99704, lng: -1.61961 })).toBe("pc:54.9970,-1.6196");
    expect(postcodeKey({ lat: null, lng: -1 })).toBeNull();
    expect(postcodeKey({ lat: 0, lng: 0 })).toBeNull();
  });
});

describe("parseBulkReverse", () => {
  it("returns one postcode per query, in order, null where none was found", () => {
    const body = { result: [{ result: [{ postcode: "NE3 1AA" }] }, { result: null }] };
    expect(parseBulkReverse(body, 2)).toEqual(["NE3 1AA", null]);
  });
  it("copes with a malformed body", () => {
    expect(parseBulkReverse({}, 2)).toEqual([null, null]);
  });
});

describe("postcodesFor", () => {
  it("looks each point up once, in batches, and caches the answer", async () => {
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const q = JSON.parse(init.body).geolocations as unknown[];
      return new Response(JSON.stringify({ result: q.map((_, i) => ({ result: [{ postcode: `PC${i}` }] })) }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const a = { lat: 54.1, lng: -1.1 };
    const b = { lat: 54.2, lng: -1.2 };
    expect(await postcodesFor([a, b, a])).toEqual(["PC0", "PC1", "PC0"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await postcodesFor([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(1); // both cached now
  });
  it("gives blanks, not an error, when the service fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await postcodesFor([{ lat: 51, lng: -0.1 }, { lat: null, lng: null }])).toEqual([null, null]);
  });
});
