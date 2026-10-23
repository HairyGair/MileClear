// The "Client for the trip report and trips CSV" choices on Tax > Downloads.
// Pure so it can be unit tested (no runtime import of @mileclear/shared, which
// the Playwright unit specs cannot load).
import type { ExportProjectChoice } from "@mileclear/shared";

/**
 * `listed` is exportProjectChoices(labels): All clients first, then each
 * label. A client the driver chose that has since left the list (its trips
 * relabelled elsewhere) stays in it and stays chosen, never a silent switch
 * to All clients: its download then says Client not found. Null when there
 * is nothing to choose and nothing chosen.
 */
export function exportClientOptions(
  listed: ExportProjectChoice[] | null,
  chosen: string
): ExportProjectChoice[] | null {
  if (!chosen || listed?.some((c) => c.projectLabel === chosen)) return listed;
  return [...(listed ?? [{ projectLabel: undefined, label: "All clients" }]), { projectLabel: chosen, label: chosen }];
}
