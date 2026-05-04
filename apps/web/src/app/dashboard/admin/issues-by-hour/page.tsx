"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

// Time-of-day issue patterns. Audit follow-up #5 of 5 (aggregate
// health-dashboard upgrades). Bar chart of diagnostic events bucketed
// by hour-of-day (UTC). Surfaces patterns: rush-hour reliability dips,
// timezone-related bug clusters, etc.
//
// Drill panels below the chart break perf.slow_request down by
// endpoint and surface iOS background-fetch denial as a snapshot.

interface Data {
  windowDays: number;
  series: Record<string, number[]>;       // type → 24-element array
  totalsByHour: number[];                  // 24 elements
  totalsByType: Record<string, number>;
  generatedAt: string;
}

interface SlowRow {
  key: string;
  method: string;
  path: string;
  count: number;
  avgDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  topStatus: number;
}

interface SlowData {
  windowDays: number;
  thresholdMs: number;
  totalEvents: number;
  rows: SlowRow[];
  distinctEndpoints: number;
  generatedAt: string;
}

interface BgFetchData {
  activeWindowDays: number;
  all: Record<string, number>;
  active: Record<string, number>;
  generatedAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  "watchdog.silent_push_sent": "#ef4444",
  "watchdog.drain_sync_push_sent": "#f97316",
  "alert.stuck_recording": "#dc2626",
  "alert.permission_missing": "#f59e0b",
  "alert.task_not_running": "#a855f7",
  "perf.slow_request": "#3b82f6",
  "auth.login_failed": "#06b6d4",
  "reconciliation.drift": "#ec4899",
};

const TYPE_LABELS: Record<string, string> = {
  "watchdog.silent_push_sent": "Stuck-recording wake",
  "watchdog.drain_sync_push_sent": "Sync-queue wake",
  "alert.stuck_recording": "Stuck recording (mobile)",
  "alert.permission_missing": "Permission revoked",
  "alert.task_not_running": "Background task off",
  "perf.slow_request": "Slow request",
  "auth.login_failed": "Login failed",
  "reconciliation.drift": "Reconciliation drift",
};

