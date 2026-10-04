"use client";

// Inbox: every email sent to support@mileclear.com, read and answered here.
// Two panes on a wide screen; on a phone the list, then the thread with a
// Back button. The open thread lives in the URL (?t=<key>) so it can be linked.

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  AdminIcon,
  Badge,
  Dialog,
  EmptyState,
  FilterBar,
  LoadState,
  LoadingSkeleton,
  Notice,
  PageHeader,
  Panel,
  SearchField,
  Spinner,
  TabBar,
  TextArea,
  useAdminData,
} from "@/components/admin/ui";

type Status = "open" | "replied" | "closed" | "spam";
type Filter = Status | "all";

interface ThreadRow {
  threadKey: string;
  subject: string;
  contactEmail: string;
  contactName: string | null;
  status: Status;
  lastDirection: "in" | "out";
  lastAt: string;
  messageCount: number;
  user: { id: string; email: string; displayName: string | null; isPremium: boolean } | null;
}

interface ListData {
  counts: Record<Status, number>;
  threads: ThreadRow[];
}

interface Message {
  id: string;
  direction: "in" | "out";
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  subject: string;
  textBody: string | null;
  attachments: Array<{ filename: string; mimeType: string; size: number }> | null;
  isSpam: boolean;
  receivedAt: string;
}

interface ThreadData {
  threadKey: string;
  subject: string;
  contactEmail: string;
  status: Status;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    fullName: string | null;
    isPremium: boolean;
    createdAt: string;
    appVersion: string | null;
    buildNumber: string | null;
    tripCount: number;
  } | null;
  messages: Message[];
}

const STATUS_LABEL: Record<Status, string> = { open: "Open", replied: "Replied", closed: "Closed", spam: "Spam" };

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

function longDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Split a plain-text body into the new text and a trailing quoted run. */
function splitQuoted(body: string): { main: string; quoted: string } {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let cut = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const isOn = /^On .+wrote:?$/i.test(l) || (/^On .+/i.test(l) && /wrote:?$/i.test((lines[i + 1] ?? "").trim()));
    if (isOn || /^-{2,}\s*Original Message\s*-{2,}$/i.test(l)) {
      cut = i;
      break;
    }
  }
  if (cut === -1) {
    // A trailing run of ">" lines.
    let i = lines.length;
    while (i > 0 && (lines[i - 1].trim() === "" || lines[i - 1].trimStart().startsWith(">"))) i--;
    if (i < lines.length && lines.slice(i).some((l) => l.trimStart().startsWith(">"))) cut = i;
  }
  if (cut <= 0) return { main: body.trim(), quoted: "" };
  return { main: lines.slice(0, cut).join("\n").trim(), quoted: lines.slice(cut).join("\n").trim() };
}

function MessageBody({ body }: { body: string }) {
  const [show, setShow] = useState(false);
  const { main, quoted } = useMemo(() => splitQuoted(body), [body]);
  return (
    <>
      <div className="adm-inbox-text">{main || (quoted ? "" : "(no text)")}</div>
      {quoted && (
        <>
          <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" onClick={() => setShow((s) => !s)} aria-expanded={show}>
            {show ? "Hide quoted text" : "Show quoted text"}
          </button>
          {show && <div className="adm-inbox-text adm-inbox-text--quoted">{quoted}</div>}
        </>
      )}
    </>
  );
}

function MessageCard({ m }: { m: Message }) {
  const out = m.direction === "out";
  const who = out ? "You replied" : m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail;
  return (
    <article className={`adm-inbox-msg${out ? " adm-inbox-msg--out" : ""}`}>
      <header className="adm-inbox-msg__head">
        <strong>{who}</strong>
        <span className="adm-inbox-msg__date">{longDate(m.receivedAt)}</span>
      </header>
      {m.isSpam && <Badge tone="bad">Flagged as spam</Badge>}
      <MessageBody body={m.textBody ?? ""} />
      {m.attachments && m.attachments.length > 0 && (
        <div className="adm-inbox-attach">
          <ul>
            {m.attachments.map((a, i) => (
              <li key={`${a.filename}-${i}`}>
                {a.filename} <span className="adm-inbox-muted">({fileSize(a.size)})</span>
              </li>
            ))}
          </ul>
          <span className="adm-inbox-muted">Open in the mailbox to see attachments</span>
        </div>
      )}
    </article>
  );
}

