"use client";

import { useCallback, useEffect, useState } from "react";
import type { TeamMonthDriver, TeamMonthSummary } from "@mileclear/shared";
import { formatPence } from "@mileclear/shared";
import { api, fetchWithAuth } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../components/ui/Toast";
import { Modal } from "../../../components/ui/Modal";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import { EmptyState } from "../../../components/ui/EmptyState";

// Phase 2: the manager works through one calendar month at a time, approving
// or querying each driver's business mileage, then downloads a single
// consolidated document for payroll. Drivers are notified when queried.

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type DownloadState = "idle" | "loading";

export function MonthView() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [month, setMonth] = useState(currentMonthStr());
  const [summary, setSummary] = useState<TeamMonthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const [queryDriver, setQueryDriver] = useState<TeamMonthDriver | null>(null);
  const [queryNote, setQueryNote] = useState("");
  const [queryLoading, setQueryLoading] = useState(false);

  const [csvState, setCsvState] = useState<DownloadState>("idle");
  const [pdfState, setPdfState] = useState<DownloadState>("idle");

  const isCurrentMonth = month === currentMonthStr();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<{ data: TeamMonthSummary }>(`/team/month?month=${month}`)
      .then((res) => setSummary(res.data))
      .catch((err: Error) => setError(err.message || "Could not load this month"))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(load, [load]);

  const updateDriver = (userId: string, patch: Partial<TeamMonthDriver>) => {
    setSummary((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        drivers: prev.drivers.map((d) => (d.userId === userId ? { ...d, ...patch } : d)),
      };
    });
  };

  const handleApprove = async (driver: TeamMonthDriver) => {
    const previous = { ...driver };
    setBusyUserId(driver.userId);
    updateDriver(driver.userId, {
      status: "approved",
      approvedAt: new Date().toISOString(),
      approvedByName: user?.displayName || "You",
      driftMiles: null,
      note: null,
    });
    try {
      await api.post("/team/approvals", { userId: driver.userId, month, status: "approved" });
      toast(`Approved ${monthLabel(month)} for ${driver.displayName || driver.email}`, "success");
    } catch (err) {
      updateDriver(driver.userId, previous);
      toast(err instanceof Error ? err.message : "Couldn't approve that month", "error");
    } finally {
      setBusyUserId(null);
    }
  };

  const openQuery = (driver: TeamMonthDriver) => {
    setQueryDriver(driver);
    setQueryNote("");
  };

  const submitQuery = async () => {
    if (!queryDriver || !queryNote.trim()) return;
    setQueryLoading(true);
    try {
      await api.post("/team/approvals", {
        userId: queryDriver.userId,
        month,
        status: "queried",
        note: queryNote.trim(),
      });
      updateDriver(queryDriver.userId, {
        status: "queried",
        note: queryNote.trim(),
        approvedAt: null,
        approvedByName: null,
        driftMiles: null,
      });
      toast(`Queried ${monthLabel(month)} for ${queryDriver.displayName || queryDriver.email}`, "success");
      setQueryDriver(null);
      setQueryNote("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't send the query", "error");
    } finally {
      setQueryLoading(false);
    }
  };

  const handleDownload = async (format: "csv" | "pdf") => {
    const setState = format === "csv" ? setCsvState : setPdfState;
    setState("loading");
    try {
      const res = await fetchWithAuth(`/team/export?month=${month}&format=${format}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Download failed" }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Prefer the filename the server chose (org name + month): a bookkeeper
      // ends up with a folder of these and "mileclear-team-2026-09" tells them
      // nothing about which company it belongs to.
      const disposition = res.headers.get("content-disposition") ?? "";
      const named = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1];
      a.download = named ? decodeURIComponent(named) : `mileclear-team-${month}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't download that file", "error");
    } finally {
      setState("idle");
    }
  };

  const drivers = summary?.drivers ?? [];
  const nothingApproved = (summary?.approvedCount ?? 0) === 0;

  return (
    <div className="glass-card" style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Monthly approval</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: "0.25rem 0 0" }}>
            Check each driver&rsquo;s business mileage, approve or query it, then download one file for payroll.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn--ghost"
            aria-label="Previous month"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            &larr;
          </button>
          <span style={{ minWidth: 150, textAlign: "center", fontWeight: 600 }}>{monthLabel(month)}</span>
          <button
            type="button"
            className="btn btn--ghost"
            aria-label="Next month"
            disabled={isCurrentMonth}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            &rarr;
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton variant="row" count={4} style={{ marginBottom: 8 }} />
      ) : error ? (
        <div className="alert alert--error">{error}</div>
      ) : drivers.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
          title="No drivers yet"
          description="Invite your drivers above. Once they accept and record some business trips, their month will appear here for approval."
          action={
            <a href="#invite-drivers" className="btn btn--ghost">
              Go to invite drivers
            </a>
          }
        />
      ) : (
        <>
          <div style={{
            display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "baseline",
            marginBottom: "1rem", padding: "0.875rem 1rem",
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
          }}>
            <div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{summary?.totalMiles.toFixed(1)}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>business miles</div>
            </div>
            <div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--amber-400)" }}>
                {formatPence(summary?.totalAmountPence ?? 0)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>total to reimburse</div>
            </div>
            <div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--emerald-400, #10b981)" }}>
                {summary?.approvedCount ?? 0}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>approved</div>
            </div>
            <div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{summary?.pendingCount ?? 0}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>pending</div>
            </div>
            {(summary?.queriedCount ?? 0) > 0 && (
              <div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--dash-red, #ef4444)" }}>
                  {summary?.queriedCount}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>queried</div>
              </div>
            )}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th style={{ textAlign: "right" }}>Trips</th>
                  <th style={{ textAlign: "right" }}>Miles</th>
                  <th className="hide-mobile">Rate</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {drivers.map((d) => {
                  const name = d.displayName || d.email;
                  const busy = busyUserId === d.userId;
                  return (
                    <tr key={d.userId}>
                      <td>
                        <div>{name}</div>
                        {d.displayName && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{d.email}</div>
                        )}
                        {d.unclassifiedTrips > 0 && (
                          <div style={{ marginTop: 4 }}>
                            <Badge variant="danger">{d.unclassifiedTrips} unclassified</Badge>
                            <div style={{ fontSize: "0.75rem", color: "var(--dash-red, #ef4444)", marginTop: 2 }}>
                              This total is incomplete. {d.unclassifiedTrips} trip{d.unclassifiedTrips === 1 ? " hasn't" : "s haven't"} been classified yet.
                            </div>
                          </div>
                        )}
                        {d.driftMiles !== null && (
                          <div style={{ marginTop: 4 }}>
                            <Badge variant="warning">Changed since approval</Badge>
                            <div style={{ fontSize: "0.75rem", color: "var(--amber-400)", marginTop: 2 }}>
                              Miles moved by {d.driftMiles > 0 ? "+" : ""}{d.driftMiles.toFixed(1)} mi since this was signed off. What was approved no longer matches what&rsquo;s here now.
                            </div>
                          </div>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.businessTrips}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.businessMiles.toFixed(1)}</td>
                      <td className="hide-mobile">
                        {d.ratePence}p/mi
                        {d.usesOwnRate && (
                          <span style={{ marginLeft: 6 }}>
                            <Badge variant="source">own rate</Badge>
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {formatPence(d.amountPence)}
                      </td>
                      <td>
                        {d.status === "approved" && (
                          <>
                            <Badge variant="success">Approved</Badge>
                            {d.approvedAt && (
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
                                by {d.approvedByName || "manager"} on {formatDateTime(d.approvedAt)}
                              </div>
                            )}
                          </>
                        )}
                        {d.status === "queried" && (
                          <>
                            <Badge variant="danger">Queried</Badge>
                            {d.note && (
                              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2, maxWidth: 220 }}>
                                &ldquo;{d.note}&rdquo;
                              </div>
                            )}
                          </>
                        )}
                        {d.status === "pending" && <Badge variant="warning">Pending</Badge>}
                      </td>
                      <td>
                        <div className="table__actions">
                          {d.status !== "approved" || d.driftMiles !== null ? (
                            <button
                              type="button"
                              className="table__action-btn"
                              disabled={busy}
                              aria-label={`Approve ${monthLabel(month)} for ${name}`}
                              onClick={() => handleApprove(d)}
                            >
                              {d.status === "approved" ? "Re-approve" : "Approve"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="table__action-btn table__action-btn--danger"
                            disabled={busy}
                            aria-label={`Query ${monthLabel(month)} for ${name}`}
                            onClick={() => openQuery(d)}
                          >
                            Query
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ fontWeight: 700 }}>Total</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {drivers.reduce((s, d) => s + d.businessTrips, 0)}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {(summary?.totalMiles ?? 0).toFixed(1)}
                  </td>
                  <td className="hide-mobile" />
                  <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formatPence(summary?.totalAmountPence ?? 0)}
                  </td>
                  <td />
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleDownload("csv")}
              disabled={nothingApproved || csvState === "loading"}
              title={nothingApproved ? "Approve at least one driver's month before downloading" : undefined}
            >
              {csvState === "loading" ? "Downloading..." : "Download CSV"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleDownload("pdf")}
              disabled={nothingApproved || pdfState === "loading"}
              title={nothingApproved ? "Approve at least one driver's month before downloading" : undefined}
            >
              {pdfState === "loading" ? "Downloading..." : "Download PDF"}
            </Button>
            {nothingApproved && (
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                Approve at least one driver before you can download {monthLabel(month)}&rsquo;s report.
              </span>
            )}
          </div>
        </>
      )}

      <Modal
        open={!!queryDriver}
        onClose={() => (queryLoading ? null : setQueryDriver(null))}
        title={queryDriver ? `Query ${monthLabel(month)} for ${queryDriver.displayName || queryDriver.email}` : "Query month"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setQueryDriver(null)} disabled={queryLoading}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={submitQuery} disabled={queryLoading || !queryNote.trim()}>
              {queryLoading ? "Sending..." : "Send query"}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "0.75rem" }}>
          {queryDriver?.displayName || queryDriver?.email} will get a notification with your note, so they know
          what to check or fix.
        </p>
        <div className="form-group">
          <label htmlFor="queryNote" className="form-label">
            What needs checking (required)
          </label>
          <textarea
            id="queryNote"
            className="form-input"
            rows={3}
            value={queryNote}
            onChange={(e) => setQueryNote(e.target.value)}
            placeholder="e.g. Tuesday's trip to Manchester looks like it might be personal, can you check?"
          />
        </div>
      </Modal>
    </div>
  );
}
