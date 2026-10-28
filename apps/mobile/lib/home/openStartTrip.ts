// Open the running Start Trip from Home (rules in startTripCard.ts): back to
// its screen when one is mounted below, otherwise a fresh one that resumes it.
// With `arrive`, that screen then runs its own I've Arrived.

import { router } from "expo-router";
import { openStartTripAction, openStartTripDue } from "./startTripCard";
import { drivingStartTripScreens, newestDrivingScreenParams, requestArriveFromHome } from "./startTripRequest";

let lastOpenAt: number | null = null;

export function openStartTrip(opts: { arrive?: boolean } = {}): void {
  const now = Date.now();
  if (!openStartTripDue(lastOpenAt, now)) return;
  lastOpenAt = now;
  if (opts.arrive) requestArriveFromHome(now);
  if (openStartTripAction(drivingStartTripScreens()) === "back_to_screen") {
    // Going back replaces the screen's params: hand its own back unchanged.
    router.dismissTo({ pathname: "/trip-form", params: newestDrivingScreenParams() } as never);
  } else {
    router.push("/trip-form" as never);
  }
}
