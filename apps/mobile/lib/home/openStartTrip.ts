// Open the running Start Trip (rules in startTripCard.ts): back to the very
// screen that is recording it when that screen is in the stack, otherwise a
// fresh one that resumes it. With `arrive`, that screen then runs its own
// I've Arrived. Used by Home's card, the status line, the Start Trip button
// and the "Still on your trip?" notification.

import { router } from "expo-router";
import { openStartTripDue, openStartTripPlan, popLanded, startTripCardTapAllowed } from "./startTripCard";
import { dropArriveRequest, recordingStartTripScreens, requestArriveFromHome } from "./startTripRequest";

let lastOpenAt: number | null = null;

export function openStartTrip(opts: { arrive?: boolean; fromCardStartedAtMs?: number | null } = {}): void {
  const now = Date.now();
  // Only taps that navigated count: a tap that found the screen already on
  // top, was refused, or failed leaves the next one free.
  if (!openStartTripDue(lastOpenAt, now)) return;
  // The card's own tap, checked again at the moment of the tap: a trip near
  // the screen's 12-hour resume guard must never be opened from the card, as
  // the screen would then clear it and its route.
  if (opts.fromCardStartedAtMs !== undefined && !startTripCardTapAllowed(opts.fromCardStartedAtMs, now)) return;
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
    const target = plan.key;
    try {
      // Pops by count, so the screen keeps its own params and nothing named
      // "trip-form" in between is mistaken for it.
      owner.pop(plan.count);
    } catch {
      dropArriveRequest();
      return;
    }
    lastOpenAt = now;
    // A screen in between can refuse to go ("Keep editing"). Then the
    // recording screen never comes on top and a request left armed could
    // fire on a later visit, so forget it and free the next tap.
    setTimeout(() => {
      let landed = false;
      try {
        landed = popLanded(owner.getState(), target);
      } catch {
        landed = false;
      }
      if (!landed) {
        dropArriveRequest();
        if (lastOpenAt === now) lastOpenAt = null;
      }
    }, 250);
    return;
  }
  router.push("/trip-form" as never);
  lastOpenAt = now;
}
