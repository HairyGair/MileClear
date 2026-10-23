/**
 * The client filter on the Trips tab (driver feedback, 23 Oct 2026: "mileage
 * is charged to different clients ... separate them when filtering").
 *
 * The list comes from the server (GET /trips), which matches the Project /
 * client by projectLabelKey. Trips still on this phone (not uploaded yet) are
 * added to page 1 from SQLite, and the phone's trips table has no Project /
 * client column: the label a driver typed lives only in the trip's queued
 * upload (the create, or a later update). So an unsynced trip's client is
 * read from its newest queued payload that carries a projectLabel, and the
 * same key rule decides whether it belongs in the filtered list.
 *
 * Pure: no React, no database.
 */
import { projectLabelKey } from "@mileclear/shared";

/** "all": no client filter. "none": trips with no client. Else one label. */
export type ClientFilter = { kind: "all" } | { kind: "none" } | { kind: "label"; label: string };

export const ALL_CLIENTS: ClientFilter = { kind: "all" };

/** The query for GET /trips and /trips/summary. */
export function clientFilterParams(f: ClientFilter): { projectLabel?: string; noProjectLabel?: "true" } {
  if (f.kind === "none") return { noProjectLabel: "true" };
  if (f.kind === "label") return { projectLabel: f.label };
  return {};
}

/** The chip / summary card name: null when no client filter is on. */
export function clientFilterLabel(f: ClientFilter): string | null {
  if (f.kind === "none") return "No client";
  if (f.kind === "label") return f.label;
  return null;
}

export function sameClientFilter(a: ClientFilter, b: ClientFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "label" && b.kind === "label") return projectLabelKey(a.label) === projectLabelKey(b.label);
  return true;
}

export interface ClientFilterChoice {
  key: string;
  label: string;
  value: ClientFilter;
}

/**
 * The Which client chips: Any client, No client, then each label the driver
 * has used (one per client, as GET /trips/project-labels gives them). A
 * client chosen elsewhere (Miles by project) that isn't in the list yet is
 * added, so the chip that is on is always on screen.
 */
export function clientFilterChoices(labels: readonly string[], current: ClientFilter): ClientFilterChoice[] {
  const rows: ClientFilterChoice[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const key = projectLabelKey(raw);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const label = raw.trim().replace(/\s+/g, " ");
    rows.push({ key: `label:${key}`, label, value: { kind: "label", label } });
  };
  if (current.kind === "label") add(current.label);
  labels.forEach(add);
  return [
    { key: "all", label: "Any client", value: ALL_CLIENTS },
    { key: "none", label: "No client", value: { kind: "none" } },
    ...rows,
  ];
}

/** One sync_queue row for a trip, oldest first (rowid order). */
export interface QueuedTripPayload {
  entity_id: string;
  payload: string | null;
}

/**
 * Each queued trip's Project / client as it will reach the server: the
 * newest payload that carries a projectLabel key wins (null = cleared).
 * Trips with no such payload are absent from the map. Rows must be in
 * queue order, oldest first; unreadable payloads are skipped.
 */
export function pendingProjectLabels(rows: readonly QueuedTripPayload[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const r of rows) {
    if (!r.payload) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.payload);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || !("projectLabel" in parsed)) continue;
    const label = (parsed as { projectLabel?: unknown }).projectLabel;
    out.set(r.entity_id, typeof label === "string" ? label : null);
  }
  return out;
}

/**
 * Whether a trip on this phone belongs in the list under this filter.
 * `label` is the trip's pending Project / client (pendingProjectLabels), or
 * undefined when nothing queued says: treated as no client, which is what
 * the server will hold for it.
 */
export function localTripMatchesClient(label: string | null | undefined, f: ClientFilter): boolean {
  if (f.kind === "all") return true;
  const key = projectLabelKey(label);
  if (f.kind === "none") return key === "";
  return key !== "" && key === projectLabelKey(f.label);
}

/** Keep the phone's trips that match the filter (unsynced ones, by their queued label). */
export function filterLocalTripsByClient<T extends { id: string }>(
  trips: readonly T[],
  labels: ReadonlyMap<string, string | null>,
  f: ClientFilter
): T[] {
  if (f.kind === "all") return [...trips];
  return trips.filter((t) => localTripMatchesClient(labels.get(t.id), f));
}
