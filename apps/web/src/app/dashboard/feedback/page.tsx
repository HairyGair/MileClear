"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Modal } from "../../../components/ui/Modal";
import { Pagination } from "../../../components/ui/Pagination";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeedbackCategory = "feature_request" | "bug_report" | "improvement" | "other";
type FeedbackStatus = "new" | "planned" | "in_progress" | "done" | "declined";
type KnownIssueStatus = "investigating" | "fix_in_progress" | "fixed";
type SortOption = "newest" | "most_voted";

interface FeedbackReply {
  id: string;
  body: string;
  adminName: string;
  createdAt: string;
}

interface FeedbackItem {
  id: string;
  displayName: string;
  title: string;
  body: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  upvoteCount: number;
  replyCount: number;
  isKnownIssue: boolean;
  knownIssueStatus: KnownIssueStatus | null;
  createdAt: string;
  hasVoted: boolean;
  isOwner: boolean;
  replies: FeedbackReply[];
}

interface FeedbackResponse {
  data: FeedbackItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  planned: "Planned",
  in_progress: "In Progress",
  done: "Done",
  declined: "Declined",
};

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  feature_request: "Feature Request",
  bug_report: "Bug Report",
  improvement: "Improvement",
  other: "Other",
};

type BadgeVariant = "source" | "business" | "primary" | "success" | "danger";

const STATUS_BADGE_VARIANT: Record<FeedbackStatus, BadgeVariant> = {
  new: "source",
  planned: "business",
  in_progress: "primary",
  done: "success",
  declined: "danger",
};

const KNOWN_ISSUE_STATUS_META: Record<KnownIssueStatus, { label: string; color: string }> = {
  investigating: { label: "Investigating", color: "#f59e0b" },
  fix_in_progress: { label: "Fix in Progress", color: "#3b82f6" },
  fixed: { label: "Fixed", color: "#10b981" },
};

const CATEGORY_OPTIONS = [
  { value: "", label: "All categories" },
  { value: "feature_request", label: "Feature Request" },
  { value: "bug_report", label: "Bug Report" },
  { value: "improvement", label: "Improvement" },
  { value: "other", label: "Other" },
];

const SORT_OPTIONS = [
  { value: "most_voted", label: "Most voted" },
  { value: "newest", label: "Newest" },
];

