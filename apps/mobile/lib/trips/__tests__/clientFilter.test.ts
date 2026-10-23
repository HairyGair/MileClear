import { describe, it, expect } from "vitest";
import {
  ALL_CLIENTS,
  clientFilterChoices,
  clientFilterLabel,
  clientFilterParams,
  filterLocalTripsByClient,
  localTripMatchesClient,
  pendingProjectLabels,
  sameClientFilter,
  type ClientFilter,
} from "../clientFilter";

const NHS: ClientFilter = { kind: "label", label: "NHS Trust" };
const NONE: ClientFilter = { kind: "none" };

describe("clientFilterParams", () => {
  it("sends nothing for All clients, so the list is exactly as before", () => {
    expect(clientFilterParams(ALL_CLIENTS)).toEqual({});
  });
  it("sends one client, or trips with no client", () => {
    expect(clientFilterParams(NHS)).toEqual({ projectLabel: "NHS Trust" });
    expect(clientFilterParams(NONE)).toEqual({ noProjectLabel: "true" });
  });
});

describe("clientFilterLabel / sameClientFilter", () => {
  it("names the filter for the chip and the summary card", () => {
    expect(clientFilterLabel(ALL_CLIENTS)).toBeNull();
    expect(clientFilterLabel(NONE)).toBe("No client");
    expect(clientFilterLabel(NHS)).toBe("NHS Trust");
  });
  it("treats two spellings of a client as the same choice", () => {
    expect(sameClientFilter(NHS, { kind: "label", label: " nhs  trust" })).toBe(true);
    expect(sameClientFilter(NHS, { kind: "label", label: "NHS" })).toBe(false);
    expect(sameClientFilter(NONE, NONE)).toBe(true);
    expect(sameClientFilter(NONE, ALL_CLIENTS)).toBe(false);
  });
});

describe("clientFilterChoices", () => {
  it("offers Any client, No client, then one chip per client", () => {
    const chips = clientFilterChoices(["NHS Trust", "nhs  trust", "Private practice"], ALL_CLIENTS);
    expect(chips.map((c) => c.label)).toEqual(["Any client", "No client", "NHS Trust", "Private practice"]);
    expect(new Set(chips.map((c) => c.key)).size).toBe(chips.length);
    expect(chips[2].value).toEqual({ kind: "label", label: "NHS Trust" });
  });

  it("keeps the chosen client on screen even before the labels load", () => {
    const chips = clientFilterChoices([], { kind: "label", label: "Acme " });
    expect(chips.map((c) => c.label)).toEqual(["Any client", "No client", "Acme"]);
    expect(clientFilterChoices(["ACME"], { kind: "label", label: "acme" })).toHaveLength(3);
  });
});

describe("pendingProjectLabels", () => {
  it("takes each trip's newest queued payload that carries a projectLabel", () => {
    const labels = pendingProjectLabels([
      { entity_id: "a", payload: JSON.stringify({ projectLabel: "NHS Trust", startLat: 1 }) },
      { entity_id: "a", payload: JSON.stringify({ id: "a", coordinates: [] }) }, // a merge: says nothing
      { entity_id: "b", payload: JSON.stringify({ projectLabel: "Private practice" }) },
      { entity_id: "b", payload: JSON.stringify({ id: "b", projectLabel: null }) }, // cleared later
      { entity_id: "c", payload: JSON.stringify({ startLat: 1 }) },
    ]);
    expect(labels.get("a")).toBe("NHS Trust");
    expect(labels.get("b")).toBeNull();
    expect(labels.has("c")).toBe(false);
  });

  it("skips empty and unreadable payloads", () => {
    const labels = pendingProjectLabels([
      { entity_id: "a", payload: null },
      { entity_id: "a", payload: "{not json" },
      { entity_id: "a", payload: "null" },
      { entity_id: "a", payload: JSON.stringify({ projectLabel: 42 }) },
    ]);
    expect(labels.get("a")).toBeNull();
    expect(pendingProjectLabels([{ entity_id: "x", payload: "[]" }]).size).toBe(0);
  });
});

describe("filtering trips on this phone", () => {
  it("matches the client however it was typed", () => {
    expect(localTripMatchesClient("  nhs trust ", NHS)).toBe(true);
    expect(localTripMatchesClient("NHS", NHS)).toBe(false);
    expect(localTripMatchesClient(null, NHS)).toBe(false);
    expect(localTripMatchesClient(undefined, NHS)).toBe(false);
  });

  it("No client takes trips with nothing queued, a cleared label or a blank one", () => {
    expect(localTripMatchesClient(undefined, NONE)).toBe(true);
    expect(localTripMatchesClient(null, NONE)).toBe(true);
    expect(localTripMatchesClient("  ", NONE)).toBe(true);
    expect(localTripMatchesClient("NHS Trust", NONE)).toBe(false);
  });

  it("keeps the matching trips in their order, and everything for All clients", () => {
    const trips = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const labels = new Map<string, string | null>([["a", "NHS Trust"], ["b", null], ["c", "nhs trust"]]);
    expect(filterLocalTripsByClient(trips, labels, NHS).map((t) => t.id)).toEqual(["a", "c"]);
    expect(filterLocalTripsByClient(trips, labels, NONE).map((t) => t.id)).toEqual(["b"]);
    expect(filterLocalTripsByClient(trips, labels, ALL_CLIENTS)).toEqual(trips);
  });
});
