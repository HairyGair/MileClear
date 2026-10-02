"use client";

// Who is waiting on a reply, oldest first. A feedback thread leaves the queue
// when an admin speaks last or its status closes; a missing-trip report
// leaves when a support reply or an admin-added trip follows it.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatReportedDate } from "@/lib/reportedDate";
import { Ago } from "@/components/admin/Ago";
import { Badge, DataTable, EmptyState, LoadState, LoadingSkeleton, Panel, type TableColumn } from "@/components/admin/ui";
import "./drivers.css";

export interface QueueItem {
  kind: "feedback" | "missing_trip";
  id: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  isPremium: boolean;
  at: string;
  ageHours: number;
  summary: string;
  /** Missing-trip reports only: the day the user said they drove. Null for
   *  reports filed before the date picker (16 Sep 2026). */
  reportedDate: string | null;
  status: string | null;
  replies: number;
  lastReplyBy: "admin" | "user" | null;
}

export interface QueueData {
  items: QueueItem[];
  counts: { feedbackOpen: number; missingTripsOpen: number; total: number };
  generatedAt: string;
}

export interface SupportQueueState {
  data: QueueData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function ageTone(hours: number): "good" | "warn" | "bad" {
  if (hours < 24) return "good";
  if (hours < 72) return "warn";
  return "bad";
}

const FEEDBACK_STATUS_WORDS: Record<string, string> = {
  new: "New",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  declined: "Declined",
};

/** Applies reports marked handled in this visit on top of the loaded queue,
 *  so the counts and the table drop them straight away. */
export function useHandledQueue(queue: SupportQueueState) {
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const data = useMemo<QueueData | null>(() => {
    if (!queue.data) return null;
    const items = queue.data.items.filter((i) => !(i.kind === "missing_trip" && handled.has(i.id)));
    const removed = queue.data.items.length - items.length;
    return {
      ...queue.data,
      items,
      counts: {
        ...queue.data.counts,
        missingTripsOpen: Math.max(0, queue.data.counts.missingTripsOpen - removed),
        total: Math.max(0, queue.data.counts.total - removed),
      },
    };
  }, [queue.data, handled]);
  const markLocal = useCallback((id: string) => setHandled((s) => new Set(s).add(id)), []);
  return { data, markLocal };
}

interface Props {
  queue: SupportQueueState;
  data: QueueData | null;
  onHandled: (reportId: string) => void;
}

export function SupportQueuePanel({ queue, data, onHandled }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Clear a missing-trip report by hand. Two kinds never clear on their own:
  // ones answered before reply-logging existed (11 of them on 12 Sep 2026), and
  // ones whose account has since been deleted, which come back as "(anonymous)"
  // with nobody left to answer. Sends nothing to the user.
  async function markHandled(reportId: string) {
    setBusyId(reportId);
    setActionError(null);
    try {
      await api.post(`/admin/support-queue/missing-trip/${reportId}/handled`);
      onHandled(reportId);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Could not mark it handled");
    } finally {
      setBusyId(null);
    }
  }

  const columns: TableColumn<QueueItem>[] = [
    {
      key: "kind",
      header: "Type",
      sortValue: (r) => r.kind,
      render: (r) => (
        <Badge tone={r.kind === "missing_trip" ? "warn" : "info"}>{r.kind === "missing_trip" ? "Missing trip" : "Feedback"}</Badge>
      ),
    },
    {
      key: "who",
      header: "Who",
      sortValue: (r) => (r.displayName ?? r.email ?? "").toLowerCase(),
      render: (r) => (
        <span className="adm-drv-nowrap">
          {r.userId ? (
            <Link className="adm-drv-link" href={`/dashboard/admin/users?user=${r.userId}`}>
              {r.displayName ?? r.email ?? "(unknown)"}
            </Link>
          ) : (
            <span className="adm-drv-strong">{r.displayName ?? "(anonymous)"}</span>
          )}
          {r.isPremium && (
            <>
              {" "}
              <Badge tone="accent">Pro</Badge>
            </>
          )}
          {r.displayName && r.email && <span className="adm-cell-sub">{r.email}</span>}
        </span>
      ),
    },
    {
      key: "summary",
      header: "What",
      // A missing-trip report leads with the day the user says they drove, so
      // nobody reads the note against the wrong day again (Adrian Bunn's
      // "To Peterborough" was 6 Aug, filed 14 Sep).
      render: (r) => (
        <div className="adm-drv-wrap">
          {r.kind === "missing_trip" && (
            <>
              <Badge tone={r.reportedDate ? "accent" : "warn"} title="The day they said they drove">
                Drove {formatReportedDate(r.reportedDate)}
              </Badge>{" "}
            </>
          )}
          {r.summary}
        </div>
      ),
    },
    {
      key: "age",
      header: "Waiting",
      numeric: true,
      sortValue: (r) => r.ageHours,
      title: "Under a day is fine, one to three days needs a look, over three days is late",
      render: (r) => (
        <Badge tone={ageTone(r.ageHours)} dot>
          <Ago iso={r.at} />
        </Badge>
      ),
    },
    {
      key: "state",
      header: "Thread",
      hideOnMobile: true,
      render: (r) =>
        r.kind === "feedback" ? (
          <span className="adm-drv-nowrap">
            {FEEDBACK_STATUS_WORDS[r.status ?? "new"] ?? r.status}
            <span className="adm-cell-sub">
              {r.replies ? `${r.replies} repl${r.replies === 1 ? "y" : "ies"}` : "No reply yet"}
            </span>
          </span>
        ) : (
          <span className="adm-drv-tone-muted">No reply logged</span>
        ),
    },
    {
      key: "actions",
      header: <span className="adm-sr">Actions</span>,
      align: "right",
      render: (r) =>
        r.kind === "missing_trip" ? (
          <button
            type="button"
            className="adm-btn adm-btn--sm"
            onClick={() => void markHandled(r.id)}
            disabled={busyId === r.id}
            title="Clear it from the queue. Sends nothing to the user."
            aria-label="Mark this missing-trip report handled"
          >
            {busyId === r.id ? "Marking..." : "Mark handled"}
          </button>
        ) : null,
    },
  ];

  return (
    <Panel
      highlight
      flush
      title="Waiting on a reply"
      subtitle="Feedback threads where the driver spoke last, and missing-trip reports with no support reply or admin-added trip after them. Oldest first."
      footer="Mark handled clears a missing-trip report from this queue only. It sends nothing to the driver."
    >
      {actionError && (
        <p className="adm-drv-alert" role="alert" style={{ margin: "var(--adm-s3) var(--adm-s4) 0" }}>
          Couldn&apos;t mark it handled: {actionError}
        </p>
      )}
      <LoadState
        data={data}
        loading={queue.loading}
        error={queue.error}
        onRetry={queue.reload}
        errorTitle="Couldn't load the support queue."
        skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={5} /></div>}
      >
        {(d) =>
          d.items.length === 0 ? (
            <EmptyState compact title="Nobody is waiting">Every feedback thread and missing-trip report has had a reply.</EmptyState>
          ) : (
            <DataTable
              caption="Drivers waiting on a reply, oldest first"
              columns={columns}
              rows={d.items}
              rowKey={(r) => `${r.kind}-${r.id}`}
              maxHeight={560}
            />
          )
        }
      </LoadState>
    </Panel>
  );
}
