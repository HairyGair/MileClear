"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

// ClearTrack rollout capture-health. The web twin of the #founder
// silent-non-capture monitor: every native-engine device with its capture
// counts (recent vs baseline), latest-dump trigger signature, and a red
// "silent" flag for previously-active drivers whose engine has stopped
// capturing while self-reporting healthy (the Norman Boomer class,
// 10 Jun 2026: RNBG never reports motion, no recording ever opens).

interface DeviceRow {
  userId: string;
  email: string;
  displayName: string | null;
  verdict: string;
  dumpAt: string;
  runtime: string | null;
  backgroundPermission: string;
  motionPermission: string;
  recentAutoTrips: number;
  baselineAutoTrips: number;
  lastAutoTripAt: string | null;
  motionChanges24h: number;
  recordingStarts24h: number;
  speedStarts24h: number;
  silent: boolean;
}

interface HealthData {
  recentWindowDays: number;
  baselineMinTrips: number;
  nativeDevices: number;
  silentCount: number;
  devices: DeviceRow[];
  generatedAt: string;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function verdictColor(v: string): string {
  if (v === "error") return "#ef4444";
  if (v === "warning") return "#f59e0b";
  return "#94a3b8";
}

export default function ClearTrackHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: HealthData }>("/admin/cleartrack-health")
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
    <div style={{ padding: "1.5rem 0", maxWidth: 1300 }}>
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
        ClearTrack Capture Health
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem", lineHeight: 1.6, maxWidth: 820 }}>
        Every device running the native engine (latest dump within 7 days), with auto-capture
        counts and the trigger signature from its last 24h of detection events. A{" "}
        <strong style={{ color: "#ef4444" }}>SILENT</strong> row is a previously-active driver
        ({data?.baselineMinTrips ?? 4}+ auto trips in the prior 14 days), permissions granted,
        app alive - and zero auto-captures in {data?.recentWindowDays ?? 4} days. Their own
        verdict can still say &quot;healthy&quot;: the giveaway is motion changes that never
        become recording starts (RNBG never hears motion). Fix lever: User detail → Switch
        engine.
      </p>

      {data && (
        <p style={{ color: data.silentCount > 0 ? "#ef4444" : "#10b981", marginBottom: "1rem", fontWeight: 600 }}>
          {data.nativeDevices} native device(s) · {data.silentCount} silent non-capture
        </p>
      )}

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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                <Th>User</Th>
                <Th>Status</Th>
                <Th>Auto trips (recent / prior 14d)</Th>
                <Th>Last auto trip</Th>
                <Th>Motion → Rec → Speed (24h)</Th>
                <Th>Permissions</Th>
                <Th>Runtime</Th>
                <Th>Dump</Th>
              </tr>
            </thead>
            <tbody>
              {data.devices.map((d) => (
                <tr
                  key={d.userId}
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    background: d.silent ? "rgba(239,68,68,0.07)" : undefined,
                  }}
                >
                  <Td>
                    <span style={{ color: "#e2e8f0" }}>{d.displayName || d.email}</span>
                    {d.displayName && (
                      <span style={{ color: "#64748b", display: "block", fontSize: "0.75rem" }}>{d.email}</span>
                    )}
                  </Td>
                  <Td>
                    {d.silent ? (
                      <span style={{ color: "#ef4444", fontWeight: 700 }}>SILENT</span>
                    ) : (
                      <span style={{ color: verdictColor(d.verdict) }}>{d.verdict}</span>
                    )}
                  </Td>
                  <Td>
                    <span style={{ color: d.recentAutoTrips === 0 && d.baselineAutoTrips > 0 ? "#ef4444" : "#cbd5e1" }}>
                      {d.recentAutoTrips} / {d.baselineAutoTrips}
                    </span>
                  </Td>
                  <Td>{ago(d.lastAutoTripAt)}</Td>
                  <Td>
                    <span
                      title="native_motionchange → native_recording_started → native_force_start_from_speed in the dump's last 24h. Motion without recordings = the engine wakes but never opens a trip."
                      style={{
                        color:
                          d.motionChanges24h > 0 && d.recordingStarts24h === 0 && d.speedStarts24h === 0
                            ? "#f59e0b"
                            : "#cbd5e1",
                      }}
                    >
                      {d.motionChanges24h} → {d.recordingStarts24h} → {d.speedStarts24h}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: d.backgroundPermission === "granted" ? "#cbd5e1" : "#ef4444" }}>
                      bg: {d.backgroundPermission}
                    </span>
                    <span style={{ color: d.motionPermission === "granted" ? "#64748b" : "#ef4444", display: "block", fontSize: "0.75rem" }}>
                      motion: {d.motionPermission}
                    </span>
                  </Td>
                  <Td>{d.runtime ?? "-"}</Td>
                  <Td>{ago(d.dumpAt)}</Td>
                </tr>
              ))}
              {data.devices.length === 0 && (
                <tr>
                  <Td>No native-engine devices have dumped in the last 7 days.</Td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
