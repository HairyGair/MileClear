"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../../lib/api";

// Activation health. The question this page answers is the one the topline
// hides: who is running MileClear and getting nothing from it, and why.
// Reads /admin/activation-health. Permission is the heartbeat's value
// unless the diagnostic dump is newer, in which case the dump wins.

interface Row {
  userId: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastHeartbeatAt: string | null;
  heartbeatPermission: string | null;
  effectivePermission: string;
  permissionSource: "heartbeat" | "dump";
  lastTripAt: string | null;
  trips14d: number;
  autoTrips14d: number;
  tripsLifetime: number;
  hasPushToken: boolean;
  build: string | null;
  lastNudgedAt: string | null;
}

interface GaveUpRow {
  userId: string;
  email: string;
  displayName: string | null;
  gaveUpAt: string;
  lastHeartbeatAt: string | null;
  hasPushToken: boolean;
  build: string | null;
}

interface Data {
  windowDays: number;
  fleet: number;
  permission: Record<string, number>;
  cannotCapture: number;
  cannotCapturePct: number;
  capturingAnyway: number;
  capturingAnywayRows: Row[];
  dumpOverrides: number;
  silent: { total: number; never: number; lapsed: number; neverRows: Row[]; lapsedRows: Row[] };
  needsPermission: Row[];
  dailyPermissionMissing: Array<{ date: string; users: number }>;
  gaveUp24h: { total: number; recovered: number; asleep: number; aliveAndSilentCount: number; aliveAndSilent: GaveUpRow[] };
  ota: Array<{
    runtime: string;
    devices: number;
    embedded: number;
    updates: Array<{ updateId: string; devices: number; publishedAt: string | null }>;
  }>;
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

const card: React.CSSProperties = {
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 12,
  padding: "1.25rem",
  marginBottom: "1.25rem",
};
const h2: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.125rem",
  fontWeight: 700,
  color: "#f9fafb",
  margin: "0 0 0.35rem",
};
const sub: React.CSSProperties = { color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.6, margin: "0 0 1rem" };
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.6rem",
  color: "#94a3b8",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "0.5rem 0.6rem",
  fontSize: "0.8125rem",
  color: "#e2e8f0",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  verticalAlign: "top",
};
const stat = (label: string, value: string | number, tone?: string, note?: string) => (
  <div style={{ minWidth: 150 }}>
    <div style={{ color: "#94a3b8", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: tone ?? "#f9fafb" }}>{value}</div>
    {note && <div style={{ color: "#64748b", fontSize: "0.75rem" }}>{note}</div>}
  </div>
);

function PermissionPill({ row }: { row: Row }) {
  const p = row.effectivePermission;
  const color = p === "granted" ? "#10b981" : p === "denied" ? "#ef4444" : "#f59e0b";
  return (
    <span
      title={row.permissionSource === "dump" ? `From a diagnostic dump newer than the heartbeat (heartbeat said ${row.heartbeatPermission ?? "unknown"})` : "From the latest heartbeat"}
      style={{ color, fontWeight: 600 }}
    >
      {p}
      {row.permissionSource === "dump" && <span style={{ color: "#64748b", fontWeight: 400 }}> (dump)</span>}
    </span>
  );
}

