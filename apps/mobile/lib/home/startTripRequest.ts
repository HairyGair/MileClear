// What Home and the Start Trip screen tell each other (rules in startTripCard.ts):
// which Start Trip screens are mounted in driving mode, and an I've Arrived
// tapped on Home's card waiting for that screen to run its own Arrived.
//
// The card never finishes the trip itself. The screen's Arrived is the one
// save path: it reads the screen's own route, keeps it in SQLite before the
// teardown, and stands aside for the notification's Arrived. A second path
// here would risk saving the drive twice.

import { arriveRequestLive } from "./startTripCard";

export type ScreenParams = Record<string, string>;

let nextId = 1;
const drivingScreens: { id: number; params: ScreenParams }[] = [];

/**
 * The Start Trip screen calls this while it is in driving mode, with its route
 * params: going back to it must hand the same params back, because the screen
 * re-runs its set-up when they change. Returns the unregister.
 */
export function registerDrivingStartTripScreen(params: ScreenParams = {}): () => void {
  const id = nextId++;
  drivingScreens.push({ id, params: { ...params } });
  return () => {
    const i = drivingScreens.findIndex((s) => s.id === id);
    if (i >= 0) drivingScreens.splice(i, 1);
  };
}

export function drivingStartTripScreens(): number {
  return drivingScreens.length;
}

/** The params of the newest driving screen, the one going back reaches first. */
export function newestDrivingScreenParams(): ScreenParams {
  return drivingScreens.length > 0 ? { ...drivingScreens[drivingScreens.length - 1].params } : {};
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

/** Only string params survive a route change; arrays and the rest are left out. */
export function stringParams(raw: Record<string, unknown>): ScreenParams {
  const out: ScreenParams = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Tests only. */
export function __resetStartTripRequest(): void {
  drivingScreens.length = 0;
  arriveRequestedAt = null;
}
