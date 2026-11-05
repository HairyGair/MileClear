// A shift the server still calls running after this phone ended it.
//
// 5 Nov 2026: a driver's shift ended on its own on the phone (no driving for
// three hours), but the end never reached the server. Home hid the shift
// because the phone knew it was over, so there was no End Shift button, and
// Start Shift was refused with "You already have an active shift". Two weeks
// stuck; restarting and signing out changed nothing.
//
// These are the decisions, kept pure so they can be tested. The work (reading
// the phone's copy, sending the end, the Start Shift question) is in
// staleServerShift.ts.

/** What this phone knows about one shift. */
export interface LocalShiftView {
  /** The phone's own row for the shift, if it has one. */
  row: { status: string | null; endedAt: string | null } | null;
  /** The shift ended on its own on this phone (wasShiftAutoEnded). */
  autoEnded: boolean;
  /** It is being ended on this phone right now (isShiftEnding). */
  ending: boolean;
}

/** This phone ended the shift, whatever the server says. The row can read
 *  "active" after an automatic end: the end was reverted or cut short before
 *  it was written, and the automatic end is the part that stuck. */
export function phoneEndedShift(local: LocalShiftView): boolean {
  if (local.autoEnded) return true;
  return local.row?.status === "completed" || !!local.row?.endedAt;
}

/** Home sees the server calling this shift running: send the phone's end
 *  again? Not while the phone is ending it anyway (that send is on its way). */
export function shouldResendEnd(serverShift: { status: string }, local: LocalShiftView): boolean {
  if (serverShift.status !== "active") return false;
  if (local.ending) return false;
  return phoneEndedShift(local);
}

/**
 * The end time to send with a late end, or undefined when the start is
 * unreadable (the server then uses now). The phone's own end time first; else
 * the last thing the phone saw happen in the shift (a trip's end, a
 * breadcrumb); else the start itself. Only recorded times: the server moves
 * the end up to the last trip it holds for the shift, so a shift with no
 * driving the phone knows of still ends at its last real trip, and a
 * forgotten shift is never counted as two weeks of work or given an invented
 * length. Never before the start, never after now.
 */
export function resendEndedAt(input: {
  serverStartedAt: string;
  localEndedAt: string | null;
  lastActivityAt: string | null;
  nowMs: number;
}): string | undefined {
  const startMs = Date.parse(input.serverStartedAt);
  if (!Number.isFinite(startMs)) return undefined;
  const usable = (iso: string | null): number | null => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) && ms >= startMs && ms <= input.nowMs ? ms : null;
  };
  const chosen = usable(input.localEndedAt) ?? usable(input.lastActivityAt) ?? Math.min(startMs, input.nowMs);
  return new Date(chosen).toISOString();
}

/** A shift this phone does not know, open longer than this, is taken as
 *  forgotten: ended at its last recorded trip, not at the moment the driver
 *  says end it. Shorter, it may be running on another phone right now. */
export const FORGOTTEN_SHIFT_MS = 12 * 60 * 60 * 1000;

/** Home asks again at most this often for one shift, if a send failed. */
export const RESEND_RETRY_MS = 10 * 60 * 1000;

/** One send per shift at a time, and after a failure not again for a while.
 *  Once one has landed, never again in this run of the app. */
export function canAttemptResend(
  attempt: { atMs: number; done: boolean } | undefined,
  nowMs: number
): boolean {
  if (!attempt) return true;
  if (attempt.done) return false;
  return nowMs - attempt.atMs >= RESEND_RETRY_MS;
}

export type StartBlockedAction = "end_and_retry" | "ask";

/** Start Shift was refused because the server has a shift running. One this
 *  phone already ended is ended again and the start tried once more; one it
 *  does not know (another phone, a reinstall) or thinks is still running is
 *  the driver's call. */
export function startBlockedAction(local: LocalShiftView): StartBlockedAction {
  return phoneEndedShift(local) ? "end_and_retry" : "ask";
}

/** The shift named by a refused Start Shift ("You already have an active
 *  shift"), or null when the refusal is something else. `id` is missing from
 *  an API older than 5 Nov 2026, which only sent the message. */
export function blockingShiftFromRefusal(
  statusCode: number | null,
  message: string,
  body: Record<string, unknown> | undefined
): { id: string | null; startedAt: string | null } | null {
  if (statusCode !== 400 || !/already have an active shift/i.test(message)) return null;
  const named = body?.activeShift as { id?: unknown; startedAt?: unknown } | undefined;
  return {
    id: typeof named?.id === "string" ? named.id : null,
    startedAt: typeof named?.startedAt === "string" ? named.startedAt : null,
  };
}

/** "Wed 22 Oct, 08:14" for the Start Shift question. */
export function shiftStartLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "earlier";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}, ${hh}:${mm}`;
}
