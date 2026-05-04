"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

// Time-of-day issue patterns. Audit follow-up #5 of 5 (aggregate
// health-dashboard upgrades). Bar chart of diagnostic events bucketed
// by hour-of-day (UTC). Surfaces patterns: rush-hour reliability dips,
// timezone-related bug clusters, etc.

interface Data {
  windowDays: number;
  series: Record<string, number[]>;       // type → 24-element array
  totalsByHour: number[];                  // 24 elements
  totalsByType: Record<string, number>;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ data: Data }>("/admin/issues-by-hour")
      .then((res) => {
        if (!cancelled) setData(res.data);
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

          <p style={{ color: "#64748b", fontSize: "0.75rem" }}>
            Generated {new Date(data.generatedAt).toLocaleString("en-GB")}. Hours are UTC,
            not BST/GMT — convert mentally for UK rush-hour analysis.
          </p>
        </>
      )}
    </div>
  );
}
