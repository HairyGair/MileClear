// Directions events, counts only (PLAN Dev6, DESIGN section 8): never a
// place, a coordinate, a street or an address. Through the same
// fire-and-forget /user/event channel the trip form uses.

import { apiRequest } from "../api/index";
import { countsOnly, type CountMeta } from "./countsOnly";

export type { CountMeta };

export type DirectionsEvent =
  | "directions.opened"
  | "directions.route_requested"
  | "directions.route_failed"
  | "directions.started"
  | "directions.rerouted"
  | "directions.reroute_failed"
  | "directions.gps_wait"
  | "directions.ended"
  | "directions.arrived"
  | "directions.resume_offered"
  | "directions.resumed"
  | "directions.mute_toggled"
  | "directions.open_in_maps"
  | "directions.crashed";

export function trackDirections(type: DirectionsEvent, meta?: CountMeta): void {
  try {
    apiRequest("/user/event", {
      method: "POST",
      body: JSON.stringify({ type, metadata: countsOnly(meta) }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}
