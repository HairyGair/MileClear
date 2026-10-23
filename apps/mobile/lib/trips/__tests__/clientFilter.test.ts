import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Node's built-in SQLite, loaded with require: Vite does not resolve the
// newer node:sqlite builtin by import.
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): unknown; all(): unknown[] };
  close(): void;
}
type SqliteCtor = new (path: string) => SqliteDb;
let DatabaseSync: SqliteCtor | null = null;
try {
  DatabaseSync = (createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: SqliteCtor }).DatabaseSync;
} catch {
  // Node before 22.13 needs a flag for it: those queue tests are skipped.
}
import {
  ALL_CLIENTS,
  clientFilterChoices,
  clientFilterLabel,
  clientFilterParams,
  filterLocalTripsByClient,
  localTripMatchesClient,
  pendingProjectLabels,
  projectTripsHref,
  QUEUED_PROJECT_LABELS_SQL,
  type QueuedTripLabel,
  sameClientFilter,
  taxYearDateRange,
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

describe("Miles by project links", () => {
  it("open the same trips the row counts: that client, Business, that tax year", () => {
    expect(projectTripsHref("NHS Trust", "2026-27")).toBe(
      "/(tabs)/trips?client=NHS%20Trust&filter=business&taxYear=2026-27"
    );
    expect(projectTripsHref(null, "2025-26")).toBe("/(tabs)/trips?noClient=1&filter=business&taxYear=2025-26");
  });

  it("this and last tax year use their own date chips; older years a 6 April to 5 April range", () => {
    const now = new Date(2026, 9, 23);
    expect(taxYearDateRange("2026-27", now)).toEqual({ range: "taxYear" });
    expect(taxYearDateRange("2025-26", now)).toEqual({ range: "lastTaxYear" });
    expect(taxYearDateRange("2023-24", now)).toEqual({
      range: "custom",
      from: new Date(2023, 3, 6),
      to: new Date(2024, 3, 5),
    });
    expect(taxYearDateRange("2026-28", now)).toBeNull();
    expect(taxYearDateRange("nonsense", now)).toBeNull();
  });
});

/**
 * The queue read runs for real on Node's built-in SQLite (the same JSON
 * functions expo-sqlite has), against the sync_queue table as lib/db creates
 * it. Rows go in in queue order.
 */
function queuedLabels(rows: { entity_id: string; payload: string | null; action?: string; status?: string; entity_type?: string }[]) {
  const db = new DatabaseSync!(":memory:");
  db.exec(`CREATE TABLE sync_queue (
    id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
    payload TEXT, status TEXT NOT NULL DEFAULT 'pending', retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT
  )`);
  const insert = db.prepare(
    "INSERT INTO sync_queue (id, entity_type, entity_id, action, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  // Ids and created_at deliberately out of order: only rowid decides.
  rows.forEach((r, i) =>
    insert.run(`q${rows.length - i}`, r.entity_type ?? "trip", r.entity_id, r.action ?? "update", r.payload, r.status ?? "pending", "2026-01-01")
  );
  const out = db.prepare(QUEUED_PROJECT_LABELS_SQL).all() as unknown as QueuedTripLabel[];
  db.close();
  return pendingProjectLabels(out);
}

describe.skipIf(!DatabaseSync)("the Project / client of trips still to upload", () => {
  it("takes each trip's newest queued upload that carries a projectLabel", () => {
    const labels = queuedLabels([
      { entity_id: "a", action: "create", payload: JSON.stringify({ projectLabel: "NHS Trust", startLat: 1 }) },
      { entity_id: "a", payload: JSON.stringify({ id: "a", coordinates: [{ lat: 1, lng: 2 }] }) }, // a merge: says nothing
      { entity_id: "b", payload: JSON.stringify({ projectLabel: "Private practice" }) },
      { entity_id: "b", payload: JSON.stringify({ id: "b", projectLabel: null }) }, // cleared later: wins
      { entity_id: "c", payload: JSON.stringify({ startLat: 1 }) },
      { entity_id: "d", payload: JSON.stringify({ projectLabel: null }) },
      { entity_id: "d", payload: JSON.stringify({ projectLabel: "Later" }) },
    ]);
    expect(labels.get("a")).toBe("NHS Trust");
    expect(labels.get("b")).toBeNull();
    expect(labels.has("b")).toBe(true);
    expect(labels.has("c")).toBe(false);
    expect(labels.get("d")).toBe("Later");
  });

  it("skips empty, malformed and non-object payloads, and treats a non-text label as none", () => {
    const labels = queuedLabels([
      { entity_id: "a", payload: JSON.stringify({ projectLabel: "Kept" }) },
      { entity_id: "a", payload: null },
      { entity_id: "a", payload: "{not json" },
      { entity_id: "a", payload: "null" },
      { entity_id: "a", payload: "[]" },
      { entity_id: "x", payload: JSON.stringify({ projectLabel: 42 }) },
    ]);
    expect(labels.get("a")).toBe("Kept");
    expect(labels.get("x")).toBeNull();
  });

  it("reads only unsent trip creates and updates", () => {
    const labels = queuedLabels([
      { entity_id: "s", status: "synced", payload: JSON.stringify({ projectLabel: "Old" }) },
      { entity_id: "f", status: "failed", payload: JSON.stringify({ projectLabel: "Failed" }) },
      { entity_id: "p", status: "permanently_failed", payload: JSON.stringify({ projectLabel: "Stuck" }) },
      { entity_id: "e", entity_type: "earning", payload: JSON.stringify({ projectLabel: "Earning" }) },
      { entity_id: "del", action: "delete", payload: JSON.stringify({ projectLabel: "Gone" }) },
    ]);
    expect([...labels.keys()].sort()).toEqual(["f", "p"]);
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
