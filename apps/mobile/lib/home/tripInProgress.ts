// Which trip Home's one card is about, so a trip is on Home from the moment it
// starts until it is saved, ended or discarded (rules for the Start Trip
// card itself are in startTripCard.ts).
//
// John, 27 Oct 2026: the trip line went from Home while his drive was still
// going. The Start Trip card (28 Oct) fixed a running Start Trip, but it
// hid again the moment I've Arrived was tapped, although nothing was saved
// yet: the trip sat in SQLite (pending_arrived_trip) waiting for Save, with
// nothing on Home pointing at it. An automatic recording only had the small
// status line. So there are three things the card can be about, one at a time.
//
// Pure, so the rules are proven without booting the native stack.

import { distanceIn, distanceUnitLabel, type DistanceUnit } from "@mileclear/shared";
import { durationText } from "./statusLine";
import { PENDING_ARRIVED_MAX_AGE_MS, pendingArrivedAction, type PendingArrivedFacts } from "../tracking/arrivedRecovery";
import type { StartTripCardModel } from "./startTripCard";

/**
 * The card stops this far short of the trip screen's 12-hour limit, and a tap
 * is checked again with the time of the tap, so a card that has sat on screen
 * can never lead to a trip the screen would then treat as expired.
 */
export const ARRIVED_CARD_MARGIN_MS = 10 * 60 * 1000;

/** Offer the arrived trip on the card (and on a tap) at this moment? */
export function arrivedCardOffered(facts: PendingArrivedFacts | null, nowMs: number): boolean {
  if (!facts) return false;
  return pendingArrivedAction(facts, nowMs, PENDING_ARRIVED_MAX_AGE_MS - ARRIVED_CARD_MARGIN_MS) === "offer";
}

export type TripCardKind = "start_trip" | "arrived_unsaved" | "automatic";

export type CardTapPlan =
  | { go: "none" }
  | { go: "active_recording" }
  | { go: "open_start_trip"; arrive: boolean; fromCardStartedAtMs?: number | null };

/**
 * What a tap on the card does, decided with the time of the tap. Save trip
 * never asks the screen to run Arrived (the trip is already arrived).
 * `button` is the big button; the row itself never arrives.
 */
export function cardTapPlan(i: {
  kind: TripCardKind;
  button: boolean;
  facts: PendingArrivedFacts | null;
  startTripStartedAtMs: number | null;
  nowMs: number;
}): CardTapPlan {
  if (i.kind === "automatic") return { go: "active_recording" };
  if (i.kind === "arrived_unsaved") {
    return arrivedCardOffered(i.facts, i.nowMs) ? { go: "open_start_trip", arrive: false } : { go: "none" };
  }
  return { go: "open_start_trip", arrive: i.button, fromCardStartedAtMs: i.startTripStartedAtMs };
}

function distanceText(miles: number, unit: DistanceUnit): string {
  const d = Math.max(0, distanceIn(Number.isFinite(miles) ? miles : 0, unit));
  return `${d < 100 ? d.toFixed(1) : String(Math.round(d))} ${distanceUnitLabel(unit)}`;
}

/**
 * An arrived trip that has not been saved or discarded. The card shows for as
 * long as the trip screen would put it back on screen (pendingArrivedAction
 * "offer"); an older one is reported and cleared when the app or the trip
 * screen next opens, so the card must not lead to it.
 */
export function arrivedUnsavedCardModel(i: {
  facts: PendingArrivedFacts | null;
  now: number;
  unit?: DistanceUnit;
}): StartTripCardModel | null {
  if (!i.facts) return null;
  if (!arrivedCardOffered(i.facts, i.now)) return null;
  const start = new Date(i.facts.startedAt).getTime();
  const end = new Date(i.facts.endedAt).getTime();
  const distance = distanceText(i.facts.distanceMiles ?? 0, i.unit ?? "miles");
  const duration = durationText(Math.max(0, end - start));
  const known = i.facts.distanceMiles != null;
  return {
    title: "Trip ready to save",
    detail: known ? `${distance} · ${duration}` : duration,
    a11yLabel: `Trip ready to save, ${known ? `${distance}, ` : ""}${duration}`,
    actionLabel: "Save trip",
    actionHint: "Opens the finished trip so you can save it",
  };
}

/** An automatic recording, for as long as the recording flag is set. */
export function automaticCardModel(i: {
  recording: { miles: number; elapsedMs: number; mode: "auto" | "quick" } | null;
  unit?: DistanceUnit;
}): StartTripCardModel | null {
  if (!i.recording || i.recording.mode !== "auto") return null;
  const distance = distanceText(i.recording.miles, i.unit ?? "miles");
  const duration = durationText(i.recording.elapsedMs);
  return {
    title: "Trip in progress",
    detail: `${distance} · ${duration}`,
    a11yLabel: `Trip in progress, ${distance}, ${duration}`,
    actionLabel: "See trip",
    actionHint: "Opens the trip being recorded",
  };
}

/**
 * The one card Home shows, or null. A trip waiting to be saved comes first
 * (it needs the driver), then a running Start Trip, then an automatic
 * recording. Work or Personal mode, hidden or reordered sections and the app
 * having been killed and reopened change none of this: it reads the phone's
 * own records.
 */
export function selectTripCard(i: {
  arrived: StartTripCardModel | null;
  startTrip: StartTripCardModel | null;
  automatic: StartTripCardModel | null;
}): { kind: TripCardKind; model: StartTripCardModel } | null {
  if (i.arrived) return { kind: "arrived_unsaved", model: i.arrived };
  if (i.startTrip) return { kind: "start_trip", model: i.startTrip };
  if (i.automatic) return { kind: "automatic", model: i.automatic };
  return null;
}
