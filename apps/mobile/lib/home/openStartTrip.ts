// Open the running Start Trip (rules in startTripCard.ts): back to the very
// screen that is recording it when that screen is in the stack, otherwise a
// fresh one that resumes it. With `arrive`, that screen then runs its own
// I've Arrived. Used by Home's card, the status line, the Start Trip button
// and the "Still on your trip?" notification.

import { router } from "expo-router";
import { openStartTripDue, openStartTripPlan } from "./startTripCard";
import { dropArriveRequest, recordingStartTripScreens, requestArriveFromHome } from "./startTripRequest";

let lastOpenAt: number | null = null;

export function openStartTrip(opts: { arrive?: boolean } = {}): void {
  const now = Date.now();
  // Only taps that navigated count: a tap that found the screen already on
  // top, or that failed, leaves the next one free.
  if (!openStartTripDue(lastOpenAt, now)) return;
  if (opts.arrive) requestArriveFromHome(now);

  // Every recording screen sits in the root stack, so any of them can read it.
  const screens = recordingStartTripScreens();
  const owner = screens[screens.length - 1];
  let plan: ReturnType<typeof openStartTripPlan> = { kind: "open" };
  try {
    plan = owner ? openStartTripPlan(owner.getState(), screens.map((s) => s.key)) : { kind: "open" };
  } catch {
    plan = { kind: "open" };
  }
  if (plan.kind === "here") {
    // Already on screen: no focus change will come to pick a request up, and
    // one left waiting could fire on a later return. Never set from Home.
    dropArriveRequest();
    return;
  }
  if (plan.kind === "pop" && owner) {
    try {
      // Pops by count, so the screen keeps its own params and nothing named
      // "trip-form" in between is mistaken for it.
      owner.pop(plan.count);
      lastOpenAt = now;
      return;
    } catch {
      // fall through to a fresh screen
    }
  }
  router.push("/trip-form" as never);
  lastOpenAt = now;
}