const SUBMIT_CATEGORY_OPTIONS = [
  { value: "feature_request", label: "Feature Request" },
  { value: "bug_report", label: "Bug Report" },
  { value: "improvement", label: "Improvement" },
  { value: "other", label: "Other" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeedbackPage() {
  // List state
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortOption>("most_voted");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [knownIssues, setKnownIssues] = useState<FeedbackItem[]>([]);

  // Submit modal state
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitTitle, setSubmitTitle] = useState("");
  const [submitBody, setSubmitBody] = useState("");
  const [submitCategory, setSubmitCategory] = useState<FeedbackCategory>("feature_request");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load feedback
  // ---------------------------------------------------------------------------

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort,
      });
      if (category) {
        params.set("category", category);
      }
      const [res, kiRes] = await Promise.all([
        api.get<FeedbackResponse>(`/feedback/?${params}`),
        api.get<{ data: FeedbackItem[] }>("/feedback/known-issues"),
      ]);
      setItems(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setKnownIssues(kiRes.data);
    } catch (err: any) {
      setError(err.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, [page, category, sort]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  // ---------------------------------------------------------------------------
  // Vote (optimistic update)
  // ---------------------------------------------------------------------------

  const handleVote = useCallback(async (id: string) => {
    const optimistic = (list: FeedbackItem[]) =>
      list.map((item) => {
        if (item.id !== id) return item;
        const willVote = !item.hasVoted;
        return { ...item, hasVoted: willVote, upvoteCount: item.upvoteCount + (willVote ? 1 : -1) };
      });

    const revert = (list: FeedbackItem[]) =>
      list.map((item) => {
        if (item.id !== id) return item;
        const rev = !item.hasVoted;
        return { ...item, hasVoted: rev, upvoteCount: item.upvoteCount + (rev ? 1 : -1) };
      });

    setItems(optimistic);
    setKnownIssues(optimistic);

    try {
      await api.post<{ data: { voted: boolean } }>(`/feedback/${id}/vote`);
    } catch {
      setItems(revert);
      setKnownIssues(revert);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Submit idea
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!submitTitle.trim()) {
      setSubmitError("Please enter a title");
      return;
    }
    if (!submitBody.trim()) {
      setSubmitError("Please describe your idea");
      return;
    }
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      await api.post("/feedback/", {
        title: submitTitle.trim(),
        body: submitBody.trim(),
        category: submitCategory,
      });
      setShowSubmit(false);
      setSubmitTitle("");
      setSubmitBody("");
      setSubmitCategory("feature_request");
      // Reload so the new item appears
      setPage(1);
      loadFeedback();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit feedback");
    } finally {
      setSubmitLoading(false);
    }
  }, [submitTitle, submitBody, submitCategory, loadFeedback]);

  const handleCloseSubmit = useCallback(() => {
    setShowSubmit(false);
    setSubmitTitle("");
    setSubmitBody("");
    setSubmitCategory("feature_request");
    setSubmitError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Filter helpers
  // ---------------------------------------------------------------------------

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    setPage(1);
  };

  const handleSortChange = (val: string) => {
    setSort(val as SortOption);
    setPage(1);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <PageHeader
        title="Roadmap & Feedback"
        subtitle="Help shape MileClear — every suggestion is read and considered"
        action={
          <Button variant="primary" size="sm" onClick={() => setShowSubmit(true)}>
            + Share your idea
          </Button>
        }
      />

      {/* Community message */}
      <div className="feedback-banner">
        <div className="feedback-banner__content">
          <p className="feedback-banner__heading">Your voice builds this app</p>
          <p className="feedback-banner__text">
            MileClear is built for drivers, by listening to drivers. Every feature request, bug report, and suggestion
            is personally reviewed. Vote on ideas you want to see next, or share your own — the most popular
            ideas get prioritised on our roadmap.
          </p>
        </div>
      </div>

      {/* Filter row */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <div style={{ minWidth: 180 }}>
          <Select
            id="categoryFilter"
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            options={CATEGORY_OPTIONS}
          />
        </div>
        <div style={{ minWidth: 160 }}>
          <Select
            id="sortFilter"
            value={sort}
            onChange={(e) => handleSortChange(e.target.value)}
            options={SORT_OPTIONS}
          />
        </div>
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Known Issues */}
      {!loading && knownIssues.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.05em" }}>Known Issues</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
            {knownIssues.map((ki) => {
              const statusMeta = ki.knownIssueStatus ? KNOWN_ISSUE_STATUS_META[ki.knownIssueStatus] : null;
              return (
                <div
                  key={ki.id}
                  style={{
                    display: "flex",
                    gap: "1rem",
                    padding: "1rem 1.25rem",
                    background: "rgba(239, 68, 68, 0.04)",
                    border: "1px solid rgba(239, 68, 68, 0.12)",
                    borderRadius: "var(--r-md)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem", flexWrap: "wrap" }}>
                      {statusMeta && (
                        <span style={{
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          color: statusMeta.color,
                          background: statusMeta.color + "18",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "4px",
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                        }}>
                          {statusMeta.label}
                        </span>
                      )}
                      <span style={{ fontWeight: 600, fontSize: "0.9375rem", color: "var(--text-primary)" }}>{ki.title}</span>
                    </div>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                      {ki.body}
                    </p>
                    {ki.replies?.length > 0 && (
                      <div style={{
                        borderLeft: "2px solid var(--amber-400, #f5a623)",
                        background: "rgba(245, 166, 35, 0.05)",
                        borderRadius: "0 6px 6px 0",
                        padding: "0.5rem 0.75rem",
                        marginBottom: "0.5rem",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.125rem" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--amber-400, #f5a623)" stroke="none">
                            <path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 16.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z" />
                          </svg>
                          <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--amber-400, #f5a623)" }}>
                            {ki.replies[ki.replies.length - 1].adminName}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          {ki.replies[ki.replies.length - 1].body}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleVote(ki.id)}
                    aria-label={ki.hasVoted ? "Remove affected vote" : "Mark as affected"}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.25rem",
                      padding: "0.5rem",
                      borderRadius: "8px",
                      minWidth: "56px",
                      background: ki.hasVoted ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${ki.hasVoted ? "rgba(239,68,68,0.3)" : "var(--border-default)"}`,
                      color: ki.hasVoted ? "#ef4444" : "var(--text-muted)",
                      cursor: "pointer",
                      flexShrink: 0,
                      alignSelf: "flex-start",
                      transition: "all 0.15s",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0l4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7" />
                    </svg>
                    <span style={{ fontSize: "0.6875rem", fontWeight: 700 }}>{ki.hasVoted ? "Affected" : "Me too"}</span>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>{ki.upvoteCount}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feedback list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <LoadingSkeleton variant="card" count={5} style={{ height: 110 }} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
          title="No suggestions yet"
          description={
            category
              ? "Nothing here yet for this category. Try a different filter, or be the first to share."
              : "You could be the first! Tell us what would make MileClear better for you."
          }
          action={
            <Button variant="primary" size="sm" onClick={() => setShowSubmit(true)}>
              Share the first idea
            </Button>
          }
        />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {items.map((item) => (
              <FeedbackCard key={item.id} item={item} onVote={handleVote} />
            ))}
          </div>

          <div style={{ marginTop: "1.5rem" }}>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}

      {/* Submit idea modal */}
      <Modal
        open={showSubmit}
        onClose={handleCloseSubmit}
        title="Share your idea"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={handleCloseSubmit}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={submitLoading}
            >
              {submitLoading ? "Submitting..." : "Send feedback"}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 1.25rem" }}>
          Whether it&apos;s a feature you&apos;d love, a bug you&apos;ve hit, or something that could work better — we genuinely want to hear it. Every submission is personally reviewed.
        </p>

        {submitError && (
          <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
            {submitError}
          </div>
        )}

        <Select
          id="submitCategory"
          label="What kind of feedback?"
          value={submitCategory}
          onChange={(e) => setSubmitCategory(e.target.value as FeedbackCategory)}
          options={SUBMIT_CATEGORY_OPTIONS}
        />

        <Input
          id="submitTitle"
          label="Title"
          value={submitTitle}
          onChange={(e) => setSubmitTitle(e.target.value)}
          placeholder="e.g. Add weekly mileage summary email"
          maxLength={120}
        />

        <div className="form-group">
          <label htmlFor="submitBody" className="form-label">
            Tell us more
          </label>
          <textarea
            id="submitBody"
            className="form-input"
            rows={4}
            value={submitBody}
            onChange={(e) => setSubmitBody(e.target.value)}
            placeholder="What would this look like? What problem does it solve for you?"
            style={{ minHeight: "100px", resize: "vertical" }}
          />
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// FeedbackCard — extracted for readability
// ---------------------------------------------------------------------------

interface FeedbackCardProps {
  item: FeedbackItem;
  onVote: (id: string) => void;
}

function FeedbackCard({ item, onVote }: FeedbackCardProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        padding: "1.25rem",
        background: "var(--dash-card-bg)",
        border: "1px solid var(--dash-card-border)",
        borderRadius: "var(--r-md)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Upvote button */}
      <button
        onClick={() => onVote(item.id)}
        aria-label={item.hasVoted ? "Remove upvote" : "Upvote this idea"}
        aria-pressed={item.hasVoted}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.25rem",
          padding: "0.5rem",
          borderRadius: "8px",
          minWidth: "48px",
          background: item.hasVoted ? "var(--amber-glow)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${item.hasVoted ? "rgba(234,179,8,0.2)" : "var(--border-default)"}`,
          color: item.hasVoted ? "var(--amber-400)" : "var(--text-muted)",
          transition: "all 0.15s",
          cursor: "pointer",
          flexShrink: 0,
          alignSelf: "flex-start",
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
        <span style={{ fontSize: "0.8125rem", fontWeight: 700 }}>{item.upvoteCount}</span>
      </button>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: "0 0 0.375rem",
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: "var(--text-primary)",
            lineHeight: 1.4,
          }}
        >
          {item.title}
        </p>

        <p
          style={{
            margin: "0 0 0.75rem",
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            lineHeight: 1.55,
            display: item.replies?.length > 0 ? "block" : "-webkit-box",
            WebkitLineClamp: item.replies?.length > 0 ? undefined : 3,
            WebkitBoxOrient: item.replies?.length > 0 ? undefined : "vertical",
            overflow: item.replies?.length > 0 ? undefined : "hidden",
          }}
        >
          {item.body}
        </p>

        {/* Admin replies */}
        {item.replies?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
            {item.replies.map((r) => (
              <div
                key={r.id}
                style={{
                  borderLeft: "2px solid var(--amber-400, #f5a623)",
                  background: "rgba(245, 166, 35, 0.05)",
                  borderRadius: "0 6px 6px 0",
                  padding: "0.625rem 0.875rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.375rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--amber-400, #f5a623)" stroke="none">
                    <path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 16.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z" />
                  </svg>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--amber-400, #f5a623)" }}>
                    {r.adminName}
                  </span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-faint)", marginLeft: "auto" }}>
                    {timeAgo(r.createdAt)}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                  {r.body}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
          }}
        >
          <Badge variant="source">{CATEGORY_LABELS[item.category]}</Badge>
          <Badge variant={STATUS_BADGE_VARIANT[item.status]}>
            {STATUS_LABELS[item.status]}
          </Badge>
          <span
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-faint)",
              marginLeft: "0.25rem",
            }}
          >
            by {item.displayName}
          </span>
          <span
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-faint)",
            }}
          >
            &middot; {timeAgo(item.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
