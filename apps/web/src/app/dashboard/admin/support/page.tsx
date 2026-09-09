"use client";

// Support section of the admin area (Sep 2026 redesign).

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Input } from "@/components/ui/Input";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import Link from "next/link";
import { AdminPage } from "@/components/admin";
import { SupportQueue } from "@/components/admin/sections/SupportQueue";

import { timeAgo } from "@/components/admin/legacy";

// ---------------------------------------------------------------------------
// Feedback Tab
// ---------------------------------------------------------------------------

const FB_STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "new", label: "New" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
];

const FB_CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "feature_request", label: "Feature Request" },
  { value: "bug_report", label: "Bug Report" },
  { value: "improvement", label: "Improvement" },
  { value: "other", label: "Other" },
];

const FB_STATUSES = [
  { value: "new", label: "New", color: "#8494a7" },
  { value: "planned", label: "Planned", color: "#3b82f6" },
  { value: "in_progress", label: "In Progress", color: "#f5a623" },
  { value: "done", label: "Done", color: "#34c759" },
  { value: "declined", label: "Declined", color: "#ef4444" },
];

const KI_STATUSES = [
  { value: "investigating", label: "Investigating", color: "#f59e0b" },
  { value: "fix_in_progress", label: "Fix in Progress", color: "#3b82f6" },
  { value: "fixed", label: "Fixed", color: "#10b981" },
];

interface FbItem {
  id: string;
  displayName: string | null;
  title: string;
  body: string;
  category: string;
  status: string;
  upvoteCount: number;
  replyCount: number;
  isKnownIssue: boolean;
  knownIssueStatus: string | null;
  createdAt: string;
  hasVoted: boolean;
  isOwner: boolean;
  replies: { id: string; body: string; adminName: string; createdAt: string }[];
}