export default function IssuesByHourPage() {
  const [data, setData] = useState<Data | null>(null);
  const [slow, setSlow] = useState<SlowData | null>(null);
  const [bgFetch, setBgFetch] = useState<BgFetchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<{ data: Data }>("/admin/issues-by-hour"),
      api.get<{ data: SlowData }>("/admin/slow-requests-by-endpoint"),
      api.get<{ data: BgFetchData }>("/admin/background-fetch-status"),
    ])
      .then(([hourly, slowRes, bg]) => {
        if (cancelled) return;
        setData(hourly.data);
        setSlow(slowRes.data);
        setBgFetch(bg.data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const maxHour = data ? Math.max(...data.totalsByHour, 1) : 1;
  const sortedTypes = data
    ? Object.entries(data.totalsByType)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t)
    : [];

  return (
    <div style={{ padding: "1.5rem 0", maxWidth: 1200 }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/admin" style={{ color: "#94a3b8", fontSize: "0.875rem", textDecoration: "none" }}>
          ← Admin
        </Link>
      </div>

      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb", marginBottom: "0.5rem" }}>
        Issues by Hour (UTC)
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem", lineHeight: 1.6 }}>
        Diagnostic events from the last {data?.windowDays ?? 14} days bucketed by hour
        of day. Stacked by event type so you can spot rush-hour reliability dips,
        2am UTC timezone bugs, login storms, etc.
      </p>

      {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
      {error && <p style={{ color: "#ef4444" }}>Error: {error}</p>}

      {data && (
        <>
          {/* The chart */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(24, 1fr)",
              gap: 4,
              alignItems: "end",
              height: 240,
              padding: "1rem",
              background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 12,
              marginBottom: "1rem",
            }}
          >
            {Array.from({ length: 24 }, (_, hour) => {
              const total = data.totalsByHour[hour];
              return (
                <div
                  key={hour}
                  style={{ display: "flex", flexDirection: "column", alignItems: "stretch", height: "100%" }}
                  title={`${String(hour).padStart(2, "0")}:00 UTC — ${total} event${total !== 1 ? "s" : ""}`}
                >
                  <div style={{ flex: 1, display: "flex", flexDirection: "column-reverse", justifyContent: "flex-start" }}>
                    {sortedTypes.map((type) => {
                      const count = data.series[type]?.[hour] ?? 0;
                      if (count === 0) return null;
                      const seg = (count / maxHour) * 100;
                      return (
                        <div
                          key={type}
                          style={{
                            height: `${seg}%`,
                            background: TYPE_COLORS[type] ?? "#64748b",
                          }}
                        />
                      );
                    })}
                    {total === 0 && (
                      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginTop: "auto" }} />
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      textAlign: "center",
                      fontSize: "0.7rem",
                      color: "#64748b",
                      fontFamily: "monospace",
                    }}
                  >
                    {String(hour).padStart(2, "0")}
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.65rem",
                      color: "#cbd5e1",
                      minHeight: "0.9rem",
                    }}
                  >
                    {total > 0 ? total : ""}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
            {sortedTypes.map((type) => (
              <div key={type} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8125rem", color: "#cbd5e1" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: TYPE_COLORS[type] ?? "#64748b",
                  }}
                />
                <span>{TYPE_LABELS[type] ?? type}</span>
                <span style={{ color: "#64748b" }}>({data.totalsByType[type]?.toLocaleString("en-GB")})</span>
              </div>
            ))}
            {sortedTypes.length === 0 && (
              <span style={{ color: "#64748b", fontSize: "0.875rem" }}>
                No tracked diagnostic events in the last {data.windowDays} days.
              </span>
            )}
          </div>

          {/* Drill: slow requests by endpoint */}
          {slow && (
            <section style={{ marginTop: "2.5rem" }}>
              <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 700, color: "#f9fafb", margin: 0 }}>
                  Slow requests by endpoint
                </h2>
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                  {slow.totalEvents.toLocaleString("en-GB")} events over {slow.distinctEndpoints} endpoints (≥{slow.thresholdMs}ms, {slow.windowDays} days)
                </span>
              </header>

              {slow.rows.length === 0 ? (
                <p style={{ color: "#64748b", fontSize: "0.875rem" }}>No slow requests in the window.</p>
              ) : (
                <div
                  style={{
                    background: "rgba(15,23,42,0.6)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                    <thead>
                      <tr style={{ background: "rgba(15,23,42,0.9)", color: "#94a3b8", textAlign: "left" }}>
                        <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Endpoint</th>
                        <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, textAlign: "right" }}>Count</th>
                        <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, textAlign: "right" }}>Avg</th>
                        <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, textAlign: "right" }}>p95</th>
                        <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, textAlign: "right" }}>Max</th>
                        <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, textAlign: "right" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slow.rows.map((r, idx) => {
                        const totalCount = slow.rows.reduce((acc, row) => acc + row.count, 0);
                        const sharePct = totalCount === 0 ? 0 : (r.count / totalCount) * 100;
                        const avgClass = r.avgDurationMs > 8000 ? "#ef4444" : r.avgDurationMs > 4000 ? "#f59e0b" : "#cbd5e1";
                        return (
                          <tr key={r.key} style={{ borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", color: "#cbd5e1" }}>
                              <span style={{ color: "#64748b", marginRight: 6 }}>{r.method}</span>{r.path}
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#fcd34d", fontWeight: 600 }}>
                              {r.count.toLocaleString("en-GB")}
                              <div style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 400 }}>{sharePct.toFixed(1)}%</div>
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: avgClass, fontFamily: "monospace" }}>
                              {(r.avgDurationMs / 1000).toFixed(2)}s
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#94a3b8", fontFamily: "monospace" }}>
                              {(r.p95DurationMs / 1000).toFixed(2)}s
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#94a3b8", fontFamily: "monospace" }}>
                              {(r.maxDurationMs / 1000).toFixed(2)}s
                            </td>
                            <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: r.topStatus >= 500 ? "#ef4444" : r.topStatus >= 400 ? "#f59e0b" : "#94a3b8", fontFamily: "monospace" }}>
                              {r.topStatus || "?"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* Drill: background fetch denial */}
          {bgFetch && (
            <section style={{ marginTop: "2.5rem" }}>
              <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 700, color: "#f9fafb", margin: 0 }}>
                  iOS Background App Refresh status
                </h2>
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>
                  Snapshot. Active = heartbeat or driving in last {bgFetch.activeWindowDays} days
                </span>
              </header>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
                {(
                  [
                    ["available", "#10b981", "Available"],
                    ["denied", "#ef4444", "Denied"],
                    ["restricted", "#f59e0b", "Restricted"],
                    ["unknown", "#64748b", "Unknown"],
                    ["not_reported", "#475569", "Not reported"],
                  ] as const
                ).map(([key, color, label]) => {
                  const activeCount = bgFetch.active[key] ?? 0;
                  const allCount = bgFetch.all[key] ?? 0;
                  return (
                    <div
                      key={key}
                      style={{
                        background: "rgba(15,23,42,0.6)",
                        border: `1px solid ${color}33`,
                        borderRadius: 10,
                        padding: "0.75rem 0.875rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: "0.75rem", marginBottom: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
                        {label}
                      </div>
                      <div style={{ color: "#f9fafb", fontSize: "1.25rem", fontWeight: 700, fontFamily: "monospace" }}>
                        {activeCount.toLocaleString("en-GB")}
                      </div>
                      <div style={{ color: "#64748b", fontSize: "0.7rem", marginTop: 2 }}>
                        active · {allCount.toLocaleString("en-GB")} total
                      </div>
                    </div>
                  );
                })}
              </div>

              {(bgFetch.active.denied ?? 0) + (bgFetch.active.restricted ?? 0) > 0 && (
                <p style={{ color: "#f59e0b", fontSize: "0.8125rem", marginTop: "0.75rem", lineHeight: 1.5 }}>
                  {(bgFetch.active.denied ?? 0) + (bgFetch.active.restricted ?? 0)} active user{(bgFetch.active.denied ?? 0) + (bgFetch.active.restricted ?? 0) === 1 ? " has" : "s have"} iOS Background App Refresh disabled. Trip recording will be unreliable for these users until they re-enable it in Settings → General → Background App Refresh.
                </p>
              )}
            </section>
          )}

          <p style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "2rem" }}>
            Generated {new Date(data.generatedAt).toLocaleString("en-GB")}. Hours are UTC,
            not BST/GMT — convert mentally for UK rush-hour analysis.
          </p>
        </>
      )}
    </div>
  );
}
