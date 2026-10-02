import type { RoadAlertsResponse } from "@mileclear/shared";
import { apiRequest } from "./index";

/** Road alerts trial (Oct 2026): events on the driver's usual roads now, and
 *  planned closures and roadworks in the next 7 days. */
export function fetchRoadAlerts() {
  return apiRequest<RoadAlertsResponse>("/road-alerts");
}
