// What Home and the Start Trip screen tell each other (rules in startTripCard.ts):
// which Start Trip screens are recording (in driving mode), and an I've Arrived
// tapped on Home's card waiting for that screen to run its own Arrived.
//
// The card never finishes the trip itself. The screen's Arrived is the one
// save path: it reads the screen's own route, keeps it in SQLite before the
// teardown, and stands aside for the notification's Arrived. A second path
// here would risk saving the drive twice.

import { arriveRequestLive, type StackStateLike } from "./startTripCard";

/** What a recording screen hands over: its route key and its navigator. */
export interface RecordingScreen {
  key: string;
  /** The root stack's state, live. */
  getState: () => StackStateLike | null | undefined;
  /** Pops `count` screens off the root stack. */
  pop: (count: number) => void;
}

const recordingScreens: { id: number; screen: RecordingScreen }[] = [];
let nextId = 1;

/** The Start Trip screen calls this while it is in driving mode. Returns the unregister. */
export function registerRecordingStartTripScreen(screen: RecordingScreen): () => void {
  const id = nextId++;
  recordingScreens.push({ id, screen });
  return () => {
    const i = recordingScreens.findIndex((s) => s.id === id);
    if (i >= 0) recordingScreens.splice(i, 1);
  };
}

export function recordingStartTripScreens(): RecordingScreen[] {
  return recordingScreens.map((s) => s.screen);
}

let arriveRequestedAt: number | null = null;

/** Home's I've Arrived was tapped. */
export function requestArriveFromHome(nowMs: number): void {
  arriveRequestedAt = nowMs;
}

/** True once, for the screen that takes the request; a stale one is dropped. */
export function takeArriveRequest(nowMs: number): boolean {
  const live = arriveRequestLive(arriveRequestedAt, nowMs);
  arriveRequestedAt = null;
  return live;
}

/** The screen that opened cannot act on it (not in driving mode): forget it. */
export function dropArriveRequest(): void {
  arriveRequestedAt = null;
}

export function hasArriveRequest(): boolean {
  return arriveRequestedAt !== null;
}

/** Tests only. */
export function __resetStartTripRequest(): void {
  recordingScreens.length = 0;
  arriveRequestedAt = null;
}
