"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

// Triage inbox for "Missing a trip?" reports (the Trips-screen affordance,
// live since 9 Jun 2026). Each report arrives pre-diagnosed using the
// support-playbook rules, so most answer themselves before being opened:
//   permission_gap      → user lacks Always-location / Motion; engine can't
//                         run backgrounded. Fix = the permission nudge.
//   silent_non_capture  → native engine never opens recordings on this
//                         device (the Norman Boomer class). Fix = engine
//                         switch on the user detail panel.
//   needs_look          → neither rule matched; read the dump.

interface Report {
  id: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  note: string | null;
  reportedAt: string;
  dumpVerdict: string | null;
  dumpAt: string | null;
  backgroundPermission: string | null;
  motionPermission: string | null;
  nativeEngine: boolean;
  recentAutoTrips: number;
  diagnosis: "permission_gap" | "silent_non_capture" | "needs_look";
}

const DIAGNOSIS_META: Record<Report["diagnosis"], { label: string; color: string; hint: string }> = {
  permission_gap: {
    label: "Permission gap",
    color: "#f59e0b",
    hint: "Background location / Motion not granted - the engine can't run with the app closed. Advise Always-location + Motion & Fitness, and manual entry for the missed trip.",
  },
  silent_non_capture: {
    label: "Silent non-capture",
    color: "#ef4444",
    hint: "Native engine on, permissions fine, but no recording ever opens (RNBG never reports motion). Switch the device to the JS engine from the user detail panel.",
  },
  needs_look: {
    label: "Needs a look",
    color: "#94a3b8",
    hint: "Neither playbook rule matched - open the user's diagnostics and read the event timeline.",
  },
};

function ago(iso: string | null): string {
  if (!iso) return "-";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function MissingTripReportsPage() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: { reports: Report[] } }>("/admin/missing-trip-reports")
      .then((res) => {
        if (!cancelled) setReports(res.data.reports);
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
    <div style={{ padding: "1.5rem 0", maxWidth: 1100 }}>
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
        Missing-Trip Reports
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "2rem", lineHeight: 1.6, maxWidth: 800 }}>
        &quot;Missing a trip?&quot; taps from the Trips screen, last 30 days, newest first. Each
        report is auto-diagnosed from the user&apos;s latest diagnostic dump and recent capture
        stats - hover a diagnosis chip for the recommended fix.
      </p>

      {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
      {error && <p style={{ color: "#ef4444" }}>Error: {error}</p>}

      {reports && reports.length === 0 && (
        <p style={{ color: "#10b981" }}>No reports in the last 30 days. Quiet inbox = healthy fleet.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {reports?.map((r) => {
          const meta = DIAGNOSIS_META[r.diagnosis];
          return (
            <div
              key={r.id}
              style={{
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 12,
                background: "rgba(15,23,42,0.6)",
                padding: "0.875rem 1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
                <strong style={{ color: "#e2e8f0" }}>{r.displayName || r.email || r.userId}</strong>
                <span
                  title={meta.hint}
                  style={{
                    color: meta.color,
                    border: `1px solid ${meta.color}`,
                    borderRadius: 999,
                    padding: "0.0625rem 0.5rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "help",
                  }}
                >
                  {meta.label}
                </span>
                <span style={{ color: "#64748b", fontSize: "0.8125rem" }}>{ago(r.reportedAt)}</span>
              </div>

              {r.note && (
                <p style={{ color: "#cbd5e1", margin: "0.5rem 0 0", fontStyle: "italic" }}>
                  &ldquo;{r.note}&rdquo;
                </p>
              )}

              <p style={{ color: "#94a3b8", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>
                Dump: {r.dumpVerdict ?? "none"} ({ago(r.dumpAt)}) · bg-location:{" "}
                {r.backgroundPermission ?? "?"} · motion: {r.motionPermission ?? "?"} · engine:{" "}
                {r.nativeEngine ? "ClearTrack" : "JS"} · auto trips last 4d: {r.recentAutoTrips}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