function FeedbackTab() {
  const [items, setItems] = useState<FbItem[]>([]);
  const [stats, setStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", sort: "newest" });
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      const [listRes, statsRes] = await Promise.all([
        api.get<{ data: FbItem[]; totalPages: number }>(`/feedback/?${params}`),
        api.get<{ data: { total: number; byStatus: Record<string, number> } }>("/feedback/stats"),
      ]);
      setItems(listRes.data);
      setTotalPages(listRes.totalPages);
      setStats(statsRes.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, categoryFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await api.patch(`/feedback/${id}/status`, { status: newStatus });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));
    } catch {} finally { setUpdatingId(null); }
  };

  const handleToggleKnownIssue = async (id: string, currentlyKnown: boolean) => {
    const newVal = !currentlyKnown;
    try {
      await api.patch(`/feedback/${id}/known-issue`, { isKnownIssue: newVal, knownIssueStatus: newVal ? "investigating" : null });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isKnownIssue: newVal, knownIssueStatus: newVal ? "investigating" : null } : i)));
    } catch {}
  };

  const handleKnownIssueStatus = async (id: string, status: string) => {
    try {
      await api.patch(`/feedback/${id}/known-issue`, { isKnownIssue: true, knownIssueStatus: status });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isKnownIssue: true, knownIssueStatus: status } : i)));
    } catch {}
  };

  const handleSendReply = async (feedbackId: string) => {
    const body = replyText.trim();
    if (!body) return;
    setSendingReply(true);
    try {
      const res = await api.post<{ data: { id: string; body: string; adminName: string; createdAt: string } }>(`/feedback/${feedbackId}/reply`, { body });
      setItems((prev) => prev.map((i) => (i.id === feedbackId ? { ...i, replyCount: i.replyCount + 1, replies: [...i.replies, res.data] } : i)));
      setReplyText("");
    } catch {} finally { setSendingReply(false); }
  };

  const handleDeleteReply = async (feedbackId: string, replyId: string) => {
    try {
      await api.delete(`/feedback/reply/${replyId}`);
      setItems((prev) => prev.map((i) => (i.id === feedbackId ? { ...i, replyCount: Math.max(0, i.replyCount - 1), replies: i.replies.filter((r) => r.id !== replyId) } : i)));
    } catch {}
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/feedback/${deleteId}`);
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
      if (expandedId === deleteId) setExpandedId(null);
    } catch {} finally { setDeleteId(null); }
  };

  if (loading && items.length === 0) return <LoadingSkeleton variant="card" count={3} style={{ height: 90 }} />;
  if (error) return <div className="alert alert--error">{error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Stats row */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <p className="stat-card__label">Total</p>
            <p className="stat-card__value">{stats.total}</p>
          </div>
          {FB_STATUSES.map((st) => (
            <div className="stat-card" key={st.value}>
              <p className="stat-card__label">{st.label}</p>
              <p className="stat-card__value" style={{ color: st.color }}>{stats.byStatus[st.value] || 0}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ minWidth: 160 }}>
          <Select id="fbStatus" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} options={FB_STATUS_OPTIONS} />
        </div>
        <div style={{ minWidth: 160 }}>
          <Select id="fbCategory" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} options={FB_CATEGORY_OPTIONS} />
        </div>
      </div>

      {/* Feedback list */}
      {items.length === 0 ? (
        <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "2rem 0" }}>No feedback found</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const statusMeta = FB_STATUSES.find((s) => s.value === item.status);
            return (
              <div key={item.id}>
                <div
                  onClick={() => { setExpandedId(expanded ? null : item.id); if (!expanded) setReplyText(""); }}
                  style={{
                    display: "flex", gap: "1rem", padding: "1rem 1.25rem",
                    background: "var(--dash-card-bg)", border: "1px solid var(--dash-card-border)",
                    borderRadius: expanded ? "var(--r-md) var(--r-md) 0 0" : "var(--r-md)",
                    cursor: "pointer", transition: "background 0.15s",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text-primary)" }}>{item.title}</span>
                      {item.isKnownIssue && (
                        <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#ef4444", background: "rgba(239,68,68,0.12)", padding: "1px 6px", borderRadius: 4, textTransform: "uppercase" }}>Known Issue</span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap", fontSize: "0.75rem" }}>
                      <Badge variant="source">{FB_CATEGORY_OPTIONS.find((c) => c.value === item.category)?.label || item.category}</Badge>
                      {statusMeta && <Badge variant={item.status === "done" ? "success" : item.status === "declined" ? "danger" : item.status === "planned" ? "business" : "source"}>{statusMeta.label}</Badge>}
                      <span style={{ color: "var(--text-faint)" }}>by {item.displayName || "Anonymous"}</span>
                      <span style={{ color: "var(--text-faint)" }}>{timeAgo(item.createdAt)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexShrink: 0, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    <span title="Votes" style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
                      {item.upvoteCount}
                    </span>
                    {item.replyCount > 0 && (
                      <span title="Replies" style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "var(--emerald-400)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        {item.replyCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{
                    padding: "1.25rem", background: "var(--dash-card-bg)",
                    border: "1px solid var(--dash-card-border)", borderTop: "none",
                    borderRadius: "0 0 var(--r-md) var(--r-md)",
                  }}>
                    <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 1.25rem" }}>{item.body}</p>

                    {/* Status */}
                    <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Status</p>
                    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                      {FB_STATUSES.map((st) => (
                        <button key={st.value} onClick={() => handleStatusChange(item.id, st.value)} disabled={updatingId === item.id}
                          style={{
                            padding: "0.25rem 0.625rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                            border: `1px solid ${item.status === st.value ? st.color : "var(--border-default)"}`,
                            background: item.status === st.value ? st.color + "18" : "transparent",
                            color: item.status === st.value ? st.color : "var(--text-secondary)",
                            opacity: updatingId === item.id ? 0.5 : 1, transition: "all 0.15s",
                          }}
                        >{st.label}</button>
                      ))}
                    </div>

                    {/* Known Issue */}
                    <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Known Issue</p>
                    <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: item.isKnownIssue ? "0.5rem" : "1rem" }}>
                      <button onClick={() => handleToggleKnownIssue(item.id, item.isKnownIssue)}
                        style={{
                          padding: "0.25rem 0.625rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                          border: `1px solid ${item.isKnownIssue ? "rgba(239,68,68,0.3)" : "var(--border-default)"}`,
                          background: item.isKnownIssue ? "rgba(239,68,68,0.08)" : "transparent",
                          color: item.isKnownIssue ? "#ef4444" : "var(--text-secondary)", transition: "all 0.15s",
                        }}
                      >{item.isKnownIssue ? "Remove Known Issue" : "Mark as Known Issue"}</button>
                    </div>
                    {item.isKnownIssue && (
                      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                        {KI_STATUSES.map((st) => (
                          <button key={st.value} onClick={() => handleKnownIssueStatus(item.id, st.value)}
                            style={{
                              padding: "0.25rem 0.625rem", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                              border: `1px solid ${item.knownIssueStatus === st.value ? st.color : "var(--border-default)"}`,
                              background: item.knownIssueStatus === st.value ? st.color + "18" : "transparent",
                              color: item.knownIssueStatus === st.value ? st.color : "var(--text-secondary)", transition: "all 0.15s",
                            }}
                          >{st.label}</button>
                        ))}
                      </div>
                    )}

                    {/* Replies */}
                    {item.replies.length > 0 && (
                      <div style={{ marginBottom: "1rem" }}>
                        <p style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Replies</p>
                        {item.replies.map((r) => (
                          <div key={r.id} style={{ borderLeft: "2px solid var(--amber-400, #f5a623)", background: "rgba(245,166,35,0.05)", borderRadius: "0 6px 6px 0", padding: "0.625rem 0.875rem", marginBottom: "0.375rem", position: "relative" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                              <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--amber-400, #f5a623)" }}>{r.adminName}</span>
                              <span style={{ fontSize: "0.625rem", color: "var(--text-faint)" }}>{timeAgo(r.createdAt)}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.5, paddingRight: "1.5rem" }}>{r.body}</p>
                            <button onClick={() => handleDeleteReply(item.id, r.id)} title="Delete reply"
                              style={{ position: "absolute", bottom: 8, right: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-faint)", fontSize: "0.75rem" }}
                            >&times;</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reply input */}
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginBottom: "1rem" }}>
                      <div style={{ flex: 1 }}>
                        <Input id={`reply-${item.id}`} placeholder="Write a reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                      </div>
                      <Button variant="primary" size="sm" onClick={() => handleSendReply(item.id)} disabled={sendingReply || !replyText.trim()}>
                        {sendingReply ? "Sending..." : "Reply"}
                      </Button>
                    </div>

                    {/* Delete */}
                    <Button variant="danger" size="sm" onClick={() => setDeleteId(item.id)}>Delete Feedback</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Feedback"
        message="This will permanently delete this feedback and all its votes. This can't be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}


export default function AdminFeedbackTabPage() {
  return (
    <AdminPage title="Support" intro="Feedback threads, missing-trip reports and the people waiting on a reply.">
      <p className="admin-page__intro">Also in this section: <Link href="/dashboard/admin/missing-trips" className="admin-nav__item">Missing-trip reports</Link></p>
      <SupportQueue />
      <FeedbackTab />
    </AdminPage>
  );
}
