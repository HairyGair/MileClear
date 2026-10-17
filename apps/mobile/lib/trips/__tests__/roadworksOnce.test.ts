import { describe, it, expect, vi } from "vitest";
import type { TripRoadworksResponse } from "@mileclear/shared";
import { fetchRoadworksOnce } from "../roadworksOnce";

const answer: TripRoadworksResponse = {
  data: {
    items: [{ streetName: "Derby Street", phrase: "Temporary lights on Derby Street (BT)", promoter: "BT", startAt: null, endAt: null }],
    attribution: "Roadworks: contains public sector information from DfT Street Manager",
  },
};

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("fetchRoadworksOnce", () => {
  it("fetches once, then not again for the same trip", async () => {
    const asked = { current: null as string | null };
    const fetch = vi.fn().mockResolvedValue(answer);
    const onResult = vi.fn();
    fetchRoadworksOnce({ id: "t1", asked, fetch, onResult });
    await flush();
    expect(onResult).toHaveBeenCalledWith(answer.data);
    fetchRoadworksOnce({ id: "t1", asked, fetch, onResult });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a cancel before the answer (an early Edit tap) lets it run again on the way back", async () => {
    const asked = { current: null as string | null };
    const fetch = vi.fn().mockResolvedValue(answer);
    const onResult = vi.fn();
    const cancel = fetchRoadworksOnce({ id: "t1", asked, fetch, onResult });
    cancel();
    await flush();
    expect(onResult).not.toHaveBeenCalled();
    expect(asked.current).toBeNull();
    fetchRoadworksOnce({ id: "t1", asked, fetch, onResult });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it("stays silent on an error and tries again next time", async () => {
    const asked = { current: null as string | null };
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(answer);
    const onResult = vi.fn();
    fetchRoadworksOnce({ id: "t1", asked, fetch, onResult });
    await flush();
    expect(onResult).not.toHaveBeenCalled();
    fetchRoadworksOnce({ id: "t1", asked, fetch, onResult });
    await flush();
    expect(onResult).toHaveBeenCalledWith(answer.data);
  });
});
