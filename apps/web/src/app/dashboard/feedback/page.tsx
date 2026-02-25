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
type SortOption = "newest" | "most_voted";

interface FeedbackItem {
  id: string;
  displayName: string;
  title: string;
  body: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  upvoteCount: number;
  createdAt: string;
  hasVoted: boolean;
  isOwner: boolean;
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
      const res = await api.get<FeedbackResponse>(`/feedback/?${params}`);
      setItems(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
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
    // Optimistically update UI
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const willVote = !item.hasVoted;
        return {
          ...item,
          hasVoted: willVote,
          upvoteCount: item.upvoteCount + (willVote ? 1 : -1),
        };
      })
    );

    try {
      await api.post<{ data: { voted: boolean } }>(`/feedback/${id}/vote`);
    } catch {
      // Revert on error
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const revert = !item.hasVoted;
          return {
            ...item,
            hasVoted: revert,
            upvoteCount: item.upvoteCount + (revert ? 1 : -1),
          };
        })
      );
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
        title="Feedback"
        subtitle="Share ideas and vote on features"
        action={
          <Button variant="primary" size="sm" onClick={() => setShowSubmit(true)}>
            + Submit idea
          </Button>
        }
      />

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
          title="No feedback yet"
          description={
            category
              ? "No feedback found for this category. Try a different filter or be the first to submit."
              : "Be the first to share an idea or report a bug."
          }
          action={
            <Button variant="primary" size="sm" onClick={() => setShowSubmit(true)}>
              Submit the first idea
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
        title="Submit an idea"
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
              {submitLoading ? "Submitting..." : "Submit idea"}
            </Button>
          </>
        }
      >
        {submitError && (
          <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
            {submitError}
          </div>
        )}

        <Input
          id="submitTitle"
          label="Title"
          value={submitTitle}
          onChange={(e) => setSubmitTitle(e.target.value)}
          placeholder="Short summary of your idea or issue"
          maxLength={120}
        />

        <div className="form-group">
          <label htmlFor="submitBody" className="form-label">
            Description
          </label>
          <textarea
            id="submitBody"
            className="form-input"
            rows={4}
            value={submitBody}
            onChange={(e) => setSubmitBody(e.target.value)}
            placeholder="Describe your idea or the bug you've encountered in detail"
            style={{ minHeight: "100px", resize: "vertical" }}
          />
        </div>

        <Select
          id="submitCategory"
          label="Category"
          value={submitCategory}
          onChange={(e) => setSubmitCategory(e.target.value as FeedbackCategory)}
          options={SUBMIT_CATEGORY_OPTIONS}
        />
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
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.body}
        </p>

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
