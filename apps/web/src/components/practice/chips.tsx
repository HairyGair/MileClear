"use client";

import { StatusChip } from "../dashboard/kit";
import { dayMonth, type PracticeRequestRow, type UpdateState, type WaitingState } from "../../lib/practice";

/** The "Quarterly update" cell (SPEC-VISUAL 5.2). */
export function UpdateChip({ update }: { update: UpdateState }) {
  switch (update.state) {
    case "sent":
      return <StatusChip tone="green" icon="checkmark" label={`Sent ${dayMonth(update.sentAt)}`} />;
    case "not_using_mtd":
      return <span className="pc-muted">Not using MTD</span>;
    case "not_due":
      return <StatusChip tone="neutral" label="Not due yet" />;
    case "overdue":
      return <StatusChip tone="amber" icon="alert-circle-outline" label={`Not sent, was due ${dayMonth(update.due)}`} />;
    case "due":
      return update.daysLeft <= 14 ? (
        <StatusChip tone="amber" icon="time-outline" label={update.daysLeft <= 0 ? "Due today" : `Due in ${update.daysLeft} day${update.daysLeft === 1 ? "" : "s"}`} />
      ) : (
        <StatusChip tone="neutral" icon="calendar-outline" label={`Due ${dayMonth(update.due)}`} />
      );
  }
}

export function WaitingChip({ state }: { state: WaitingState; name?: string | null }) {
  switch (state) {
    case "invited":
      // Same label whether or not they already use MileClear.
      return <StatusChip tone="neutral" icon="mail-outline" label="Invited" />;
    case "wants_to_join":
      return <StatusChip tone="amber" icon="people-outline" label="Wants to join" />;
    case "said_no":
      return <StatusChip tone="neutral" label="Said no" />;
    case "invite_expired":
      return <StatusChip tone="neutral" icon="time-outline" label="Invite expired" />;
  }
}

export function RequestStatusChip({ r }: { r: PracticeRequestRow }) {
  if (r.status === "open") {
    return r.driverReply ? (
      <StatusChip tone="neutral" icon="chatbubble-outline" label="Replied" />
    ) : (
      <StatusChip tone="amber" icon="paper-plane-outline" label="Open" />
    );
  }
  if (r.status === "done") {
    return <StatusChip tone="green" icon="checkmark" label={r.doneHow === "auto" ? "Done automatically" : "Done"} />;
  }
  return <StatusChip tone="neutral" label="Cancelled" />;
}
