// Time rules for the manual "add a past trip" form.
//
// The form opens with the start time set to "now" and no end time. A driver
// who types in a morning drive at lunchtime and never looks at the time
// field saves a trip stamped with the moment they opened the form. Emily
// Russell, 16 Sep 2026: an 08:35 to 09:01 drive entered at 13:50 saved as
// 13:50 to 13:51, landed after her return leg, and the server's
// missed-journey scanner then offered her a journey between the two that
// never happened.
//
// Two decisions live here so they can be tested without React:
//   1. whether Save should stop and ask about the time first, and
//   2. what the untouched end time should be once the route is known.

export interface TimeConfirmArgs {
  /** A brand-new trip, not an edit of a saved one. */
  isNew: boolean;
  /** The form is in manual entry, not the live Start Trip flow. */
  isManual: boolean;
  /** The driver set, cleared or was prefilled with a start or end time. */
  timeTouched: boolean;
}

/**
 * Ask "did it start at HH:mm today?" only when the time is the form's own
 * default: a new manual trip whose start and end nobody has set. Edits
 * carry the saved trip's real times, live trips take theirs from the
 * clock as the drive happens, and prefilled offers already count as touched.
 */
export function needsTimeConfirm(args: TimeConfirmArgs): boolean {
  return args.isNew && args.isManual && !args.timeTouched;
}

const MINUTE_MS = 60 * 1000;

/**
 * The end time to assume when the driver has not set one. With a routed
 * duration the drive ends when the route says it would, rounded up to the
 * whole minute so a 4 min 10 s route never rounds down to a shorter trip.
 * Without one (routing unavailable, or a zero or nonsense duration) fall
 * back to one minute after the start, which is the least wrong non-empty
 * answer and what the server assumed before.
 */
export function defaultEndFor(start: Date, routedMinutes: number | null): Date {
  const minutes =
    routedMinutes != null && Number.isFinite(routedMinutes) && routedMinutes > 0
      ? Math.ceil(routedMinutes)
      : 1;
  return new Date(start.getTime() + minutes * MINUTE_MS);
}

/** 24-hour clock, zero padded, in the device's local time: "08:35". */
export function clockTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
