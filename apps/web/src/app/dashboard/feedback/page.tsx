"use client";

// Feedback (redesigned 6 Oct 2026, docs/feedback-redesign-oct2026.md).
// Problems are private: "Something's not right" starts a conversation with
// us that only this driver can see. Ideas are public, but the board shows
// what we've picked up and built ("You asked, we built"), not vote counts.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FeedbackBoard,
  FeedbackItem,
  FeedbackShipped,
  FeedbackStatus,
  SupportThreadDetail,
  SupportThreadSummary,
} from "@mileclear/shared";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Modal } from "../../../components/ui/Modal";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import { AuthImageRow } from "../../../components/support/AuthImage";
import {
  MAX_SCREENSHOTS,
  readScreenshots,
  toUploads,
  type PickedScreenshot,
} from "../../../components/support/screenshots";

type BoardItem = FeedbackItem & FeedbackShipped;

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Waiting for a look",
  planned: "On the list",
  in_progress: "Being built",
  done: "Built",
  declined: "Not for now",
};

type BadgeVariant = "source" | "business" | "primary" | "success" | "danger";

const STATUS_BADGE: Record<FeedbackStatus, BadgeVariant> = {
  new: "source",
  planned: "business",
  in_progress: "primary",
  done: "success",
  declined: "danger",
};

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// ---------------------------------------------------------------------------
// Screenshot picker (shared by the report form and thread replies)
// ---------------------------------------------------------------------------

