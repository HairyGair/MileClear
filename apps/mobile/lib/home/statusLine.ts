// Home's one status line (Oct 2026 Home redesign, PROPOSALS 0.2).
//
// One row replaces the Automatic trips row, the recording banner, the sync
// banner, the trip status strip, the red blocker card, the setup card, the Low
// Power card and the "we improved your trip data" banner. It shows the single
// highest message in this order:
//
//   1 recording now   2 can't record   3 trips failed to upload   4 paused
//   5 automatic trips off   6 low power   7 setup unfinished
//   7.5 one-time "we recovered" note   8 all fine
//
// Pure, so the order is proven without booting the native stack.

import type { BlockerId } from "../dashboardMessages";
import { pausedRowText } from "../tracking/pauseRule";

export type StatusKind =
  | "recording"
  | "cant_record"
  | "sync_failed"
  | "paused"
  | "auto_off"
  | "low_power"
  | "setup"
  | "recovered"
  | "fine";

/** How the row is drawn (SPEC-VISUAL 5.2): the four looks plus the live one. */
export type StatusLook = "fine" | "live" | "neutral" | "warning" | "blocking";

/** What a tap on the row does. */
export type StatusTap =
  | "live_trip"
  | "fix"
  | "sync_status"
  | "recording_sheet"
  | "low_power_sheet"
  | "setup_sheet"
  | "trips";

export interface StatusInputs {
  /** A trip is being recorded right now. */
  recording: { miles: number; elapsedMs: number; mode: "auto" | "quick" } | null;
  /** From lib/dashboardMessages: MileClear cannot record at all. */
  blocker: BlockerId | null;
  /** Trips that could not be uploaded and need the driver. */
  failedSyncCount: number;
  /** Epoch ms when a pause ends, or null. */
  pausedUntil: number | null;
  now: number;
  /** The permanent Automatic trips switch is off (a timed pause is not this). */
  automaticOff: boolean;
  lowPowerMode: boolean;
  /** "ios" or "android", for the Low Power / Battery Saver wording. */
  platform: "ios" | "android";
  /** Setup rows left to finish, or null when nothing is outstanding. */
  setup: { done: number; total: number } | null;
  /** The one-time "we improved your trip data" note, until it has been seen. */
  recovered: { trips: number; miles: number } | null;
}

export interface StatusLine {
  kind: StatusKind;
  look: StatusLook;
  title: string;
  /** The verb on the right ("Fix", "Retry", "Resume"), or null. */
  action: string | null;
  tap: StatusTap;
  /** Ionicons name for the warning and blocking looks. */
  icon: string | null;
  /** Red: the ask slot stands down while this shows. */
  red: boolean;
  /** Screen-reader text: title plus action. */
  a11yLabel: string;
}

/** "6 min", "1 h 5 min". */
export function durationText(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function milesText(miles: number): string {
  const m = Math.max(0, miles);
  return `${m < 100 ? m.toFixed(1) : String(Math.round(m))} mi`;
}

function pausedTitle(until: number, now: number): string {
  // pausedRowText says "Recording paused until ..."; the line says "Paused until ...".
  return pausedRowText(until, now).replace(/^Recording paused/, "Paused");
}

function make(
  kind: StatusKind,
  look: StatusLook,
  title: string,
  tap: StatusTap,
  extra: { action?: string; icon?: string; red?: boolean } = {}
): StatusLine {
  const action = extra.action ?? null;
  return {
    kind,
    look,
    title,
    action,
    tap,
    icon: extra.icon ?? null,
    red: extra.red ?? false,
    a11yLabel: action ? `${title}. ${action}.` : title,
  };
}

export function selectStatusLine(i: StatusInputs): StatusLine {
  if (i.recording) {
    return make(
      "recording",
      "live",
      `Recording · ${milesText(i.recording.miles)} · ${durationText(i.recording.elapsedMs)}`,
      "live_trip"
    );
  }
  if (i.blocker) {
    return make("cant_record", "blocking", "Trips aren't recording", "fix", {
      action: "Fix",
      icon: "alert-circle",
      red: true,
    });
  }
  if (i.failedSyncCount > 0) {
    const n = i.failedSyncCount;
    return make(
      "sync_failed",
      "blocking",
      `${n} ${n === 1 ? "trip" : "trips"} couldn't upload`,
      "sync_status",
      { action: "Retry", icon: "cloud-offline-outline", red: true }
    );
  }
  if (i.pausedUntil !== null && i.pausedUntil > i.now) {
    return make("paused", "warning", pausedTitle(i.pausedUntil, i.now), "recording_sheet", {
      action: "Resume",
      icon: "pause-circle",
    });
  }
  if (i.automaticOff) {
    return make(
      "auto_off",
      "neutral",
      "Automatic trips off. Only Start Trip records",
      "recording_sheet"
    );
  }
  if (i.lowPowerMode) {
    return make(
      "low_power",
      "warning",
      `${i.platform === "ios" ? "Low Power Mode" : "Battery Saver"} is on. Drives may not record`,
      "low_power_sheet",
      { icon: "battery-dead-outline" }
    );
  }
  if (i.setup) {
    return make(
      "setup",
      "warning",
      `Finish setting up · ${i.setup.done} of ${i.setup.total} done`,
      "setup_sheet",
      { icon: "list-outline" }
    );
  }
  if (i.recovered) {
    const miles = Math.round(i.recovered.miles * 10) / 10;
    return make(
      "recovered",
      "warning",
      `We recovered ${miles} ${miles === 1 ? "mile" : "miles"} on ${i.recovered.trips} ${i.recovered.trips === 1 ? "trip" : "trips"}`,
      "trips",
      { icon: "sparkles-outline" }
    );
  }
  return make("fine", "fine", "Recording automatically", "recording_sheet");
}
