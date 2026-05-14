// Routing-call telemetry — aggregates from detection_events of type
// 'routing_call' over the last 24h, grouped by source.
//
// Every routing decision (cache hit, GraphHopper, Google fallback,
// haversine fallback) should call logDetectionEvent("routing_call",
// { source, distanceMiles, latencyMs }) when it completes. This helper
// rolls the events up into a summary for diagnostic dumps.
//
// We use detection_events (existing table) rather than introducing a
// new SQLite table to keep the schema migration surface zero. Routing
// events naturally age out as the 200-event cap rolls forward.

import { getDatabase } from "../db";

export interface RoutingStats {
  totalCalls: number;
  bySource: Record<string, { count: number; avgLatencyMs: number }>;
  windowHours: number;
}

export async function getRoutingStats(windowHours = 24): Promise<RoutingStats> {
  const stats: RoutingStats = {
    totalCalls: 0,
    bySource: {},
    windowHours,
  };
  try {
    const db = await getDatabase();
    const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const rows = await db.getAllAsync<{ data: string }>(
      "SELECT data FROM detection_events WHERE event = 'routing_call' AND recorded_at >= ? ORDER BY recorded_at DESC",
      [cutoff]
    );
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data) as {
          source?: string;
          latencyMs?: number;
        };
        const source = parsed.source ?? "unknown";
        const latency = parsed.latencyMs ?? 0;
        const bucket = stats.bySource[source] ?? { count: 0, avgLatencyMs: 0 };
        // Running average: (avg * count + latency) / (count + 1)
        bucket.avgLatencyMs = Math.round(
          (bucket.avgLatencyMs * bucket.count + latency) / (bucket.count + 1)
        );
        bucket.count += 1;
        stats.bySource[source] = bucket;
        stats.totalCalls += 1;
      } catch {
        // Skip malformed event payloads
      }
    }
  } catch {
    // SQLite read failed; return empty stats
  }
  return stats;
}
