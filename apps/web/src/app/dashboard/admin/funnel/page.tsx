"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

// Per-cohort activation funnel. Audit follow-up #3 of 5 (aggregate
// health-dashboard upgrades). Surfaces WHICH month started under-
// performing rather than just whether the global funnel is healthy.

interface CohortRow {
  cohort: string;                // "YYYY-MM"
  registered: number;
  firstTrip: number;
  firstClassification: number;
  firstExport: number;
  upgradedToPro: number;
  rateFirstTrip: number;         // % of registered
  rateClassification: number;    // % of first-trip
  rateExport: number;            // % of first-classification
  rateProConversion: number;     // % of registered (any time)
}

interface FunnelData {
  activationWindowDays: number;
  cohorts: CohortRow[];
  generatedAt: string;
}

// Compare a cohort's rate to the median of all other cohorts.
// Significantly worse = red, mildly worse = amber, otherwise muted.
function cohortTone(value: number, peers: number[]): "ok" | "warn" | "regress" {
  if (peers.length === 0) return "ok";
  const sorted = [...peers].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  if (median === 0) return "ok";
  const ratio = value / median;
  if (ratio < 0.7) return "regress";
  if (ratio < 0.85) return "warn";
  return "ok";
}

function toneColor(t: "ok" | "warn" | "regress"): string {
  if (t === "regress") return "#ef4444";
  if (t === "warn") return "#f59e0b";
  return "#cbd5e1";
}

function formatCohortMonth(key: string): string {
  const [y, m] = key.split("-").map((s) => parseInt(s, 10));
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function FunnelCohortsPage() {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<{ data: FunnelData }>("/admin/funnel/cohorts")
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

  // Pre-compute peers so each row's tone-comparison doesn't recompute the median.
  const cohorts = data?.cohorts ?? [];
  const peerRates = {
    firstTrip: cohorts.map((c) => c.rateFirstTrip),
    classification: cohorts.map((c) => c.rateClassification),
    export: cohorts.map((c) => c.rateExport),
    pro: cohorts.map((c) => c.rateProConversion),
  };

  return (
    <div style={{ padding: "1.5rem 0", maxWidth: 1200 }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/admin" style={{ color: "#94a3b8", fontSize: "0.875rem", textDecoration: "none" }}>
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
        Funnel by Cohort
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem", lineHeight: 1.6 }}>
        Activation funnel split by registration month. Each step is measured within{" "}
        {data?.activationWindowDays ?? 30} days of registration (except Pro conversion,
        which is any time). A cohort&apos;s rate is highlighted red when it&apos;s
        below 70% of the median rate across visible cohorts - the &quot;something
        broke for new users this month&quot; signal.
      </p>

      {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
      {error && <p style={{ color: "#ef4444" }}>Error: {error}</p>}

      {data && (
        <div
          style={{
            overflowX: "auto",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 12,
            background: "rgba(15,23,42,0.6)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <Th>Cohort</Th>
                <Th>Registered</Th>
                <Th>→ First trip</Th>
                <Th>→ Classified</Th>
                <Th>→ Exported</Th>
                <Th>→ Pro</Th>
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c, i) => {
                const isLatest = i === data.cohorts.length - 1;
                return (
                  <tr
                    key={c.cohort}
                    style={{
                      borderTop: "1px solid rgba(255,255,255,0.05)",
                      background: isLatest ? "rgba(245,166,35,0.04)" : "transparent",
                    }}
                  >
                    <Td>
                      <strong style={{ color: "#f9fafb" }}>{formatCohortMonth(c.cohort)}</strong>
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
                          CURRENT
                        </span>
                      )}
                    </Td>
                    <Td>{c.registered.toLocaleString("en-GB")}</Td>
                    <Rate
                      count={c.firstTrip}
                      rate={c.rateFirstTrip}
                      tone={cohortTone(c.rateFirstTrip, peerRates.firstTrip)}
                    />
                    <Rate
                      count={c.firstClassification}
                      rate={c.rateClassification}
                      tone={cohortTone(c.rateClassification, peerRates.classification)}
                    />
                    <Rate
                      count={c.firstExport}
                      rate={c.rateExport}
                      tone={cohortTone(c.rateExport, peerRates.export)}
                    />
                    <Rate
                      count={c.upgradedToPro}
                      rate={c.rateProConversion}
                      tone={cohortTone(c.rateProConversion, peerRates.pro)}
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "1rem" }}>
          Generated {new Date(data.generatedAt).toLocaleString("en-GB")}.
          Rates: First trip is % of registered; Classified is % of those who logged a trip;
          Exported is % of those who classified; Pro is % of registered (no time limit).
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
    <td style={{ padding: "0.625rem 0.75rem", color: "#cbd5e1", verticalAlign: "top" }}>
      {children}
    </td>
  );
}

function Rate({
  count,
  rate,
  tone,
}: {
  count: number;
  rate: number;
  tone: "ok" | "warn" | "regress";
}) {
  return (
    <td
      style={{
        padding: "0.625rem 0.75rem",
        verticalAlign: "top",
      }}
    >
      <div style={{ color: "#f9fafb", fontWeight: 600 }}>
        {count.toLocaleString("en-GB")}
      </div>
      <div
        style={{
          color: toneColor(tone),
          fontSize: "0.75rem",
          fontWeight: tone === "regress" ? 700 : 400,
        }}
      >
        {rate}%
      </div>
    </td>
  );
}
