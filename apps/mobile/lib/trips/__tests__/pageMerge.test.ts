import { describe, it, expect } from "vitest";
import { mergeTripPage, uniqueById } from "../pageMerge";
import { groupTripsByDay } from "../dayOrder";

const t = (id: string, extra: Record<string, unknown> = {}) => ({ id, startedAt: "2026-09-22T14:13:10Z", ...extra });
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("mergeTripPage", () => {
  it("appends a page that shares nothing with the list", () => {
    expect(ids(mergeTripPage([t("a"), t("b")], [t("c"), t("d")]))).toEqual(["a", "b", "c", "d"]);
  });

  it("does not repeat the trip that slid from the end of page 1 onto page 2", () => {
    // Chris Saunders, 24 Sep 2026: his 22 Sep drive was the 20th newest trip,
    // the last row of page 1. A new drive synced, everything slid down one,
    // and page 2 opened with the same drive.
    const page1 = Array.from({ length: 20 }, (_, i) => t(`p${i + 1}`));
    const page2 = [t("p20"), t("p21"), t("p22")];
    const merged = mergeTripPage(page1, page2);
    expect(merged).toHaveLength(22);
    expect(merged.filter((x) => x.id === "p20")).toHaveLength(1);
    expect(ids(merged).slice(-3)).toEqual(["p20", "p21", "p22"]);
  });

  it("keeps a repeated trip in its place but takes the fresher copy", () => {
    const merged = mergeTripPage(
      [t("a"), t("b", { classification: "unclassified" })],
      [t("b", { classification: "business" }), t("c")]
    );
    expect(ids(merged)).toEqual(["a", "b", "c"]);
    expect(merged[1]).toMatchObject({ classification: "business" });
  });

  it("loading the same page twice changes nothing", () => {
    const list = [t("a"), t("b"), t("c")];
    const page = [t("b"), t("c")];
    expect(ids(mergeTripPage(mergeTripPage(list, page), page))).toEqual(["a", "b", "c"]);
  });

  it("heals a list that already repeats a trip", () => {
    expect(ids(mergeTripPage([t("a"), t("a"), t("b")], [t("a")]))).toEqual(["a", "b"]);
  });

  it("never drops a trip that is only on screen", () => {
    // A local, not-yet-synced trip sits on page 1 but never comes back from
    // the server; appending a page must keep it.
    const merged = mergeTripPage([t("local-1", { _isLocal: true }), t("s1")], [t("s2")]);
    expect(ids(merged)).toEqual(["local-1", "s1", "s2"]);
  });
});

describe("uniqueById", () => {
  it("keeps the first copy and the order", () => {
    const out = uniqueById([t("a", { n: 1 }), t("b"), t("a", { n: 2 }), t("c")]);
    expect(ids(out)).toEqual(["a", "b", "c"]);
    expect(out[0]).toMatchObject({ n: 1 });
  });
});

describe("groupTripsByDay with a repeated trip", () => {
  it("shows the trip once, so every row keeps its own key", () => {
    const rows = groupTripsByDay(
      [t("x"), t("x"), t("y", { startedAt: "2026-09-22T09:00:00Z" })],
      new Date(2026, 8, 24, 16, 0)
    );
    const tripIds = rows.flatMap((r) => (r.kind === "trip" ? [r.trip.id] : []));
    expect(tripIds.sort()).toEqual(["x", "y"]);
  });
});
