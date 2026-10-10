// The four "Is MileClear working?" checks at the top of Settings (Oct 2026
// Settings redesign, direction A). They use the SAME rules and words as
// Home's status line (lib/home/statusLine.ts): the recording check IS
// selectStatusLine, and the uploads check shares its sentence, so Home and
// Settings can never disagree. Pure, so every state is proven in a unit test.

import type { BlockerId } from "../dashboardMessages";
import { selectStatusLine, syncFailedTitle, type StatusKind, type StatusLine } from "../home/statusLine";
import { routeText, whenLabel, milesText, type LastTripData } from "../home/lastTrip";

/** How a check row is drawn. ok = green tick, bad = red, warn = amber, neutral = grey. */
export type CheckLook = "ok" | "warn" | "bad" | "neutral";

export type CheckId = "recording" | "last_trip" | "notifications" | "uploads";

/** What a tap does. The screen maps these to routes and fixes. */
export type CheckTap =
  | "recording_screen"
  | "fix_location"
  | "fix_background_refresh"
  | "resume"
  | "trips"
  | "notifications_screen"
  | "fix_notifications"
  | "sync_status";

export interface CheckRow {
  id: CheckId;
  look: CheckLook;
  title: string;
  hint: string | null;
  /** The verb on the right ("Fix", "Retry", "Resume"), or null. */
  action: string | null;
  tap: CheckTap;
  /** Only set for the recording row: Home's status kind behind it. */
  statusKind?: StatusKind;
}

export interface RecordingCheckInputs {
  blocker: BlockerId | null;
  pausedUntil: number | null;
  now: number;
  automaticOff: boolean;
  lowPowerMode: boolean;
  platform: "ios" | "android";
  setup: { done: number; total: number } | null;
  /** A trip is being recorded right now. */
  recording: { miles: number; elapsedMs: number; mode: "auto" | "quick" } | null;
}

/**
 * The recording row. Sync failures are left out on purpose (they have their
 * own Uploads row), everything else follows Home's order, so a broken location
 * permission can never sit next to the word "on".
 */
export function recordingStatus(i: RecordingCheckInputs): StatusLine {
  return selectStatusLine({
    recording: i.recording,
    blocker: i.blocker,
    failedSyncCount: 0,
    pausedUntil: i.pausedUntil,
    now: i.now,
    automaticOff: i.automaticOff,
    lowPowerMode: i.lowPowerMode,
    platform: i.platform,
    setup: i.setup,
    recovered: null,
  });
}

export function recordingCheck(i: RecordingCheckInputs): CheckRow {
  const s = recordingStatus(i);
  const look: CheckLook =
    s.kind === "fine" || s.kind === "recording"
      ? "ok"
      : s.look === "blocking"
        ? "bad"
        : s.look === "neutral"
          ? "neutral"
          : "warn";
  let tap: CheckTap = "recording_screen";
  if (s.kind === "cant_record") tap = i.blocker === "bg_refresh_off" ? "fix_background_refresh" : "fix_location";
  else if (s.kind === "paused") tap = "resume";
  return {
    id: "recording",
    look,
    title: s.title,
    hint: s.kind === "fine" ? "Your drives record by themselves" : null,
    action: s.action,
    tap,
    statusKind: s.kind,
  };
}

export function lastTripCheck(args: {
  trip: LastTripData | null;
  /** Trips ever recorded (a new driver has none). */
  totalTrips: number;
  loading: boolean;
  now: number;
}): CheckRow {
  if (!args.trip) {
    if (args.loading) {
      return { id: "last_trip", look: "neutral", title: "Last trip", hint: "Checking...", action: null, tap: "trips" };
    }
    return {
      id: "last_trip",
      look: "neutral",
      title: "No trips yet",
      hint: "Just drive, it starts at 15 mph",
      action: null,
      tap: "trips",
    };
  }
  const t = args.trip;
  const when = whenLabel(t.startedAt, t.endedAt, args.now);
  const route = routeText(t.startLabel, t.endLabel);
  return {
    id: "last_trip",
    look: "ok",
    title: `Last trip: ${when}`,
    hint: route === "Route not recorded" ? milesText(t.distanceMiles) : `${milesText(t.distanceMiles)}, ${route}`,
    action: null,
    tap: "trips",
  };
}

export type NotificationPermission = "granted" | "denied" | "undetermined";

export function notificationsCheck(args: {
  permission: NotificationPermission;
  /** Switches that are on, and how many the driver can see. Null while loading. */
  counts: { on: number; total: number } | null;
}): CheckRow {
  if (args.permission === "denied") {
    return {
      id: "notifications",
      look: "bad",
      title: "Notifications are blocked on this phone",
      hint: "MileClear can't tell you about trips, tax or your car",
      action: "Fix",
      tap: "fix_notifications",
    };
  }
  if (args.permission === "undetermined") {
    return {
      id: "notifications",
      look: "warn",
      title: "Notifications aren't turned on yet",
      hint: "Turn them on to get trip, tax and car reminders",
      action: "Turn on",
      tap: "fix_notifications",
    };
  }
  return {
    id: "notifications",
    look: "ok",
    title: "Notifications allowed",
    // The count only shows when the phone allows them (it was "10 of 10 on"
    // while every one was blocked).
    hint: args.counts ? `${args.counts.on} of ${args.counts.total} on` : null,
    action: null,
    tap: "notifications_screen",
  };
}

export function uploadsCheck(args: {
  failedCount: number;
  allTrips: boolean;
  /** Saved on the phone, not uploaded yet (offline, or mid-upload). */
  pendingCount?: number;
}): CheckRow {
  if (args.failedCount > 0) {
    return {
      id: "uploads",
      look: "bad",
      title: syncFailedTitle(args.failedCount, args.allTrips),
      hint: null,
      action: "Retry",
      tap: "sync_status",
    };
  }
  // Waiting is not a fault (no signal, or the upload is running), but it is
  // not "uploaded to your account" either.
  const pending = args.pendingCount ?? 0;
  if (pending > 0) {
    return {
      id: "uploads",
      look: "neutral",
      title: `${pending} waiting to upload`,
      hint: "Saved on this phone. They upload when you're online",
      action: null,
      tap: "sync_status",
    };
  }
  return {
    id: "uploads",
    look: "ok",
    title: "All trips saved",
    hint: "Uploaded to your account",
    action: null,
    tap: "sync_status",
  };
}

/**
 * Shown while the phone's permissions are still being read, so a check never
 * shows a green tick it has not earned (the inputs start optimistic).
 */
export function checkingRow(id: "recording" | "notifications"): CheckRow {
  return {
    id,
    look: "neutral",
    title: id === "recording" ? "Checking recording..." : "Checking notifications...",
    hint: null,
    action: null,
    tap: id === "recording" ? "recording_screen" : "notifications_screen",
  };
}

/** The More tab's Settings row: the live headline. */
export function settingsHeadline(rows: CheckRow[]): { text: string; red: boolean } {
  const bad = rows.find((r) => r.look === "bad");
  if (bad) return { text: bad.title, red: true };
  const rec = rows.find((r) => r.id === "recording");
  if (rec && rec.look !== "ok") return { text: rec.title, red: false };
  return { text: "Recording automatically", red: false };
}
