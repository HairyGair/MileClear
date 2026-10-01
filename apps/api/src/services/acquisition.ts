// "How did you hear about MileClear?" counts for the admin overview. Pure so
// it can be tested; the admin route fetches the events.

import { ACQUISITION_SOURCES } from "@mileclear/shared";

export interface AcquisitionRollup {
  answered: number;
  skipped: number;
  bySource: Array<{ value: string; label: string; count: number }>;
  /** What drivers typed under Other, newest first. */
  otherDetails: Array<{ detail: string; at: string }>;
}

type Row = { userId: string | null; type: string; createdAt: Date; metadata: unknown };

export function acquisitionRollup(rows: Row[]): AcquisitionRollup {
  // Latest answer per driver wins; a skip only counts if they never answered.
  const latest = new Map<string, Row>();
  const skippedUsers = new Set<string>();
  for (const r of rows) {
    if (!r.userId) continue;
    if (r.type === "user.acquisition_source_skipped") {
      skippedUsers.add(r.userId);
      continue;
    }
    const prev = latest.get(r.userId);
    if (!prev || prev.createdAt < r.createdAt) latest.set(r.userId, r);
  }
  const counts = new Map<string, number>();
  const otherDetails: Array<{ detail: string; at: string }> = [];
  for (const r of latest.values()) {
    const m = (r.metadata ?? {}) as { source?: string; detail?: string };
    const source = m.source ?? "other";
    counts.set(source, (counts.get(source) ?? 0) + 1);
    if (source === "other" && m.detail) otherDetails.push({ detail: m.detail, at: r.createdAt.toISOString() });
  }
  otherDetails.sort((a, b) => (a.at < b.at ? 1 : -1));
  return {
    answered: latest.size,
    skipped: [...skippedUsers].filter((u) => !latest.has(u)).length,
    bySource: ACQUISITION_SOURCES.map((s) => ({ value: s.value, label: s.label, count: counts.get(s.value) ?? 0 })).sort(
      (a, b) => b.count - a.count
    ),
    otherDetails: otherDetails.slice(0, 20),
  };
}