function UserTable({ rows, showTrips }: { rows: Row[]; showTrips: boolean }) {
  if (rows.length === 0) return <p style={{ color: "#64748b", fontSize: "0.875rem", margin: 0 }}>Nobody in this group right now.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>User</th>
            <th style={th}>Signed up</th>
            <th style={th}>Heartbeat</th>
            <th style={th}>Background location</th>
            {showTrips && <th style={th}>Trips (lifetime)</th>}
            {showTrips && <th style={th} title="Auto-captured, non-phantom trips started in the window">Auto trips (14d)</th>}
            <th style={th}>Last trip</th>
            <th style={th}>Build</th>
            <th style={th}>Reachable</th>
            <th style={th}>Last nudged</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td style={td}>
                <Link href={`/dashboard/admin?user=${r.userId}`} style={{ color: "#fbbf24", textDecoration: "none" }}>
                  {r.displayName || r.email}
                </Link>
                <div style={{ color: "#64748b", fontSize: "0.75rem" }}>{r.email}</div>
              </td>
              <td style={td}>{ago(r.createdAt)}</td>
              <td style={td}>{ago(r.lastHeartbeatAt)}</td>
              <td style={td}><PermissionPill row={r} /></td>
              {showTrips && <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.tripsLifetime}</td>}
              {showTrips && <td style={{ ...td, fontVariantNumeric: "tabular-nums", color: r.autoTrips14d > 0 ? "#10b981" : "#64748b" }}>{r.autoTrips14d}</td>}
              <td style={td}>{ago(r.lastTripAt)}</td>
              <td style={td}>{r.build ?? "-"}</td>
              <td style={td}>
                {r.hasPushToken ? <span style={{ color: "#10b981" }}>push</span> : <span style={{ color: "#ef4444" }} title="No push token - email is the only channel">no push</span>}
              </td>
              <td style={td}>{r.lastNudgedAt ? ago(r.lastNudgedAt) : <span style={{ color: "#64748b" }}>never</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ActivationPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: Data }>("/admin/activation-health")
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const maxDaily = data ? Math.max(1, ...data.dailyPermissionMissing.map((d) => d.users)) : 1;

  return (
    <div style={{ padding: "1.5rem 0", maxWidth: 1300 }}>
      <div style={{ marginBottom: "1rem" }}>
        <Link href="/dashboard/admin" style={{ color: "#94a3b8", fontSize: "0.875rem", textDecoration: "none" }}>← Admin</Link>
      </div>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 700, color: "#f9fafb", marginBottom: "0.5rem" }}>
        Activation health
      </h1>
      <p style={{ color: "#94a3b8", marginBottom: "1.5rem", lineHeight: 1.6, maxWidth: 820 }}>
        Who is running MileClear and getting nothing from it. The active fleet is every account with a heartbeat in the
        last {data?.windowDays ?? 14} days. Background location comes from the heartbeat unless the diagnostic dump is
        newer, in which case the dump wins: the two go stale at different moments. Fleet trip volume can rise while
        every number on this page gets worse, which is why it exists.
      </p>

      {loading && <p style={{ color: "#94a3b8" }}>Loading…</p>}
      {error && <p style={{ color: "#ef4444" }}>Error: {error}</p>}

      {data && (
        <>
          <section style={card}>
            <h2 style={h2}>Can they capture at all?</h2>
            <p style={sub}>
              Background location across the active fleet, judged by outcome. &quot;Cannot capture&quot; is not granted AND no
              auto-captured trip in the window. On iPhone the reading says &quot;undetermined&quot; for While Using as well as
              never-asked, and While Using drivers who open the app before setting off capture fine, so a not-granted
              reading with captures behind it is listed separately rather than counted.
            </p>
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {stat("Active fleet", data.fleet)}
              {stat("Cannot capture", `${data.cannotCapture} (${data.cannotCapturePct}%)`, data.cannotCapturePct >= 20 ? "#ef4444" : "#f59e0b", "not granted, no auto trip in the window")}
              {stat("Capturing anyway", data.capturingAnyway, "#10b981", "not granted, but auto trips in the window")}
              {stat("Granted", data.permission.granted, "#10b981")}
              {stat("Undetermined", data.permission.undetermined, "#f59e0b", "never asked, dismissed, or While Using")}
              {stat("Denied", data.permission.denied, "#ef4444")}
              {stat("Dump overrode heartbeat", data.dumpOverrides, undefined, "newer dump disagreed")}
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginBottom: 6 }}>Users firing alert.permission_missing, per day</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 56 }}>
                {data.dailyPermissionMissing.map((d) => (
                  <div key={d.date} title={`${d.date}: ${d.users} users`} style={{ flex: 1, background: "rgba(245,158,11,0.55)", height: `${Math.max(2, (d.users / maxDaily) * 100)}%`, borderRadius: 2 }} />
                ))}
              </div>
            </div>
          </section>

          <section style={card}>
            <h2 style={h2}>Running the app, recording nothing ({data.silent.total})</h2>
            <p style={sub}>
              Heartbeat in the window, zero trips of any kind in it. <strong style={{ color: "#e2e8f0" }}>{data.silent.lapsed} used to record and stopped</strong>;{" "}
              <strong style={{ color: "#e2e8f0" }}>{data.silent.never} never have</strong>. Lapsed users are listed by how much they used to record.
            </p>
            <h3 style={{ color: "#e2e8f0", fontSize: "0.9375rem", margin: "0 0 0.5rem" }}>Lapsed</h3>
            <UserTable rows={data.silent.lapsedRows} showTrips />
            <h3 style={{ color: "#e2e8f0", fontSize: "0.9375rem", margin: "1.25rem 0 0.5rem" }}>Never recorded</h3>
            <UserTable rows={data.silent.neverRows} showTrips={false} />
          </section>

          <section style={card}>
            <h2 style={h2}>Needs the permission fixed ({data.needsPermission.length})</h2>
            <p style={sub}>
              Active fleet with background location not granted and no auto-captured trip in the window, most-valuable
              first. &quot;Last nudged&quot; is the most recent capture_lapsed or activation_d7 push in 60 days; never means no
              automated nudge has reached them.
            </p>
            <UserTable rows={data.needsPermission} showTrips />
          </section>

          <section style={card}>
            <h2 style={h2}>Reads not granted, capturing anyway ({data.capturingAnyway})</h2>
            <p style={sub}>
              The reading and the outcome disagree, and the outcome wins: these phones captured auto trips in the window.
              Do not nudge them to flip a switch. The capture_lapsed job skips anyone who has captured under their current
              reading before.
            </p>
            <UserTable rows={data.capturingAnywayRows} showTrips />
          </section>

          <section style={card}>
            <h2 style={h2}>Watchdog gave up in the last 24h ({data.gaveUp24h.total})</h2>
            <p style={sub}>
              The raw count is mostly sleeping phones. <strong style={{ color: "#e2e8f0" }}>Alive and silent</strong> is the group that
              matters: the phone has reported since the give-up and no trip has been saved.
            </p>
            <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", marginBottom: "1rem" }}>
              {stat("Recovered", data.gaveUp24h.recovered, "#10b981", "a trip landed afterwards")}
              {stat("Asleep", data.gaveUp24h.asleep, "#94a3b8", "no heartbeat since")}
              {stat("Alive and silent", data.gaveUp24h.aliveAndSilent.length, data.gaveUp24h.aliveAndSilent.length > 0 ? "#ef4444" : "#10b981")}
            </div>
            {data.gaveUp24h.aliveAndSilent.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr><th style={th}>User</th><th style={th}>Gave up</th><th style={th}>Heartbeat</th><th style={th}>Build</th><th style={th}>Reachable</th></tr>
                  </thead>
                  <tbody>
                    {data.gaveUp24h.aliveAndSilent.map((r) => (
                      <tr key={r.userId}>
                        <td style={td}>
                          <Link href={`/dashboard/admin?user=${r.userId}`} style={{ color: "#fbbf24", textDecoration: "none" }}>{r.displayName || r.email}</Link>
                          <div style={{ color: "#64748b", fontSize: "0.75rem" }}>{r.email}</div>
                        </td>
                        <td style={td}>{ago(r.gaveUpAt)}</td>
                        <td style={td}>{ago(r.lastHeartbeatAt)}</td>
                        <td style={td}>{r.build ?? "-"}</td>
                        <td style={td}>{r.hasPushToken ? <span style={{ color: "#10b981" }}>push</span> : <span style={{ color: "#ef4444" }}>no push</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section style={card}>
            <h2 style={h2}>What each binary is actually running</h2>
            <p style={sub}>From diagnostic dumps in the window. Embedded = the bundle the App Store shipped; an update id is an OTA group.</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th style={th}>Runtime</th><th style={th}>Devices</th><th style={th}>Embedded</th><th style={th}>On an OTA</th><th style={th}>Updates</th></tr>
                </thead>
                <tbody>
                  {data.ota.map((r) => (
                    <tr key={r.runtime}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.runtime}</td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.devices}</td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.embedded}</td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                        {r.devices - r.embedded}
                        {r.devices > 0 && <span style={{ color: "#64748b" }}> ({Math.round(((r.devices - r.embedded) / r.devices) * 100)}%)</span>}
                      </td>
                      <td style={td}>
                        {r.updates.length === 0
                          ? <span style={{ color: "#64748b" }}>none</span>
                          : r.updates.map((u) => (
                              <div key={u.updateId} title={u.updateId}>
                                <code style={{ fontSize: "0.75rem" }}>{u.updateId.slice(0, 8)}</code> · {u.devices} device{u.devices === 1 ? "" : "s"}
                                {u.publishedAt && <span style={{ color: "#64748b" }}> · published {ago(u.publishedAt)}</span>}
                              </div>
                            ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p style={{ color: "#64748b", fontSize: "0.75rem" }}>Generated {new Date(data.generatedAt).toLocaleString("en-GB")}</p>
        </>
      )}
    </div>
  );
}
