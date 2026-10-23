/**
 * One-client trip lists and reports (driver feedback, 23 Oct 2026: "I use my
 * car for more than one business and therefore mileage is charged to
 * different clients"). The Trips list, the CSV and the Trip Report PDF take an
 * optional Project / client label; these helpers name the client the same way
 * on the server, the app and the website.
 *
 * A label matches by projectLabelKey (trimmed, inner spaces collapsed, lower
 * case), the same rule Miles by project groups by, so "NHS", "nhs" and
 * " NHS " are one client.
 */
import { projectLabelKey } from "./projectMileage.js";

/** The Project / client column is VarChar(100). */
export const PROJECT_LABEL_MAX_LENGTH = 100;

/** True when a trip's label is the client with this key (from projectLabelKey). */
export function projectLabelMatches(tripLabel: string | null | undefined, key: string): boolean {
  return key !== "" && projectLabelKey(tripLabel) === key;
}

/** "  NHS   Trust " -> "NHS Trust": trimmed with single spaces, for headings. */
export function exportProjectLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ") || "Client";
}

/**
 * File-name safe: lower case letters, digits and single hyphens only, at most
 * 40 characters. "nhs-trust". Never empty ("client").
 */
export function exportProjectSlug(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "client";
}

export interface ExportProjectChoice {
  /** undefined means every client (and trips with none). */
  projectLabel: string | undefined;
  label: string;
}

/**
 * The "Which client?" choices for the CSV and Trip Report: "All clients"
 * first, then each label the driver has used. Null when no trip has a label,
 * so the download goes straight through as before.
 */
export function exportProjectChoices(labels: string[]): ExportProjectChoice[] | null {
  const seen = new Set<string>();
  const rows: ExportProjectChoice[] = [];
  for (const raw of labels) {
    const key = projectLabelKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const label = exportProjectLabel(raw);
    rows.push({ projectLabel: label, label });
  }
  if (rows.length === 0) return null;
  return [{ projectLabel: undefined, label: "All clients" }, ...rows];
}
