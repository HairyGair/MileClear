import { describe, it, expect } from "vitest";
import type { SaChecklistItem } from "@mileclear/shared";
import { visibleChecklistItems } from "./checklistItems";

const item = (id: string, status: SaChecklistItem["status"], action: string | null = null) =>
  ({ id, status, title: id, detail: "", action, actionLabel: null }) as unknown as SaChecklistItem;

describe("visibleChecklistItems", () => {
  it("drops the mileage item when there are no trips at all", () => {
    const out = visibleChecklistItems([item("trips_sorted", "attention", "add_trip"), item("mileage_claim", "attention", "add_trip"), item("earnings", "done")]);
    expect(out.map((i) => i.id)).toEqual(["trips_sorted", "earnings"]);
  });
  it("keeps it when trips only need sorting", () => {
    const out = visibleChecklistItems([item("trips_sorted", "attention", "unclassified_trips"), item("mileage_claim", "attention")]);
    expect(out).toHaveLength(2);
  });
  it("keeps everything when trips are sorted", () => {
    expect(visibleChecklistItems([item("trips_sorted", "done"), item("mileage_claim", "done")])).toHaveLength(2);
  });
});
