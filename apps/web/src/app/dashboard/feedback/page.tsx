"use client";

// Feedback (redesigned 6 Oct 2026, docs/feedback-redesign-oct2026.md), on the new kit.
// Problems are private: they start a conversation only this driver and the team see.
// Ideas are public, but the board shows what we've picked up and built, not vote counts.

import { useState } from "react";
import type { FeedbackBoard, FeedbackItem, FeedbackShipped, FeedbackStatus, SupportThreadSummary } from "@mileclear/shared";
import {
  Button,
  CardError,
  EmptyState,
  PageHeader,
  SectionHeader,
  Skeleton,
  StatusChip,
  useData,
  useToast,
} from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { TellUsDialog } from "./TellUsDialog";
import { ThreadDialog } from "./ThreadDialog";
import { shortDate } from "./shortDate";
import styles from "./feedback.module.css";

type BoardItem = FeedbackItem & FeedbackShipped;

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Waiting for a look",
  planned: "On the list",
  in_progress: "Being built",
  done: "Built",
  declined: "Not for now",
};

const STATUS_TONE: Record<FeedbackStatus, "neutral" | "amber" | "green" | "red"> = {
  new: "neutral",
  planned: "amber",
  in_progress: "amber",
  done: "green",
  declined: "neutral",
};

function IdeaCard({ item, showReplies = false }: { item: BoardItem; showReplies?: boolean }) {
  const built = item.status === "done";
  return (
    <li className={styles.item}>
      <div className={styles.itemTop}>
        <p className={styles.itemTitle}>{item.title}</p>
        <StatusChip tone={STATUS_TONE[item.status]} label={STATUS_LABELS[item.status]} />
      </div>
      {built && item.shippedNote ? (
        <p className={styles.note}>
          {item.shippedNote}
          {item.shippedAt && <span className={styles.meta}> · {shortDate(item.shippedAt)}</span>}
        </p>
      ) : (
        <p className={styles.itemBody}>{item.body}</p>
      )}
      {showReplies &&
        item.replies?.map((r) => (
          <p key={r.id} className={styles.note}>
            <strong>{r.adminName}:</strong> {r.body}
          </p>
        ))}
      <p className={styles.meta}>
        {item.isOwner ? "Your idea" : `From ${item.displayName || "a driver"}`} · {shortDate(item.createdAt)}
      </p>
    </li>
  );
}

export default function FeedbackPage() {
  const { show } = useToast();
  const board = useData<FeedbackBoard>("feedback-board", async () => (await api.get<{ data: FeedbackBoard }>("/feedback/board")).data);
  const threads = useData<SupportThreadSummary[]>("support-threads", async () => (await api.get<{ data: SupportThreadSummary[] }>("/support/threads")).data);
  const known = useData<FeedbackItem[]>("feedback-known", async () => {
    try {
      return (await api.get<{ data: FeedbackItem[] }>("/feedback/known-issues")).data.filter((k) => k.knownIssueStatus !== "fixed");
    } catch {
      return [];
    }
  });

  const [tellOpen, setTellOpen] = useState(false);
  const [openThread, setOpenThread] = useState<string | null>(null);

  const unread = threads.data?.filter((t) => t.unread).length ?? 0;
  const b = board.data;

  return (
    <>
      <PageHeader
        title="Feedback"
        back={{ href: "/dashboard/more", label: "More" }}
        primary={<Button variant="primary" onClick={() => setTellOpen(true)}>Tell us something</Button>}
      >
        Tell us what&apos;s not working, or what would make MileClear better. Every message is read by a person.
      </PageHeader>

      <div className={styles.page}>
        <section className={styles.section} aria-label="Your messages">
          <SectionHeader title="Your messages" subtitle={unread > 0 ? `${unread} new ${unread === 1 ? "reply" : "replies"}` : undefined} />
          {threads.loading && !threads.data ? (
            <Skeleton variant="row" count={2} />
          ) : threads.error && !threads.data ? (
            <CardError onRetry={threads.reload} />
          ) : !threads.data || threads.data.length === 0 ? (
            <p className={styles.muted}>Nothing yet. When you report a problem, the conversation with us shows here.</p>
          ) : (
            <div className="mc-card mc-card--flush mc-list">
              {threads.data.map((t) => (
                <button key={t.threadKey} type="button" className="mc-list__row mc-list__row--click" onClick={() => setOpenThread(t.threadKey)}>
                  <span className="mc-list__main">
                    <span className={styles.row}>
                      {t.unread && <span className={styles.dot} role="img" aria-label="New reply" />}
                      <span className="mc-list__primary">{t.subject || "(no subject)"}</span>
                    </span>
                    <span className="mc-list__secondary">
                      {t.lastDirection === "out" ? "MileClear replied" : "Waiting for us"} · {shortDate(t.lastAt)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {known.data && known.data.length > 0 && (
          <section className={styles.section} aria-label="Problems we know about">
            <SectionHeader title="Problems we know about" />
            <ul className={styles.cards}>
              {known.data.map((k) => (
                <li key={k.id} className={styles.item}>
                  <p className={styles.itemTitle}>{k.title}</p>
                  <p className={styles.itemBody}>{k.body}</p>
                  {k.replies?.length > 0 && <p className={styles.note}>{k.replies[k.replies.length - 1].body}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.section} aria-label="You asked, we built">
          <SectionHeader title="You asked, we built" />
          {board.loading && !b ? (
            <Skeleton variant="card" count={2} />
          ) : board.error && !b ? (
            <CardError onRetry={board.reload} />
          ) : b && b.onTheList.length === 0 && b.built.length === 0 ? (
            <EmptyState size="card" icon="bulb-outline" title="Nothing on the board yet" body="Ideas we pick up will show here, and the ones we've built." />
          ) : b ? (
            <>
              {b.onTheList.length > 0 && (
                <>
                  <h3 className={styles.sub}>On the list</h3>
                  <ul className={styles.cards}>{b.onTheList.map((i) => <IdeaCard key={i.id} item={i} />)}</ul>
                </>
              )}
              {b.built.length > 0 && (
                <>
                  <h3 className={styles.sub}>Built</h3>
                  <ul className={styles.cards}>{b.built.map((i) => <IdeaCard key={i.id} item={i} />)}</ul>
                </>
              )}
            </>
          ) : null}
        </section>

        {b && b.mine.length > 0 && (
          <section className={styles.section} aria-label="Your ideas">
            <SectionHeader title="Your ideas" />
            <ul className={styles.cards}>{b.mine.map((i) => <IdeaCard key={i.id} item={i} showReplies />)}</ul>
          </section>
        )}
      </div>

      <TellUsDialog
        open={tellOpen}
        onClose={() => setTellOpen(false)}
        onReported={(key) => {
          setTellOpen(false);
          threads.reload();
          setOpenThread(key);
        }}
        onIdea={() => {
          setTellOpen(false);
          board.reload();
          show("Thanks, we've got your idea");
        }}
      />
      <ThreadDialog
        threadKey={openThread}
        onClose={() => {
          setOpenThread(null);
          threads.reload();
        }}
      />
    </>
  );
}
