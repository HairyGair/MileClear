"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

// Per-build regression detection. Audit follow-up #1 from the aggregate
// health-dashboard upgrades. Reads /admin/build-health and renders a
// table of the most-recent active builds with per-active-user incident
// rates, highlighting where the current build is significantly worse
// than the previous build.

interface BuildRow {
  appVersion: string;
  buildNumber: string;
  activeUsers: number;
  watchdogPingsPerUser: number;
  reconciliationDriftPerUser: number;
  slowRequestsPerUser: number;
  loginFailuresPerUser: number;
  watchdogPings: number;
  reconciliationDrift: number;
  slowRequests: number;
  loginFailures: number;
  passwordChangeFailures: number;
  tripCreated: number;
  tripDeleted: number;
  tripDeletionRatePct: number;
  idempotencyReplays: number;
}

interface BuildHealthData {
  windowDays: number;
  builds: BuildRow[];
  generatedAt: string;
}

// Significant-regression threshold. If the current build's per-user
// rate is more than this multiple of the previous build's rate AND
// the absolute count is non-trivial, highlight in red.
const REGRESSION_MULTIPLIER = 1.5;
const MIN_INCIDENT_FLOOR = 2; // ignore tiny absolute numbers

function regressionTone(
  current: number,
  previous: number | null,
  absolute: number
): "ok" | "warn" | "regress" {
  if (absolute < MIN_INCIDENT_FLOOR) return "ok";
  if (previous === null || previous === 0) {
    // Going from 0 to >floor IS a regression
    return absolute >= MIN_INCIDENT_FLOOR ? "regress" : "ok";
  }
  const ratio = current / previous;
  if (ratio >= REGRESSION_MULTIPLIER) return "regress";
  if (ratio >= 1.2) return "warn";
  return "ok";
}

function toneColor(t: "ok" | "warn" | "regress"): string {
  if (t === "regress") return "#ef4444";
  if (t === "warn") return "#f59e0b";
  return "#10b981";
}

function fmtRate(n: number): string {
  if (n === 0) return "0";
  if (n < 0.01) return n.toFixed(3);
  if (n < 0.1) return n.toFixed(2);
  return n.toFixed(2);
}

export default function BuildHealthPage() {
  const [data, setData] = useState<BuildHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ data: BuildHealthData }>("/admin/build-health")
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

  return (
    <div style={{ padding: "1.5rem 0", maxWidth: 1200 }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link
          href="/dashboard/admin"
          style={{
            color: "#94a3b8",
            fontSize: "0.875rem",
            textDecoration: "none",
          }}
        >
          ← Admin
        </Link>
      </div>

      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.75rem",
          fontWeight: 700,
          color: "#f9fafb",
          marginBottom: "0.5rem",
        }}
      >
        Build Health
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem", lineHeight: 1.6 }}>
        Per-build regression detection. Active builds in the last{" "}
        {data?.windowDays ?? 7} days, with incident rates per active user.
        A build is highlighted red when its rate is ≥ {REGRESSION_MULTIPLIER}× the
        previous build&apos;s - that&apos;s the &quot;we shipped a bug&quot;
        signal.
      </p>

      {loading && (
        <p style={{ color: "#94a3b8" }}>Loading…</p>
      )}

      {error && (
        <p style={{ color: "#ef4444" }}>Error: {error}</p>
      )}

      {data && data.builds.length === 0 && (
        <p style={{ color: "#94a3b8" }}>
          No builds with active heartbeats in the last {data.windowDays} days.
        </p>
      )}

      {data && data.builds.length > 0 && (
        <div
          style={{
            overflowX: "auto",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            background: "rgba(15,23,42,0.6)",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <Th>Build</Th>
                <Th>Active users</Th>
                <Th>Watchdog<br/>pings/user</Th>
                <Th>Reconciliation<br/>drift/user</Th>
                <Th>Slow reqs<br/>/user</Th>
                <Th>Login fails<br/>/user</Th>
                <Th>Trips<br/>created</Th>
                <Th>Trips<br/>deleted</Th>
                <Th>Trip-delete %</Th>
                <Th>Idempotency<br/>replays</Th>
              </tr>
            </thead>
            <tbody>
              {data.builds.map((build, i) => {
                // Previous build = next item in the array (since sorted desc).
                // For the oldest build in the window, no comparison.
                const prev = data.builds[i + 1] ?? null;
                const isLatest = i === 0;

                return (
                  <tr
                    key={`${build.appVersion}-${build.buildNumber}`}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      background: isLatest ? "rgba(245,166,35,0.04)" : "transparent",
                    }}
                  >
                    <Td>
                      <div style={{ fontWeight: 600, color: "#f9fafb" }}>
                        {build.appVersion}
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "0.75rem" }}>
                        build {build.buildNumber}
                        {isLatest && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: "0.7rem",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: "rgba(245,166,35,0.15)",
                              color: "#fbbf24",
                            }}
                          >
                            LATEST
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>{build.activeUsers}</Td>
                    <Rate
                      value={build.watchdogPingsPerUser}
                      absolute={build.watchdogPings}
                      previous={prev?.watchdogPingsPerUser ?? null}
                    />
                    <Rate
                      value={build.reconciliationDriftPerUser}
                      absolute={build.reconciliationDrift}
                      previous={prev?.reconciliationDriftPerUser ?? null}
                    />
                    <Rate
                      value={build.slowRequestsPerUser}
                      absolute={build.slowRequests}
                      previous={prev?.slowRequestsPerUser ?? null}
                    />
                    <Rate
                      value={build.loginFailuresPerUser}
                      absolute={build.loginFailures}
                      previous={prev?.loginFailuresPerUser ?? null}
                    />
                    <Td>{build.tripCreated.toLocaleString("en-GB")}</Td>
                    <Td>{build.tripDeleted.toLocaleString("en-GB")}</Td>
                    <Td>
                      <span
                        style={{
                          color: toneColor(
                            regressionTone(
                              build.tripDeletionRatePct,
                              prev?.tripDeletionRatePct ?? null,
                              build.tripDeleted
                            )
                          ),
                        }}
                      >
                        {build.tripDeletionRatePct}%
                      </span>
                    </Td>
                    <Td>{build.idempotencyReplays.toLocaleString("en-GB")}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p
          style={{
            color: "#64748b",
            fontSize: "0.75rem",
            marginTop: "1rem",
          }}
        >
          Generated {new Date(data.generatedAt).toLocaleString("en-GB")}.
          Active build = at least one heartbeat in window.
        </p>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "0.625rem 0.75rem",
        color: "#94a3b8",
        fontWeight: 600,
        fontSize: "0.75rem",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: "0.625rem 0.75rem",
        color: "#cbd5e1",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

function Rate({
  value,
  absolute,
  previous,
}: {
  value: number;
  absolute: number;
  previous: number | null;
}) {
  const tone = regressionTone(value, previous, absolute);
  return (
    <td
      style={{
        padding: "0.625rem 0.75rem",
        color: toneColor(tone),
        fontWeight: tone === "regress" ? 700 : 400,
        verticalAlign: "top",
      }}
      title={`Absolute: ${absolute} · Previous build per-user: ${previous ?? "n/a"}`}
    >
      {fmtRate(value)}
    </td>
  );
}
