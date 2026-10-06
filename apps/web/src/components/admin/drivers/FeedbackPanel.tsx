"use client";

// Every feedback thread, newest first, with status, known-issue flag, replies
// and delete. Open a thread to act on it.

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Ago } from "@/components/admin/Ago";
import {
  AdminIcon,
  Badge,
  EmptyState,
  ErrorState,
  FilterBar,
  FilterChip,
  LoadingSkeleton,
  Pager,
  Panel,
  SelectField,
  TextField,
  type Tone,
} from "@/components/admin/ui";
import "./drivers.css";

interface Reply {
  id: string;
  body: string;
  adminName: string;
  createdAt: string;
}

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
  replies: Reply[];
  /** What was built, shown on the public board and sent to the author. */
  shippedNote?: string | null;
  shippedAt?: string | null;
}

type ChipTone = "good" | "warn" | "bad" | "info" | undefined;

export const FEEDBACK_STATUSES: Array<{ value: string; label: string; tone: Tone; chip: ChipTone }> = [
  { value: "new", label: "New", tone: "neutral", chip: undefined },
  { value: "planned", label: "Planned", tone: "info", chip: "info" },
  { value: "in_progress", label: "In progress", tone: "accent", chip: undefined },
  { value: "done", label: "Done", tone: "good", chip: "good" },
  { value: "declined", label: "Declined", tone: "bad", chip: "bad" },
];

const KNOWN_ISSUE_STATUSES: Array<{ value: string; label: string; chip: ChipTone }> = [
  { value: "investigating", label: "Investigating", chip: "warn" },
  { value: "fix_in_progress", label: "Fix in progress", chip: "info" },
  { value: "fixed", label: "Fixed", chip: "good" },
];

const CATEGORY_LABELS: Record<string, string> = {
  feature_request: "Feature request",
  bug_report: "Bug report",
  improvement: "Improvement",
  other: "Other",
};

const STATUS_OPTIONS = [{ value: "", label: "All statuses" }, ...FEEDBACK_STATUSES.map((s) => ({ value: s.value, label: s.label }))];
const CATEGORY_OPTIONS = [{ value: "", label: "All categories" }, ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))];

interface Props {
  /** Called after anything that changes the status counts. */
  onChanged?: () => void;
}

