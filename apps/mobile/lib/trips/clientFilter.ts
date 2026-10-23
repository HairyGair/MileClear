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
import { getTaxYear, parseTaxYear, projectLabelKey } from "@mileclear/shared";

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

/**
 * The Trips tab link for a row on Miles by project. The row counts one tax
 * year's Business trips for that client, so the link opens exactly that:
 * the client (or No client for "No project"), Business, and the tax year.
 */
export function projectTripsHref(label: string | null, taxYear: string): string {
  const client = label === null ? "noClient=1" : `client=${encodeURIComponent(label)}`;
  return `/(tabs)/trips?${client}&filter=business&taxYear=${encodeURIComponent(taxYear)}`;
}

/**
 * The Trips tab's date range for a tax year from a link: This tax year or
 * Last tax year when it is one of those (the same bounds, nicer label), else
 * a Choose dates range from 6 April to 5 April. Null for a malformed year.
 */
export function taxYearDateRange(
  taxYear: string,
  now: Date = new Date()
): { range: "taxYear" } | { range: "lastTaxYear" } | { range: "custom"; from: Date; to: Date } | null {
  let bounds: { start: Date; end: Date };
  try {
    bounds = parseTaxYear(taxYear);
  } catch {
    return null;
  }
  const current = getTaxYear(now);
  if (taxYear === current) return { range: "taxYear" };
  const start = parseInt(current.slice(0, 4), 10) - 1;
  if (taxYear === `${start}-${String(start + 1).slice(2)}`) return { range: "lastTaxYear" };
  const to = new Date(bounds.end);
  to.setHours(0, 0, 0, 0);
  return { range: "custom", from: bounds.start, to };
}

/**
 * The queued trip uploads that carry a projectLabel key, oldest first, with
 * just that value: SQLite reads it out of the JSON, so a payload full of
 * breadcrumbs is never parsed in JavaScript. label_type is json_type's answer
 * ('text' for a label, 'null' when the upload clears it); payloads that are
 * not valid JSON, or have no projectLabel key, are left out. CASE keeps
 * json_type off malformed payloads (it would raise an error on them).
 */
export const QUEUED_PROJECT_LABELS_SQL = `
  SELECT entity_id, label_type, label FROM (
    SELECT rowid AS rid, entity_id,
      CASE WHEN json_valid(payload) THEN json_type(payload, '$.projectLabel') END AS label_type,
      CASE WHEN json_valid(payload) THEN json_extract(payload, '$.projectLabel') END AS label
    FROM sync_queue
    WHERE entity_type = 'trip' AND action IN ('create', 'update') AND status != 'synced'
      AND payload IS NOT NULL
  )
  WHERE label_type IS NOT NULL
  ORDER BY rid ASC`;

/** One row of QUEUED_PROJECT_LABELS_SQL. */
export interface QueuedTripLabel {
  entity_id: string;
  label_type: string;
  label: unknown;
}

/**
 * Each queued trip's Project / client as it will reach the server: the
 * newest upload that carries a projectLabel wins (null = cleared). Trips with
 * none are absent from the map. Rows must be in queue order, oldest first.
 */
export function pendingProjectLabels(rows: readonly QueuedTripLabel[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const r of rows) {
    out.set(r.entity_id, r.label_type === "text" && typeof r.label === "string" ? r.label : null);
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