function ThreadView({ threadKey, onBack, onChanged }: { threadKey: string; onBack: () => void; onChanged: () => void }) {
  const thread = useAdminData<ThreadData>(`/admin/support-inbox/thread?key=${encodeURIComponent(threadKey)}`);
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState(false);

  useEffect(() => {
    setText("");
    setError(null);
    setSentNote(false);
  }, [threadKey]);

  const keyParam = encodeURIComponent(threadKey);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await api.post(`/admin/support-inbox/reply?key=${keyParam}`, { text: text.trim() });
      setConfirming(false);
      setText("");
      setSentNote(true);
      thread.reload();
      onChanged();
    } catch (e) {
      setConfirming(false);
      setError(e instanceof Error ? e.message : "The reply could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const setStatus = async (status: Status) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/support-inbox/status?key=${keyParam}`, { status });
      thread.reload();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="adm-inbox-thread">
      <button type="button" className="adm-btn adm-btn--sm adm-inbox-back" onClick={onBack}>
        <AdminIcon name="arrowLeft" size={14} /> Back to the list
      </button>
      <LoadState
        data={thread.data}
        loading={thread.loading}
        error={thread.error}
        onRetry={thread.reload}
        errorTitle="Couldn't load this thread."
        skeleton={<LoadingSkeleton rows={6} />}
      >
        {(t) => (
          <>
            <Panel
              title={t.subject || "(no subject)"}
              subtitle={`${t.contactEmail} · ${STATUS_LABEL[t.status]}`}
              actions={
                <div className="adm-inbox-actions">
                  {t.status === "closed" || t.status === "spam" ? (
                    <button type="button" className="adm-btn adm-btn--sm" disabled={busy} onClick={() => setStatus("open")}>
                      Reopen
                    </button>
                  ) : (
                    <button type="button" className="adm-btn adm-btn--sm" disabled={busy} onClick={() => setStatus("closed")}>
                      Mark closed
                    </button>
                  )}
                  {t.status === "spam" ? (
                    <button type="button" className="adm-btn adm-btn--sm" disabled={busy} onClick={() => setStatus("open")}>
                      Not spam
                    </button>
                  ) : (
                    <button type="button" className="adm-btn adm-btn--sm" disabled={busy} onClick={() => setStatus("spam")}>
                      Mark as spam
                    </button>
                  )}
                </div>
              }
            >
              {t.user ? (
                <div className="adm-inbox-driver">
                  <div>
                    <strong>{t.user.fullName || t.user.displayName || t.user.email}</strong>{" "}
                    <Badge tone={t.user.isPremium ? "accent" : "neutral"}>{t.user.isPremium ? "Pro" : "Free"}</Badge>
                  </div>
                  <div className="adm-inbox-muted">{t.user.email}</div>
                  <div className="adm-inbox-muted">
                    Joined {longDate(t.user.createdAt).split(",")[0]}
                    {t.user.appVersion ? ` · App ${t.user.appVersion}${t.user.buildNumber ? ` (build ${t.user.buildNumber})` : ""}` : ""}
                    {` · ${t.user.tripCount.toLocaleString("en-GB")} trips`}
                  </div>
                  <Link href={`/dashboard/admin/users?user=${encodeURIComponent(t.user.id)}`} className="adm-btn adm-btn--sm">
                    Open driver <AdminIcon name="arrowRight" size={14} />
                  </Link>
                </div>
              ) : (
                <p className="adm-inbox-muted" style={{ margin: 0 }}>No MileClear account with this email</p>
              )}
            </Panel>

            <div className="adm-inbox-msgs">
              {t.messages.map((m) => (
                <MessageCard key={m.id} m={m} />
              ))}
            </div>

            <Panel title="Reply">
              {error && (
                <div style={{ marginBottom: "var(--adm-s3)" }}>
                  <Notice tone="bad" title="Not sent">{error}</Notice>
                </div>
              )}
              {sentNote && !error && (
                <div style={{ marginBottom: "var(--adm-s3)" }}>
                  <Notice tone="good">Reply sent.</Notice>
                </div>
              )}
              <TextArea
                label={`Reply to ${t.contactEmail}`}
                rows={6}
                value={text}
                disabled={sending}
                onChange={(e) => setText(e.target.value)}
                hint="Sent from gair@mileclear.com. Plain text."
              />
              <div style={{ marginTop: "var(--adm-s3)" }}>
                <button type="button" className="adm-btn adm-btn--primary" disabled={sending || !text.trim()} onClick={() => setConfirming(true)}>
                  Send reply
                </button>
              </div>
            </Panel>

            <Dialog
              open={confirming}
              onClose={() => setConfirming(false)}
              busy={sending}
              title="Send this reply?"
              footer={
                <>
                  <button type="button" className="adm-btn" onClick={() => setConfirming(false)} disabled={sending}>
                    Cancel
                  </button>
                  <button type="button" className="adm-btn adm-btn--primary" onClick={send} disabled={sending}>
                    {sending ? <Spinner label="Sending" /> : null} Send
                  </button>
                </>
              }
            >
              <p style={{ margin: 0 }}>Send this reply to {t.contactEmail}? It goes out as a real email.</p>
            </Dialog>
          </>
        )}
      </LoadState>
    </div>
  );
}

function InboxInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selected = searchParams?.get("t") ?? null;
  const [filter, setFilter] = useState<Filter>("open");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const listPath = useMemo(() => {
    const p = new URLSearchParams({ status: filter, limit: "100" });
    if (q) p.set("q", q);
    return `/admin/support-inbox?${p}`;
  }, [filter, q]);
  const list = useAdminData<ListData>(listPath);

  const select = useCallback(
    (key: string | null) => {
      router.replace(key ? `/dashboard/admin/inbox?t=${encodeURIComponent(key)}` : "/dashboard/admin/inbox", { scroll: false });
    },
    [router]
  );

  const counts = list.data?.counts;
  const all = counts ? counts.open + counts.replied + counts.closed + counts.spam : undefined;
  const tabs = [
    { id: "open", label: "Open", count: counts?.open },
    { id: "replied", label: "Replied", count: counts?.replied },
    { id: "closed", label: "Closed", count: counts?.closed },
    { id: "spam", label: "Spam", count: counts?.spam },
    { id: "all", label: "All", count: all },
  ];

  return (
    <>
      <PageHeader title="Inbox" subtitle="Every email to support@mileclear.com. Replies go from gair@ and come back here." />
      <div className={`adm-inbox${selected ? " adm-inbox--reading" : ""}`}>
        <div className="adm-inbox-list">
          <TabBar tabs={tabs} value={filter} onChange={(id) => setFilter(id as Filter)} label="Filter by status" size="sm" />
          <FilterBar>
            <SearchField id="inbox-search" label="Search the inbox" placeholder="Search name, email or subject" value={search} onChange={setSearch} />
          </FilterBar>
          <LoadState
            data={list.data}
            loading={list.loading}
            error={list.error}
            onRetry={list.reload}
            errorTitle="Couldn't load the inbox."
            skeleton={<LoadingSkeleton rows={8} />}
          >
            {(d) =>
              d.threads.length === 0 ? (
                <EmptyState title="Nothing here" compact>
                  {q ? "No threads match that search." : "No threads with this status."}
                </EmptyState>
              ) : (
                <ul className="adm-inbox-rows">
                  {d.threads.map((t) => {
                    const waiting = t.status === "open" && t.lastDirection === "in";
                    return (
                      <li key={t.threadKey}>
                        <button
                          type="button"
                          className={`adm-inbox-row${selected === t.threadKey ? " adm-inbox-row--active" : ""}${waiting ? " adm-inbox-row--waiting" : ""}`}
                          onClick={() => select(t.threadKey)}
                          aria-current={selected === t.threadKey ? "true" : undefined}
                        >
                          <span className="adm-inbox-row__top">
                            {waiting && <span className="adm-inbox-dot" role="img" aria-label="Waiting on us" />}
                            <span className="adm-inbox-row__who">{t.contactName || t.contactEmail}</span>
                            <span className="adm-inbox-row__date">{shortDate(t.lastAt)}</span>
                          </span>
                          <span className="adm-inbox-row__subject">{t.subject || "(no subject)"}</span>
                          <span className="adm-inbox-row__meta">
                            {t.user && <Badge tone={t.user.isPremium ? "accent" : "info"}>{t.user.isPremium ? "Pro" : "Driver"}</Badge>}
                            {filter === "all" && <Badge>{STATUS_LABEL[t.status]}</Badge>}
                            <span className="adm-inbox-muted">
                              {t.messageCount} {t.messageCount === 1 ? "message" : "messages"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            }
          </LoadState>
        </div>
        <div className="adm-inbox-pane">
          {selected ? (
            <ThreadView key={selected} threadKey={selected} onBack={() => select(null)} onChanged={list.reload} />
          ) : (
            <EmptyState title="Pick a thread" icon="inbox">Choose an email on the left to read it and reply.</EmptyState>
          )}
        </div>
      </div>
    </>
  );
}

export default function AdminInboxPage() {
  return (
    <Suspense fallback={<LoadingSkeleton variant="table" rows={8} />}>
      <InboxInner />
    </Suspense>
  );
}
