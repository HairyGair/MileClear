// The red strip under the name card on More (decision M-C). It shows only when
// Settings' check-up would show a red line, and it uses Home's own status line
// (selectStatusLine) so the words and the fix are the same as Home's:
//
//   "Location is no longer on Always. Trips aren't recording · Fix"
//   "2 trips couldn't upload · Retry"
//
// plus Settings' one red line Home does not carry, blocked notifications.
// Nothing at all when everything is fine. Pure, so every case is tested.

import { selectStatusLine, type StatusLine, type StatusInputs } from "../home/statusLine";
import type { NotificationPermission } from "../settings/checks";

export type MoreProblemTap = "fix_location" | "fix_background_refresh" | "sync_status" | "fix_notifications";

export interface MoreProblem {
  /** Drawn by Home's StatusLine component in its blocking look. */
  model: StatusLine;
  tap: MoreProblemTap;
  /** What a tap does, for screen readers. */
  hint: string;
}

export interface MoreStatus {
  problem: MoreProblem | null;
  /** The recording line when it is not plain "Recording automatically" and not red (paused, off, Low Power). */
  recordingNote: string | null;
}

export function moreStatus(
  i: StatusInputs & { notifications: NotificationPermission; loaded: boolean }
): MoreStatus {
  // Until the phone has answered, the inputs are optimistic: say nothing.
  if (!i.loaded) return { problem: null, recordingNote: null };
  // A trip being recorded is not a problem; read what the line would say without it.
  const s = selectStatusLine({ ...i, recording: null });
  if (s.look === "blocking") {
    const tap: MoreProblemTap =
      s.kind === "sync_failed" ? "sync_status" : i.blocker === "bg_refresh_off" ? "fix_background_refresh" : "fix_location";
    const hint = tap === "sync_status" ? "Opens Uploads to try again" : "Shows how to turn recording back on";
    return { problem: { model: s, tap, hint }, recordingNote: null };
  }
  const note = s.kind === "paused" || s.kind === "auto_off" || s.kind === "low_power" ? s.title : null;
  if (i.notifications === "denied") {
    const title = "Notifications are blocked on this phone";
    return {
      problem: {
        model: {
          kind: "cant_record",
          look: "blocking",
          title,
          action: "Fix",
          tap: "fix",
          icon: "notifications-off-outline",
          red: true,
          a11yLabel: `${title}. Fix.`,
        },
        tap: "fix_notifications",
        hint: "Opens your phone's settings for MileClear",
      },
      recordingNote: note,
    };
  }
  return { problem: null, recordingNote: note };
}
