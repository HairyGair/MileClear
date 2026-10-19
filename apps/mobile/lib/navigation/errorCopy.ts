// The preview sheet's error states, word for word from DESIGN.md 2.8. Each
// one offers a way on, and "Open in Apple Maps / Google Maps" wherever a
// route could still be had, so a driver is never stuck. Pure.

import type { PreviewError } from "./useGuidanceTypes";

export type ErrorAction = "try_again" | "open_maps" | "choose_else" | "ok" | "open_settings";

export interface ErrorCopy {
  title: string;
  body: string | null;
  actions: ErrorAction[];
}

export function previewErrorCopy(e: PreviewError, mapsName: "Apple Maps" | "Google Maps"): ErrorCopy {
  switch (e) {
    case "OFFLINE":
      return {
        title: "No internet connection",
        body: "Directions need the internet to find a route. Your trips still record.",
        actions: ["try_again", "open_maps"],
      };
    case "NO_ROUTE":
      return {
        title: "Can't find a route to there",
        body: "It may be off the road network or outside Great Britain.",
        actions: ["choose_else", "open_maps"],
      };
    case "BAD_INPUT":
      return {
        title: "Can't find a route to there",
        body: "Something about that place didn't work. Try picking it again.",
        actions: ["choose_else"],
      };
    case "NAVIGATION_NOT_ENABLED":
      return { title: "Directions aren't switched on for your account", body: null, actions: ["ok"] };
    case "TOO_MANY_REQUESTS":
      return { title: "Too many routes in a minute", body: "Wait a moment, then try again.", actions: ["try_again"] };
    case "NO_PERMISSION":
      return {
        title: "MileClear can't see where you are",
        body: "Turn on Location for MileClear in Settings. This also lets your trips record.",
        actions: ["open_settings"],
      };
    case "OUTSIDE_GB":
      return {
        title: "Directions only cover Great Britain",
        body: "Northern Ireland, the islands and abroad aren't covered yet.",
        actions: ["choose_else", "open_maps"],
      };
    case "NO_FIX":
      return {
        title: "Can't find where you are yet",
        body: "Check Location is on for MileClear, then try again.",
        actions: ["try_again", "open_maps"],
      };
    case "ROUTING_UNAVAILABLE":
    case "UNKNOWN":
    default:
      return {
        title: "Directions aren't working right now",
        body: `Try again in a minute, or use ${mapsName} for this one.`,
        actions: ["try_again", "open_maps"],
      };
  }
}

/** The banner while off the route after a failed reroute (DESIGN 2.4). */
export function rerouteFailureBody(reason: "OFFLINE" | "ROUTING_UNAVAILABLE" | "NO_ROUTE" | "OTHER"): string {
  if (reason === "OFFLINE") return "No internet for a new route. We'll keep trying.";
  if (reason === "NO_ROUTE") return "Can't find a way from here. Trying again.";
  return "Can't get a new route right now. Trying again.";
}