export function FeedbackPanel({ onChanged }: Props) {
  const [items, setItems] = useState<FbItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20", sort: "newest" });
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      const res = await api.get<{ data: FbItem[]; totalPages: number }>(`/feedback/?${params}`);
      setItems(res.data);
      setTotalPages(res.totalPages);
      setLoaded(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Couldn't load feedback");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, categoryFilter]);

  // nonce lets "Try again" refetch with the same filters.
  useEffect(() => {
    void load();
  }, [load, nonce]);

  const fail = (what: string) => (err: unknown) =>
    setActionError(`${what}: ${err instanceof Error ? err.message : "something went wrong"}`);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    setActionError(null);
    try {
      await api.patch(`/feedback/${id}/status`, { status: newStatus });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)));
      onChanged?.();
    } catch (e) {
      fail("Couldn't change the status")(e);
    } finally {
      setUpdatingId(null);
    }
  };

  // Marking an idea done with a note puts it under "Built" on the public
  // board and tells the driver who asked (push + email, sent by the API).
  const handleShipped = async (item: FbItem) => {
    const note = (noteDrafts[item.id] ?? item.shippedNote ?? "").trim();
    if (!note) return;
    setSavingNoteId(item.id);
    setActionError(null);
    try {
      await api.patch(`/feedback/${item.id}/status`, { status: "done", shippedNote: note });
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, status: "done", shippedNote: note, shippedAt: i.shippedAt ?? new Date().toISOString() } : i
        )
      );
      setNoteDrafts((d) => {
        const next = { ...d };
        delete next[item.id];
        return next;
      });
      onChanged?.();
    } catch (e) {
      fail("Couldn't save what was built")(e);
    } finally {
      setSavingNoteId(null);
    }
  };

  const handleToggleKnownIssue = async (id: string, currentlyKnown: boolean) => {
    const newVal = !currentlyKnown;
    setActionError(null);
    try {
      await api.patch(`/feedback/${id}/known-issue`, { isKnownIssue: newVal, knownIssueStatus: newVal ? "investigating" : null });
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, isKnownIssue: newVal, knownIssueStatus: newVal ? "investigating" : null } : i))
      );
    } catch (e) {
      fail("Couldn't change the known-issue flag")(e);
    }
  };

  const handleKnownIssueStatus = async (id: string, status: string) => {
    setActionError(null);
    try {
      await api.patch(`/feedback/${id}/known-issue`, { isKnownIssue: true, knownIssueStatus: status });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isKnownIssue: true, knownIssueStatus: status } : i)));
    } catch (e) {
      fail("Couldn't change the known-issue status")(e);
    }
  };

  const handleSendReply = async (feedbackId: string) => {
    const body = replyText.trim();
    if (!body) return;
    setSendingReply(true);
    setActionError(null);
    try {
      const res = await api.post<{ data: Reply }>(`/feedback/${feedbackId}/reply`, { body });
      setItems((prev) =>
        prev.map((i) => (i.id === feedbackId ? { ...i, replyCount: i.replyCount + 1, replies: [...i.replies, res.data] } : i))
      );
      setReplyText("");
    } catch (e) {
      fail("Couldn't send the reply")(e);
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteReply = async (feedbackId: string, replyId: string) => {
    setActionError(null);
    try {
      await api.delete(`/feedback/reply/${replyId}`);
      setItems((prev) =>
        prev.map((i) =>
          i.id === feedbackId
            ? { ...i, replyCount: Math.max(0, i.replyCount - 1), replies: i.replies.filter((r) => r.id !== replyId) }
            : i
        )
      );
    } catch (e) {
      fail("Couldn't delete the reply")(e);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionError(null);
    try {
      await api.delete(`/feedback/${deleteId}`);
      setItems((prev) => prev.filter((i) => i.id !== deleteId));
      if (expandedId === deleteId) setExpandedId(null);
      onChanged?.();
    } catch (e) {
      fail("Couldn't delete the feedback")(e);
    } finally {
      setDeleteId(null);
    }
  };

  let body;
  if (error && !loaded) {
    body = <ErrorState compact title="Couldn't load the feedback threads." message={error} onRetry={() => setNonce((n) => n + 1)} />;
  } else if (loading && !loaded) {
    body = <LoadingSkeleton variant="table" rows={5} />;
  } else if (items.length === 0) {
    body = (
      <EmptyState compact title="No feedback matches">
        {statusFilter || categoryFilter ? "Try another status or category." : "Nobody has sent feedback yet."}
      </EmptyState>
    );
  } else {
    body = (
      <ul className={`adm-drv-threads${loading ? " adm-drv-dim" : ""}`} aria-busy={loading || undefined}>
        {items.map((item) => {
          const expanded = expandedId === item.id;
          const statusMeta = FEEDBACK_STATUSES.find((s) => s.value === item.status);
          const panelId = `fb-thread-${item.id}`;
          return (
            <li key={item.id} className={`adm-drv-thread${expanded ? " adm-drv-thread--open" : ""}`}>
              <button
                type="button"
                className="adm-drv-thread__head"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => {
                  setExpandedId(expanded ? null : item.id);
                  if (!expanded) setReplyText("");
                }}
              >
                <span className="adm-drv-thread__chev" aria-hidden="true">
                  <AdminIcon name="arrowRight" size={14} />
                </span>
                <span className="adm-drv-thread__main">
                  <span className="adm-drv-thread__title">{item.title}</span>
                  <span className="adm-drv-thread__meta">
                    {item.isKnownIssue && <Badge tone="bad">Known issue</Badge>}
                    <Badge>{CATEGORY_LABELS[item.category] ?? item.category}</Badge>
                    {statusMeta && <Badge tone={statusMeta.tone} dot>{statusMeta.label}</Badge>}
                    <span>by {item.displayName || "Anonymous"}</span>
                    <Ago iso={item.createdAt} />
                  </span>
                </span>
                <span className="adm-drv-thread__counts">
                  <span title="Votes">
                    <AdminIcon name="arrowUp" size={12} /> {item.upvoteCount}
                    <span className="adm-sr"> votes</span>
                  </span>
                  {item.replyCount > 0 && (
                    <span title="Replies" className="adm-drv-tone-good">
                      <AdminIcon name="comms" size={12} /> {item.replyCount}
                      <span className="adm-sr"> replies</span>
                    </span>
                  )}
                </span>
              </button>

              {expanded && (
                <div className="adm-drv-thread__body" id={panelId}>
                  <p className="adm-drv-thread__text">{item.body}</p>

                  <div className="adm-drv-group">
                    <p className="adm-drv-group__label">Status</p>
                    <div className="adm-drv-row" role="group" aria-label="Status">
                      {FEEDBACK_STATUSES.map((st) => (
                        <FilterChip
                          key={st.value}
                          active={item.status === st.value}
                          tone={st.chip}
                          disabled={updatingId === item.id}
                          onClick={() => void handleStatusChange(item.id, st.value)}
                        >
                          {st.label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  {item.category !== "bug_report" && (
                    <div className="adm-drv-group">
                      <p className="adm-drv-group__label">What we built</p>
                      <div className="adm-drv-compose">
                        <TextField
                          id={`shipped-${item.id}`}
                          label="One plain sentence on what was built"
                          placeholder="e.g. You can now mark a vehicle as one someone else pays for."
                          value={noteDrafts[item.id] ?? item.shippedNote ?? ""}
                          onChange={(v) => setNoteDrafts((d) => ({ ...d, [item.id]: v }))}
                          multiline
                          rows={2}
                        />
                        <button
                          type="button"
                          className="adm-btn adm-btn--primary"
                          onClick={() => void handleShipped(item)}
                          disabled={
                            savingNoteId === item.id ||
                            !(noteDrafts[item.id] ?? item.shippedNote ?? "").trim() ||
                            (item.status === "done" && (noteDrafts[item.id] ?? item.shippedNote ?? "").trim() === (item.shippedNote ?? "").trim())
                          }
                        >
                          {savingNoteId === item.id ? "Saving..." : item.status === "done" ? "Save note" : "Mark done and tell them"}
                        </button>
                      </div>
                      <p className="adm-drv-group__hint">
                        {item.status === "done"
                          ? "Shown under \"Built\" on the board."
                          : "Marks it done, shows it under \"Built\" on the board, and tells the driver who asked."}
                      </p>
                    </div>
                  )}

                  <div className="adm-drv-group">
                    <p className="adm-drv-group__label">Known issue</p>
                    <div className="adm-drv-row">
                      <FilterChip
                        active={item.isKnownIssue}
                        tone="bad"
                        onClick={() => void handleToggleKnownIssue(item.id, item.isKnownIssue)}
                        title="Known issues are shown to drivers in the app"
                      >
                        {item.isKnownIssue ? "Remove known issue" : "Mark as known issue"}
                      </FilterChip>
                    </div>
                    {item.isKnownIssue && (
                      <div className="adm-drv-row" role="group" aria-label="Known issue status">
                        {KNOWN_ISSUE_STATUSES.map((st) => (
                          <FilterChip
                            key={st.value}
                            active={item.knownIssueStatus === st.value}
                            tone={st.chip}
                            onClick={() => void handleKnownIssueStatus(item.id, st.value)}
                          >
                            {st.label}
                          </FilterChip>
                        ))}
                      </div>
                    )}
                  </div>

                  {item.replies.length > 0 && (
                    <div className="adm-drv-group">
                      <p className="adm-drv-group__label">Replies</p>
                      {item.replies.map((r) => (
                        <div key={r.id} className="adm-drv-reply">
                          <div className="adm-drv-reply__head">
                            <span className="adm-drv-reply__who">{r.adminName}</span>
                            <span className="adm-drv-reply__when"><Ago iso={r.createdAt} /></span>
                          </div>
                          <p className="adm-drv-reply__body">{r.body}</p>
                          <button
                            type="button"
                            className="adm-btn adm-btn--sm adm-drv-reply__del"
                            onClick={() => void handleDeleteReply(item.id, r.id)}
                            title="Delete reply"
                            aria-label={`Delete the reply from ${r.adminName}`}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="adm-drv-compose">
                    <TextField
                      id={`reply-${item.id}`}
                      label="Reply to this thread"
                      placeholder="Write a reply..."
                      value={replyText}
                      onChange={setReplyText}
                      multiline
                      rows={2}
                    />
                    <button
                      type="button"
                      className="adm-btn adm-btn--primary"
                      onClick={() => void handleSendReply(item.id)}
                      disabled={sendingReply || !replyText.trim()}
                    >
                      {sendingReply ? "Sending..." : "Reply"}
                    </button>
                  </div>

                  <div>
                    <button type="button" className="adm-btn adm-btn--sm adm-drv-btn-danger" onClick={() => setDeleteId(item.id)}>
                      Delete feedback
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Panel
      title="Feedback threads"
      subtitle="Every thread, newest first. Open one to change its status, flag it as a known issue, reply or delete it."
    >
      <FilterBar>
        <SelectField
          id="fb-status"
          label="Filter by status"
          value={statusFilter}
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={STATUS_OPTIONS}
          minWidth={160}
        />
        <SelectField
          id="fb-category"
          label="Filter by category"
          value={categoryFilter}
          onChange={(v) => {
            setCategoryFilter(v);
            setPage(1);
          }}
          options={CATEGORY_OPTIONS}
          minWidth={160}
        />
      </FilterBar>
      {actionError && <p className="adm-drv-alert" role="alert">{actionError}</p>}
      {error && loaded && <p className="adm-drv-alert" role="alert">Couldn&apos;t refresh the list: {error}</p>}
      {body}
      <Pager page={page} totalPages={totalPages} onChange={setPage} />

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete feedback"
        message="This will permanently delete this feedback and all its votes. This can't be undone."
        confirmLabel="Delete"
      />
    </Panel>
  );
}
