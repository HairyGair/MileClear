"use client";

// Ops section of the admin area (Sep 2026 redesign).

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { AdminPage } from "@/components/admin";

import { formatUptime, HealthData, StatusDot, timeAgo } from "@/components/admin/legacy";

// Health Tab
// ---------------------------------------------------------------------------

interface RoutingHealthData {
  config: { graphhopperUrl: string; googleConfigured: boolean };
  graphhopper: { reachable: boolean | null; latencyMs: number | null; error: string | null };
  cache: { rowCount: number; bySource: Record<string, number>; totalHits: number };
  last24h: {
    routesComputed: number;
    routesUnavailable: number;
    bySource: Record<string, number>;
    fallbackRate: number;
  };
  generatedAt: string;
}

function HealthTab() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [routingHealth, setRoutingHealth] = useState<RoutingHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, routingRes] = await Promise.all([
        api.get<{ data: HealthData }>("/admin/health"),
        api.get<{ data: RoutingHealthData }>("/admin/routing-health").catch(() => null),
      ]);
      setHealth(healthRes.data);
      if (routingRes) setRoutingHealth(routingRes.data);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const recordCountRows = health
    ? ([
        ["Users", health.recordCounts.users],
        ["Trips", health.recordCounts.trips],
        ["Shifts", health.recordCounts.shifts],
        ["Vehicles", health.recordCounts.vehicles],
        ["Fuel Logs", health.recordCounts.fuelLogs],
        ["Earnings", health.recordCounts.earnings],
        ["Achievements", health.recordCounts.achievements],
      ] as [string, number][])
    : [];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: "1rem", gap: "0.75rem" }}>
        {lastRefreshed && (
          <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Last refreshed {lastRefreshed.toLocaleTimeString("en-GB")}
          </span>
        )}
        <Button variant="secondary" size="sm" onClick={loadHealth} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }} role="alert">
          Failed to load health data: {error}
        </div>
      )}

      {loading && !health && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <LoadingSkeleton variant="card" style={{ height: 100 }} />
          <LoadingSkeleton variant="card" style={{ height: 200 }} />
        </div>
      )}

      {health && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Status indicators */}
          <Card title="System Status">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  fontSize: "0.9375rem",
                }}
              >
                <StatusDot status={health.api} />
                <span style={{ fontWeight: 500 }}>API</span>
                <span
                  style={{
                    color:
                      health.api === "ok" ? "var(--emerald-400)" : "var(--dash-red)",
                    fontSize: "0.875rem",
                    marginLeft: "auto",
                  }}
                >
                  {health.api === "ok" ? "Operational" : "Degraded"}
                </span>
              </div>
              <div
                style={{
                  height: 1,
                  background: "var(--border-default)",
                  margin: "0 -1.25rem",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  fontSize: "0.9375rem",
                }}
              >
                <StatusDot status={health.database} />
                <span style={{ fontWeight: 500 }}>Database</span>
                <span
                  style={{
                    color:
                      health.database === "ok" ? "var(--emerald-400)" : "var(--dash-red)",
                    fontSize: "0.875rem",
                    marginLeft: "auto",
                  }}
                >
                  {health.database === "ok" ? "Operational" : "Degraded"}
                </span>
              </div>
            </div>
          </Card>

          {/* System metrics */}
          <div className="stats-grid">
            <div className="stat-card">
              <p className="stat-card__label">DB Latency</p>
              <p className="stat-card__value stat-card__value--emerald">
                {health.databaseLatencyMs}
                <span style={{ fontSize: "0.875rem", fontWeight: 400, marginLeft: 2 }}>ms</span>
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Uptime</p>
              <p className="stat-card__value">{formatUptime(health.uptime)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Memory</p>
              <p className="stat-card__value">
                {health.memoryUsageMb.toFixed(0)}
                <span style={{ fontSize: "0.875rem", fontWeight: 400, marginLeft: 2 }}>MB</span>
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Node.js</p>
              <p className="stat-card__value" style={{ fontSize: "1.125rem" }}>
                {health.nodeVersion}
              </p>
            </div>
          </div>

          {/* Record counts */}
          <Card title="Database Records">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th style={{ textAlign: "right" }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {recordCountRows.map(([label, count]) => (
                    <tr key={label}>
                      <td style={{ fontSize: "0.9375rem" }}>{label}</td>
                      <td
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 500,
                          fontSize: "0.9375rem",
                        }}
                      >
                        {count.toLocaleString("en-GB")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Routing stack health (added 10 May 2026) */}
          {routingHealth && (
            <Card title="Routing Stack Health">
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "0.25rem 0.625rem",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: routingHealth.graphhopper.reachable ? "var(--emerald-400)" : "var(--dash-red)",
                      backgroundColor: routingHealth.graphhopper.reachable
                        ? "rgba(52, 211, 153, 0.10)"
                        : "rgba(239, 68, 68, 0.10)",
                      border: `1px solid ${routingHealth.graphhopper.reachable ? "rgba(52, 211, 153, 0.30)" : "rgba(239, 68, 68, 0.30)"}`,
                    }}
                  >
                    {routingHealth.graphhopper.reachable
                      ? `GraphHopper · ${routingHealth.graphhopper.latencyMs ?? "?"} ms`
                      : routingHealth.config.graphhopperUrl === "missing"
                      ? "GraphHopper not configured"
                      : `GraphHopper down${routingHealth.graphhopper.error ? `: ${routingHealth.graphhopper.error}` : ""}`}
                  </span>
                  <span
                    style={{
                      padding: "0.25rem 0.625rem",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: routingHealth.config.googleConfigured ? "var(--emerald-400)" : "var(--text-secondary)",
                      backgroundColor: routingHealth.config.googleConfigured
                        ? "rgba(52, 211, 153, 0.10)"
                        : "rgba(132, 148, 167, 0.10)",
                      border: `1px solid ${routingHealth.config.googleConfigured ? "rgba(52, 211, 153, 0.30)" : "rgba(132, 148, 167, 0.30)"}`,
                    }}
                  >
                    {routingHealth.config.googleConfigured ? "Google fallback ready" : "Google fallback not configured"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
                  <div className="stat-card">
                    <p className="stat-card__label">Cache rows</p>
                    <p className="stat-card__value" style={{ fontSize: "1.5rem" }}>
                      {routingHealth.cache.rowCount.toLocaleString("en-GB")}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
                      {routingHealth.cache.totalHits.toLocaleString("en-GB")} hits served
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-card__label">Routes 24h</p>
                    <p className="stat-card__value" style={{ fontSize: "1.5rem" }}>
                      {routingHealth.last24h.routesComputed.toLocaleString("en-GB")}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
                      {routingHealth.last24h.routesUnavailable} failed
                    </p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-card__label">Fallback rate</p>
                    <p
                      className="stat-card__value"
                      style={{
                        fontSize: "1.5rem",
                        color:
                          routingHealth.last24h.fallbackRate > 50
                            ? "var(--dash-red)"
                            : routingHealth.last24h.fallbackRate > 10
                            ? "var(--amber-500)"
                            : "var(--emerald-400)",
                      }}
                    >
                      {routingHealth.last24h.fallbackRate}%
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
                      Google was used (vs GraphHopper)
                    </p>
                  </div>
                </div>

                <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", margin: 0 }}>
                  Cache by source:{" "}
                  {Object.entries(routingHealth.cache.bySource)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ") || "-"}
                </p>
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}


interface AppleWebhookLog {
  id: string;
  environment?: string | null;
  notificationType: string | null;
  subtype: string | null;
  originalTransactionId: string | null;
  userId: string | null;
  status: string;
  errorMessage: string | null;
  receivedAt: string;
  isGhost?: boolean;
}

interface JobRunLog {
  id: string;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  errorMessage: string | null;
  metadata: string | null;
}

interface AppleWebhookResponse {
  data: AppleWebhookLog[];
  total: number;
  totalPages: number;
  last24h: Record<string, number>;
  ghostCount?: number;
}

interface JobRunResponse {
  data: JobRunLog[];
  total: number;
  totalPages: number;
  latestPerJob: Array<{
    jobName: string;
    startedAt: string;
    finishedAt: string | null;
    status: string;
  }>;
}

interface OrphanReprocessResult {
  txn: string;
  receivedAt: string;
  outcome: "linked" | "still_no_user" | "no_appAccountToken" | "fetch_failed" | "conflict" | "no_txn_id";
  userId?: string;
  userEmail?: string;
  detail?: string;
}

function OpsTab() {
  const [webhooks, setWebhooks] = useState<AppleWebhookResponse | null>(null);
  const [webhookStatus, setWebhookStatus] = useState("");
  const [includeGhosts, setIncludeGhosts] = useState(false);
  const [jobs, setJobs] = useState<JobRunResponse | null>(null);
  const [jobFilter, setJobFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  // null = idle, "all" = bulk reprocess in flight, "<txnId>" = single in flight
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [reprocessNotice, setReprocessNotice] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);
  // Manual-link modal: holds the txn id we're linking, the email input, and submission state
  const [linkModalTxn, setLinkModalTxn] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  // Per-row ghost mark/unmark in flight
  const [ghostMarking, setGhostMarking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const webhookParams = new URLSearchParams({ page: "1", pageSize: "50" });
      if (webhookStatus) webhookParams.set("status", webhookStatus);
      if (includeGhosts) webhookParams.set("includeGhosts", "1");
      const jobParams = new URLSearchParams({ page: "1", pageSize: "50" });
      if (jobFilter) jobParams.set("jobName", jobFilter);
      const [wh, jr] = await Promise.all([
        api.get<AppleWebhookResponse>(`/admin/apple-webhooks?${webhookParams}`),
        api.get<JobRunResponse>(`/admin/job-runs?${jobParams}`),
      ]);
      setWebhooks(wh);
      setJobs(jr);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [webhookStatus, jobFilter, includeGhosts]);

  const respondPendingConsumption = useCallback(async () => {
    setReprocessing("consumption");
    setReprocessNotice(null);
    try {
      const res = await api.post<{
        data: {
          processed: number;
          results: Array<{ txn: string; ok: boolean; reason?: string; orphan: boolean }>;
        };
      }>("/admin/apple/respond-consumption-pending", {});
      const ok = res.data.results.filter((r) => r.ok).length;
      const fail = res.data.results.length - ok;
      setReprocessNotice({
        kind: ok > 0 ? "ok" : fail === 0 ? "warn" : "err",
        text:
          res.data.processed === 0
            ? "No CONSUMPTION_REQUEST webhooks pending."
            : `Consumption responses: ${ok} submitted, ${fail} failed.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Consumption response failed" });
    } finally {
      setReprocessing(null);
    }
  }, [load]);

  const markGhost = useCallback(async (txnId: string) => {
    setGhostMarking(txnId);
    setReprocessNotice(null);
    try {
      await api.post(`/admin/apple/ghosts/${encodeURIComponent(txnId)}`, {});
      setReprocessNotice({
        kind: "ok",
        text: `${txnId.slice(0, 12)}…  Marked as ghost - silenced from chip + default view.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Mark ghost failed" });
    } finally {
      setGhostMarking(null);
    }
  }, [load]);

  const unmarkGhost = useCallback(async (txnId: string) => {
    setGhostMarking(txnId);
    setReprocessNotice(null);
    try {
      await api.delete(`/admin/apple/ghosts/${encodeURIComponent(txnId)}`);
      setReprocessNotice({
        kind: "ok",
        text: `${txnId.slice(0, 12)}…  Unmarked - back in the default view.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Unmark failed" });
    } finally {
      setGhostMarking(null);
    }
  }, [load]);

  const autoMarkGhosts = useCallback(async () => {
    setReprocessing("auto-mark");
    setReprocessNotice(null);
    try {
      const res = await api.post<{
        data: { marked: number; skipped: number; threshold: number; candidates: string[] };
      }>("/admin/apple/ghosts/auto-mark", { threshold: 3 });
      setReprocessNotice({
        kind: res.data.marked > 0 ? "ok" : "warn",
        text:
          res.data.marked === 0 && res.data.skipped === 0
            ? `No transactions with ≥${res.data.threshold} orphan events yet.`
            : `Auto-marked ${res.data.marked} ghost(s) (≥${res.data.threshold} orphans). ${res.data.skipped} already flagged.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Auto-mark failed" });
    } finally {
      setReprocessing(null);
    }
  }, [load]);

  const reprocessAll = useCallback(async () => {
    setReprocessing("all");
    setReprocessNotice(null);
    try {
      const res = await api.post<{ data: { processed: number; results: OrphanReprocessResult[] } }>(
        "/admin/apple/reprocess-orphans",
        {}
      );
      const linked = res.data.results.filter((r) => r.outcome === "linked").length;
      const stillUnlinked = res.data.results.length - linked;
      setReprocessNotice({
        kind: linked > 0 ? "ok" : "warn",
        text: `Processed ${res.data.processed}: ${linked} linked, ${stillUnlinked} still unlinked.`,
      });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Reprocess failed" });
    } finally {
      setReprocessing(null);
    }
  }, [load]);

  const submitManualLink = useCallback(async () => {
    if (!linkModalTxn || !linkEmail) return;
    setLinkSubmitting(true);
    setLinkError(null);
    try {
      const res = await api.post<{ data: { userId: string; userEmail: string; displayName: string | null; originalTransactionId: string } }>(
        "/admin/apple/link-orphan",
        { originalTransactionId: linkModalTxn, email: linkEmail.trim() }
      );
      const r = res.data;
      setReprocessNotice({
        kind: "ok",
        text: `${linkModalTxn.slice(0, 12)}…  Linked → ${r.displayName ?? r.userEmail}`,
      });
      setLinkModalTxn(null);
      setLinkEmail("");
      await load();
    } catch (err: any) {
      setLinkError(err?.message ?? "Link failed");
    } finally {
      setLinkSubmitting(false);
    }
  }, [linkModalTxn, linkEmail, load]);

  const reprocessOne = useCallback(async (txnId: string) => {
    setReprocessing(txnId);
    setReprocessNotice(null);
    try {
      const res = await api.post<{ data: OrphanReprocessResult }>(
        `/admin/apple/reprocess-orphan/${encodeURIComponent(txnId)}`,
        {}
      );
      const r = res.data;
      const kind: "ok" | "warn" = r.outcome === "linked" ? "ok" : "warn";
      const friendly =
        r.outcome === "linked" ? `Linked → ${r.userEmail ?? r.userId ?? "user"}`
        : r.outcome === "no_appAccountToken" ? "No appAccountToken on canonical transaction"
        : r.outcome === "still_no_user" ? "Apple's appAccountToken matched no user"
        : r.outcome === "conflict" ? "User already linked to a different transaction"
        : r.outcome === "fetch_failed" ? "Apple API fetch failed"
        : r.outcome;
      setReprocessNotice({ kind, text: `${txnId.slice(0, 12)}…  ${friendly}` });
      await load();
    } catch (err: any) {
      setReprocessNotice({ kind: "err", text: err?.message ?? "Reprocess failed" });
    } finally {
      setReprocessing(null);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !webhooks && !jobs) {
    return <LoadingSkeleton variant="card" count={3} style={{ height: 120 }} />;
  }
  if (error) {
    return <div className="alert alert--error" role="alert">{error}</div>;
  }

  const statusColor = (status: string) => {
    if (status === "success") return "var(--emerald-400)";
    if (status === "running") return "var(--dash-blue, #3b82f6)";
    if (status === "unhandled") return "var(--amber-500)";
    return "var(--dash-red)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Apple IAP Webhooks */}
      <Card title="Apple IAP Webhooks">
        {webhooks && (
          <>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem", fontSize: "0.8125rem" }}>
              <span style={{ color: "var(--text-secondary)" }}>Last 24h:</span>
              {Object.keys(webhooks.last24h).length === 0 ? (
                <span style={{ color: "var(--text-tertiary)" }}>no events</span>
              ) : (
                Object.entries(webhooks.last24h).map(([status, count]) => (
                  <span
                    key={status}
                    style={{
                      padding: "0.1rem 0.5rem",
                      borderRadius: 4,
                      background: `color-mix(in srgb, ${statusColor(status)} 18%, transparent)`,
                      color: statusColor(status),
                      fontWeight: 600,
                    }}
                  >
                    {status}: {count}
                  </span>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Filter:</span>
              <div style={{ minWidth: 180 }}>
                <Select
                  id="webhook-status-filter"
                  value={webhookStatus}
                  onChange={(e) => setWebhookStatus(e.target.value)}
                  aria-label="Filter by status"
                  options={[
                    { value: "", label: "All statuses" },
                    { value: "success", label: "success" },
                    { value: "verification_failed", label: "verification_failed" },
                    { value: "no_user", label: "no_user" },
                    { value: "handler_error", label: "handler_error" },
                    { value: "unhandled", label: "unhandled" },
                    { value: "no_transaction_id", label: "no_transaction_id" },
                    { value: "invalid_json", label: "invalid_json" },
                    { value: "missing_payload", label: "missing_payload" },
                    { value: "not_configured", label: "not_configured" },
                  ]}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
              {((webhooks.last24h["no_user"] ?? 0) > 0 || webhookStatus === "no_user") && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={reprocessAll}
                  disabled={reprocessing !== null}
                >
                  {reprocessing === "all" ? "Reprocessing…" : "Reprocess all orphans"}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={respondPendingConsumption}
                disabled={reprocessing !== null}
                title="Submit consumption-data responses for any CONSUMPTION_REQUEST webhooks awaiting a response (last 14 days)"
              >
                {reprocessing === "consumption" ? "Submitting…" : "Respond to pending CONSUMPTION_REQUESTs"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={autoMarkGhosts}
                disabled={reprocessing !== null}
                title="Flag any transaction with 3+ no_user events as a ghost. Silences them from the Last 24h chip + default panel view."
              >
                {reprocessing === "auto-mark" ? "Marking…" : "Auto-mark ghosts"}
              </Button>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.8125rem",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  marginLeft: "0.5rem",
                }}
                title="Include rows for transactions you've marked as ghosts"
              >
                <input
                  type="checkbox"
                  checked={includeGhosts}
                  onChange={(e) => setIncludeGhosts(e.target.checked)}
                />
                Show ghosts
                {webhooks.ghostCount && webhooks.ghostCount > 0 ? (
                  <span style={{ color: "var(--text-secondary)" }}>
                    ({webhooks.ghostCount})
                  </span>
                ) : null}
              </label>
            </div>
            {reprocessNotice && (
              <div
                role="status"
                style={{
                  padding: "0.5rem 0.75rem",
                  borderRadius: 6,
                  marginBottom: "0.75rem",
                  fontSize: "0.8125rem",
                  background:
                    reprocessNotice.kind === "ok"
                      ? "color-mix(in srgb, var(--emerald-400) 14%, transparent)"
                      : reprocessNotice.kind === "warn"
                      ? "color-mix(in srgb, var(--amber-500) 14%, transparent)"
                      : "color-mix(in srgb, var(--dash-red) 14%, transparent)",
                  color:
                    reprocessNotice.kind === "ok"
                      ? "var(--emerald-400)"
                      : reprocessNotice.kind === "warn"
                      ? "var(--amber-500)"
                      : "var(--dash-red)",
                }}
              >
                {reprocessNotice.text}
              </div>
            )}
            {webhooks.data.length === 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                No webhook entries yet.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Received</th>
                      <th title="Production = App Store customer. Sandbox = TestFlight tester or App Review; grants Pro, never revenue.">Env</th>
                      <th>Type</th>
                      <th>Subtype</th>
                      <th>Status</th>
                      <th>Txn ID</th>
                      <th>User</th>
                      <th>Error</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {webhooks.data.map((w) => (
                      <tr
                        key={w.id}
                        style={w.isGhost ? { opacity: 0.55 } : undefined}
                      >
                        <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                          {new Date(w.receivedAt).toLocaleString()}
                        </td>
                        <td style={{ fontSize: "0.75rem" }}>
                          {w.environment === "sandbox" ? (
                            <span style={{ color: "var(--amber-400, #fbbf24)", fontWeight: 600 }}>sandbox</span>
                          ) : (
                            w.environment || "-"
                          )}
                        </td>
                        <td style={{ fontSize: "0.75rem" }}>{w.notificationType || "-"}</td>
                        <td style={{ fontSize: "0.75rem" }}>{w.subtype || "-"}</td>
                        <td style={{ fontSize: "0.75rem" }}>
                          <span style={{ color: statusColor(w.status), fontWeight: 600 }}>{w.status}</span>
                          {w.isGhost && (
                            <span
                              title="Marked as ghost - excluded from chip + default view"
                              style={{
                                marginLeft: "0.4rem",
                                padding: "0 0.35rem",
                                borderRadius: 4,
                                background: "color-mix(in srgb, var(--text-tertiary) 18%, transparent)",
                                color: "var(--text-tertiary)",
                                fontSize: "0.6875rem",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}
                            >
                              ghost
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: "0.6875rem", fontFamily: "monospace", color: "var(--text-tertiary)" }}>
                          {w.originalTransactionId ? w.originalTransactionId.slice(0, 12) + "..." : "-"}
                        </td>
                        <td style={{ fontSize: "0.6875rem", fontFamily: "monospace", color: "var(--text-tertiary)" }}>
                          {w.userId ? w.userId.slice(0, 8) + "..." : "-"}
                        </td>
                        <td style={{ fontSize: "0.75rem", maxWidth: 280 }}>
                          {w.errorMessage ? (
                            <button
                              onClick={() => setExpandedError(expandedError === w.id ? null : w.id)}
                              style={{ background: "none", border: "none", color: "var(--dash-red)", cursor: "pointer", textAlign: "left", padding: 0, font: "inherit", whiteSpace: expandedError === w.id ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: 280 }}
                              title="Click to toggle full error"
                            >
                              {w.errorMessage}
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={{ fontSize: "0.75rem" }}>
                          {w.status === "no_user" && w.originalTransactionId ? (
                            <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                              {!w.isGhost && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => reprocessOne(w.originalTransactionId!)}
                                  disabled={reprocessing !== null || ghostMarking !== null}
                                >
                                  {reprocessing === w.originalTransactionId ? "…" : "Reprocess"}
                                </Button>
                              )}
                              {!w.isGhost && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setLinkModalTxn(w.originalTransactionId);
                                    setLinkEmail("");
                                    setLinkError(null);
                                  }}
                                  disabled={reprocessing !== null || ghostMarking !== null}
                                >
                                  Link…
                                </Button>
                              )}
                              {w.isGhost ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => unmarkGhost(w.originalTransactionId!)}
                                  disabled={ghostMarking !== null}
                                  title="Bring this transaction back into the default view"
                                >
                                  {ghostMarking === w.originalTransactionId ? "…" : "Unmark"}
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => markGhost(w.originalTransactionId!)}
                                  disabled={ghostMarking !== null || reprocessing !== null}
                                  title="Mark this transaction as a known ghost - silence it from the chip + default view"
                                >
                                  {ghostMarking === w.originalTransactionId ? "…" : "Ghost"}
                                </Button>
                              )}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Job Runs */}
      <Card title="Background Jobs">
        {jobs && (
          <>
            {jobs.latestPerJob.length > 0 && (
              <div style={{ marginBottom: "0.75rem" }}>
                <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0 0 0.5rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Latest run per job
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0.5rem" }}>
                  {jobs.latestPerJob.map((l) => (
                    <div
                      key={l.jobName}
                      style={{
                        padding: "0.5rem 0.75rem",
                        background: "var(--bg-elevated, rgba(255,255,255,0.03))",
                        border: `1px solid color-mix(in srgb, ${statusColor(l.status)} 30%, transparent)`,
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                        {l.jobName}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: statusColor(l.status), fontWeight: 600 }}>
                        {l.status}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                        {timeAgo(l.startedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Filter:</span>
              <div style={{ minWidth: 200 }}>
                <Input
                  id="job-filter"
                  placeholder="Job name (e.g. streak_at_risk)"
                  value={jobFilter}
                  onChange={(e) => setJobFilter(e.target.value)}
                />
              </div>
              <Button variant="ghost" size="sm" onClick={load}>Refresh</Button>
            </div>

            {jobs.data.length === 0 ? (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                No job runs yet.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Started</th>
                      <th>Job</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.data.map((r) => {
                      const dur = r.finishedAt
                        ? Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 10) / 100
                        : null;
                      return (
                        <tr key={r.id}>
                          <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                            {new Date(r.startedAt).toLocaleString()}
                          </td>
                          <td style={{ fontSize: "0.75rem", fontFamily: "monospace" }}>{r.jobName}</td>
                          <td style={{ fontSize: "0.75rem" }}>
                            <span style={{ color: statusColor(r.status), fontWeight: 600 }}>{r.status}</span>
                          </td>
                          <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                            {dur !== null ? `${dur.toFixed(2)}s` : "-"}
                          </td>
                          <td style={{ fontSize: "0.75rem", maxWidth: 320 }}>
                            {r.errorMessage ? (
                              <button
                                onClick={() => setExpandedError(expandedError === r.id ? null : r.id)}
                                style={{ background: "none", border: "none", color: "var(--dash-red)", cursor: "pointer", textAlign: "left", padding: 0, font: "inherit", whiteSpace: expandedError === r.id ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "inline-block", maxWidth: 320 }}
                                title="Click to toggle full error"
                              >
                                {r.errorMessage}
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Manual-link modal - used when an Apple IAP orphan has no
          appAccountToken on the canonical transaction (pre-1.1.0
          purchase) and a user has reached out to support to claim it. */}
      <Modal
        open={linkModalTxn !== null}
        onClose={() => {
          if (!linkSubmitting) setLinkModalTxn(null);
        }}
        title="Link Apple IAP transaction to a user"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", margin: 0 }}>
            Use this when a user has confirmed they paid for Pro but the app shows them as Free
            (typically a pre-1.1.0 purchase whose <code>appAccountToken</code> was never recorded).
          </p>
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", fontFamily: "monospace" }}>
            Transaction: {linkModalTxn ?? ""}
          </div>
          <Input
            id="link-orphan-email"
            label="MileClear account email"
            type="email"
            value={linkEmail}
            onChange={(e) => setLinkEmail(e.target.value)}
            placeholder="user@example.com"
            autoFocus
          />
          {linkError && (
            <div className="alert alert--error" role="alert">{linkError}</div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLinkModalTxn(null)}
              disabled={linkSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={submitManualLink}
              disabled={linkSubmitting || !linkEmail.trim()}
            >
              {linkSubmitting ? "Linking…" : "Link & grant Pro"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts Tab - diagnostic alerts sent to users
// ---------------------------------------------------------------------------

interface AlertEvent {
  id: string;
  type: string;
  userId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user?: { email: string; displayName: string | null } | null;
}

function AlertsTab() {
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ data: AlertEvent[] }>("/admin/diagnostic-alerts")
      .then((res) => setAlerts(res.data))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="row" count={6} />;

  const alertLabel = (type: string) => {
    // Heartbeat-driven (10 May 2026)
    if (type === "alert.heartbeat_bg_location_lost") return "Background Location Lost";
    if (type === "alert.heartbeat_bg_fetch_denied") return "Background Refresh Denied";
    if (type === "alert.heartbeat_sync_perm_failed") return "Sync Queue Failed";
    if (type === "alert.heartbeat_low_disk") return "Low Disk Space";
    // Revenue-impact
    if (type.includes("subscription_orphan")) return "Subscription Orphan";
    // Diagnostic-dump-driven (legacy)
    if (type.includes("permission")) return "Permission Missing";
    if (type.includes("task_not")) return "Task Stopped";
    if (type.includes("stuck")) return "Stuck Recording";
    return type;
  };

  const alertColor = (type: string) => {
    // Red - actively breaking the user's tracking pipeline
    if (type === "alert.heartbeat_bg_location_lost") return "var(--dash-red)";
    if (type === "alert.heartbeat_bg_fetch_denied") return "var(--dash-red)";
    if (type === "alert.heartbeat_sync_perm_failed") return "var(--dash-red)";
    if (type.includes("permission")) return "var(--dash-red)";
    if (type.includes("task_not")) return "var(--dash-red)";
    // Amber - degraded but recoverable
    if (type === "alert.heartbeat_low_disk") return "var(--amber-500)";
    if (type.includes("stuck")) return "var(--amber-500)";
    if (type.includes("subscription_orphan")) return "var(--amber-500)";
    return "var(--text-secondary)";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <Card title="Diagnostic Alerts">
        <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 1rem" }}>
          Alerts sent to users when their diagnostics show fixable issues. You receive a copy of each as a push notification.
        </p>
        {alerts.length === 0 ? (
          <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>
            No alerts sent yet. Alerts fire when users upload diagnostics or when the periodic scan runs (every 6 hours).
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Alert</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontSize: "0.75rem", whiteSpace: "nowrap" }}>
                      {timeAgo(a.createdAt)}
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>
                        {new Date(a.createdAt).toLocaleString()}
                      </div>
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {a.user?.displayName || a.user?.email || a.userId || "-"}
                    </td>
                    <td>
                      <span style={{
                        color: alertColor(a.type),
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                      }}>
                        {alertLabel(a.type)}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {a.metadata ? JSON.stringify(a.metadata) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Ops() {
  return (
    <>
      <p className="admin-page__intro">Also in this section: <Link href="/dashboard/admin/build-health" className="admin-nav__item">Build health</Link> <Link href="/dashboard/admin/issues-by-hour" className="admin-nav__item">Issues by hour</Link></p>
      <HealthTab />
      <OpsTab />
      <AlertsTab />
    </>
  );
}

export default function AdminOpsPage() {
  return (
    <AdminPage title="Ops" intro="System health, webhooks, jobs, audit log and alerts.">
      <Ops />
    </AdminPage>
  );
}