function ScreenshotPicker({
  shots,
  onChange,
  onProblem,
  disabled,
}: {
  shots: PickedScreenshot[];
  onChange: (next: PickedScreenshot[]) => void;
  onProblem: (msg: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { picked, problem } = await readScreenshots(files, shots.length);
    onChange([...shots, ...picked]);
    onProblem(problem);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="fbk-shots">
      {shots.map((s, i) => (
        <div key={`${s.name}-${i}`} className="fbk-shots__item">
          <img src={s.preview} alt={`Screenshot ${i + 1}`} />
          <button
            type="button"
            className="fbk-shots__remove"
            onClick={() => onChange(shots.filter((_, j) => j !== i))}
            aria-label={`Remove screenshot ${i + 1}`}
            disabled={disabled}
          >
            ×
          </button>
        </div>
      ))}
      {shots.length < MAX_SCREENSHOTS && (
        <label className={`fbk-shots__add${disabled ? " fbk-shots__add--disabled" : ""}`}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            disabled={disabled}
            onChange={(e) => void onFiles(e.target.files)}
          />
          + Add a screenshot
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeedbackPage() {
  const [board, setBoard] = useState<FeedbackBoard | null>(null);
  const [threads, setThreads] = useState<SupportThreadSummary[] | null>(null);
  const [knownIssues, setKnownIssues] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showReport, setShowReport] = useState(false);
  const [showIdea, setShowIdea] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, t, ki] = await Promise.all([
        api.get<{ data: FeedbackBoard }>("/feedback/board"),
        api.get<{ data: SupportThreadSummary[] }>("/support/threads"),
        api.get<{ data: FeedbackItem[] }>("/feedback/known-issues").catch(() => ({ data: [] as FeedbackItem[] })),
      ]);
      setBoard(b.data);
      setThreads(t.data);
      setKnownIssues(ki.data.filter((k) => k.knownIssueStatus !== "fixed"));
    } catch (err) {
      setError(errorText(err, "Couldn't load this page. Try again in a moment."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = threads?.filter((t) => t.unread).length ?? 0;

  return (
    <>
      <PageHeader
        title="Feedback"
        subtitle="Tell us what's not working, or what would make MileClear better. Every message is read by a person."
      />

      <div className="fbk-actions">
        <button type="button" className="fbk-action" onClick={() => setShowReport(true)}>
          <span className="fbk-action__title">Something&apos;s not right</span>
          <span className="fbk-action__text">
            A missing trip, a wrong figure, something broken. Private: only you and the MileClear team see it.
          </span>
        </button>
        <button type="button" className="fbk-action" onClick={() => setShowIdea(true)}>
          <span className="fbk-action__title">Suggest an idea</span>
          <span className="fbk-action__text">
            Something you&apos;d like MileClear to do. If we pick it up, it shows on the board below and we&apos;ll tell you when it&apos;s built.
          </span>
        </button>
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}{" "}
          <button type="button" className="fbk-link" onClick={() => { setLoading(true); void load(); }}>
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="card" count={3} style={{ height: 120 }} />
      ) : (
        <>
          {/* Your messages */}
          <section className="fbk-section">
            <h2 className="fbk-section__title">
              Your messages {unread > 0 && <Badge variant="warning">{unread} new {unread === 1 ? "reply" : "replies"}</Badge>}
            </h2>
            {!threads || threads.length === 0 ? (
              <p className="fbk-muted">
                Nothing yet. When you report a problem, the conversation with us shows here.
              </p>
            ) : (
              <ul className="fbk-threads">
                {threads.map((t) => (
                  <li key={t.threadKey}>
                    <button
                      type="button"
                      className={`fbk-thread${t.unread ? " fbk-thread--unread" : ""}`}
                      onClick={() => setOpenThread(t.threadKey)}
                    >
                      {t.unread && <span className="fbk-dot" role="img" aria-label="New reply" />}
                      <span className="fbk-thread__subject">{t.subject || "(no subject)"}</span>
                      <span className="fbk-thread__meta">
                        {t.lastDirection === "out" ? "MileClear replied" : "Waiting for us"} · {shortDate(t.lastAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {knownIssues.length > 0 && (
            <section className="fbk-section">
              <h2 className="fbk-section__title">Problems we know about</h2>
              <ul className="fbk-list">
                {knownIssues.map((k) => (
                  <li key={k.id} className="fbk-card fbk-card--issue">
                    <p className="fbk-card__title">{k.title}</p>
                    <p className="fbk-card__body">{k.body}</p>
                    {k.replies?.length > 0 && (
                      <p className="fbk-card__note">{k.replies[k.replies.length - 1].body}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* You asked, we built */}
          <section className="fbk-section">
            <h2 className="fbk-section__title">You asked, we built</h2>
            {board && board.onTheList.length === 0 && board.built.length === 0 ? (
              <p className="fbk-muted">Ideas we pick up will show here, and the ones we&apos;ve built.</p>
            ) : (
              <div className="fbk-board">
                {board && board.onTheList.length > 0 && (
                  <div>
                    <h3 className="fbk-board__heading">On the list</h3>
                    <ul className="fbk-list">
                      {board.onTheList.map((item) => (
                        <IdeaCard key={item.id} item={item} />
                      ))}
                    </ul>
                  </div>
                )}
                {board && board.built.length > 0 && (
                  <div>
                    <h3 className="fbk-board__heading">Built</h3>
                    <ul className="fbk-list">
                      {board.built.map((item) => (
                        <IdeaCard key={item.id} item={item} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Your ideas */}
          {board && board.mine.length > 0 && (
            <section className="fbk-section">
              <h2 className="fbk-section__title">Your ideas</h2>
              <ul className="fbk-list">
                {board.mine.map((item) => (
                  <IdeaCard key={item.id} item={item} showReplies />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        onSent={(threadKey) => {
          setShowReport(false);
          void load();
          setOpenThread(threadKey);
        }}
      />
      <IdeaModal
        open={showIdea}
        onClose={() => setShowIdea(false)}
        onSent={() => {
          setShowIdea(false);
          void load();
        }}
      />
      <ThreadModal
        threadKey={openThread}
        onClose={() => {
          setOpenThread(null);
          void load();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Idea card (public board and "Your ideas")
// ---------------------------------------------------------------------------

function IdeaCard({ item, showReplies = false }: { item: BoardItem; showReplies?: boolean }) {
  const built = item.status === "done";
  return (
    <li className={`fbk-card${built ? " fbk-card--built" : ""}`}>
      <div className="fbk-card__top">
        <p className="fbk-card__title">{item.title}</p>
        <Badge variant={STATUS_BADGE[item.status]}>{STATUS_LABELS[item.status]}</Badge>
      </div>
      {built && item.shippedNote ? (
        <p className="fbk-card__note">
          {item.shippedNote}
          {item.shippedAt && <span className="fbk-muted"> · {shortDate(item.shippedAt)}</span>}
        </p>
      ) : (
        <p className="fbk-card__body">{item.body}</p>
      )}
      {showReplies &&
        item.replies?.map((r) => (
          <p key={r.id} className="fbk-card__note">
            <strong>{r.adminName}:</strong> {r.body}
          </p>
        ))}
      <p className="fbk-card__meta">
        {item.isOwner ? "Your idea" : `From ${item.displayName || "a driver"}`} · {shortDate(item.createdAt)}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Report a problem (private)
// ---------------------------------------------------------------------------

function ReportModal({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  onSent: (threadKey: string) => void;
}) {
  const [body, setBody] = useState("");
  const [shots, setShots] = useState<PickedScreenshot[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shotProblem, setShotProblem] = useState<string | null>(null);

  const reset = () => {
    setBody("");
    setShots([]);
    setError(null);
    setShotProblem(null);
  };

  const close = () => {
    if (sending) return;
    reset();
    onClose();
  };

  const send = async () => {
    if (!body.trim()) {
      setError("Tell us what happened first.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ data: { threadKey: string } }>("/support/report", {
        body: body.trim(),
        screenshots: shots.length ? toUploads(shots) : undefined,
      });
      reset();
      onSent(res.data.threadKey);
    } catch (err) {
      setError(errorText(err, "Couldn't send that. Try again in a moment."));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Something's not right"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close} disabled={sending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void send()} disabled={sending || !body.trim()}>
            {sending ? "Sending..." : "Send to MileClear"}
          </Button>
        </>
      }
    >
      <p className="fbk-modal-intro">
        This goes privately to the MileClear team, not on the public board. We&apos;ll include your phone&apos;s
        latest app details and your recent trips so we can help faster, and we&apos;ll reply here and by email.
      </p>
      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      <div className="form-group">
        <label htmlFor="reportBody" className="form-label">
          What happened?
        </label>
        <textarea
          id="reportBody"
          className="form-input"
          rows={6}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="When was it, and what were you doing? For a missing trip, roughly where from and to."
          style={{ minHeight: "140px", resize: "vertical" }}
          disabled={sending}
        />
      </div>
      <div className="form-group">
        <span className="form-label">Screenshots (optional, up to {MAX_SCREENSHOTS})</span>
        <ScreenshotPicker shots={shots} onChange={setShots} onProblem={setShotProblem} disabled={sending} />
        {shotProblem && <p className="fbk-warn">{shotProblem}</p>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Suggest an idea (public)
// ---------------------------------------------------------------------------

function IdeaModal({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (sending) return;
    setTitle("");
    setBody("");
    setError(null);
    onClose();
  };

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      setError("Give your idea a title and a few words about it.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.post("/feedback/", { title: title.trim(), body: body.trim(), category: "feature_request" });
      setTitle("");
      setBody("");
      onSent();
    } catch (err) {
      setError(errorText(err, "Couldn't send your idea. Try again in a moment."));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Suggest an idea"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close} disabled={sending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void send()} disabled={sending}>
            {sending ? "Sending..." : "Send idea"}
          </Button>
        </>
      }
    >
      <p className="fbk-modal-intro">
        Every idea is read. If we pick it up it goes on the board, and we&apos;ll tell you when it&apos;s built.
        Something not working? Use &quot;Something&apos;s not right&quot; instead, so it stays private.
      </p>
      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      <Input
        id="ideaTitle"
        label="Your idea in a few words"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Show fuel cost per trip"
        maxLength={120}
      />
      <div className="form-group">
        <label htmlFor="ideaBody" className="form-label">
          Tell us more
        </label>
        <textarea
          id="ideaBody"
          className="form-input"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What would it do, and how would it help you?"
          style={{ minHeight: "100px", resize: "vertical" }}
          disabled={sending}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// A conversation with MileClear
// ---------------------------------------------------------------------------

function ThreadModal({ threadKey, onClose }: { threadKey: string | null; onClose: () => void }) {
  const [thread, setThread] = useState<SupportThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [shots, setShots] = useState<PickedScreenshot[]>([]);
  const [shotProblem, setShotProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: SupportThreadDetail }>(`/support/threads/${encodeURIComponent(key)}`);
      setThread(res.data);
    } catch (err) {
      setError(errorText(err, "Couldn't load this conversation."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setThread(null);
    setReply("");
    setShots([]);
    setShotProblem(null);
    if (threadKey) void load(threadKey);
  }, [threadKey, load]);

  const send = async () => {
    if (!threadKey || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.post(`/support/threads/${encodeURIComponent(threadKey)}/reply`, {
        body: reply.trim(),
        screenshots: shots.length ? toUploads(shots) : undefined,
      });
      setReply("");
      setShots([]);
      setShotProblem(null);
      await load(threadKey);
    } catch (err) {
      setError(errorText(err, "Couldn't send your reply. Try again in a moment."));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={!!threadKey}
      onClose={() => {
        if (!sending) onClose();
      }}
      title={thread?.subject || "Your message"}
      large
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={sending}>
            Close
          </Button>
          <Button variant="primary" size="sm" onClick={() => void send()} disabled={sending || !reply.trim()}>
            {sending ? "Sending..." : "Send reply"}
          </Button>
        </>
      }
    >
      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {loading && !thread ? (
        <LoadingSkeleton variant="card" count={2} style={{ height: 80 }} />
      ) : thread ? (
        <div className="fbk-convo">
          {thread.messages.map((m) => (
            <div key={m.id} className={`fbk-msg${m.direction === "in" ? " fbk-msg--mine" : ""}`}>
              <div className="fbk-msg__head">
                <strong>{m.direction === "in" ? "You" : m.fromName || "MileClear"}</strong>
                <span>{shortDate(m.at)}</span>
              </div>
              <p className="fbk-msg__body">{m.body}</p>
              <AuthImageRow paths={m.attachments.map((a) => `/support/attachments/${encodeURIComponent(a.id)}`)} />
            </div>
          ))}
          {thread.messages.every((m) => m.direction === "in") && (
            <p className="fbk-muted">Thanks, we&apos;ve got it. We&apos;ll reply here and by email.</p>
          )}
        </div>
      ) : null}

      {thread && (
        <div className="fbk-reply">
          <label htmlFor="threadReply" className="form-label">
            Reply
          </label>
          <textarea
            id="threadReply"
            className="form-input"
            rows={3}
            maxLength={4000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Add anything else, or answer our question"
            style={{ resize: "vertical" }}
            disabled={sending}
          />
          <ScreenshotPicker shots={shots} onChange={setShots} onProblem={setShotProblem} disabled={sending} />
          {shotProblem && <p className="fbk-warn">{shotProblem}</p>}
        </div>
      )}
    </Modal>
  );
}
