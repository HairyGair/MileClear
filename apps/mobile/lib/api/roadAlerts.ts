import type { RoadAlertsResponse } from "@mileclear/shared";
import { apiRequest } from "./index";

/** Road alerts trial (Oct 2026): events on the driver's usual roads now, and
 *  planned closures and roadworks in the next 7 days. */
export function fetchRoadAlerts() {
  return apiRequest<RoadAlertsResponse>("/road-alerts");
}

/** "Not relevant to me" on one card (every event merged into it), or
 *  undo: true to bring it back. */
export function dismissRoadAlert(body: {
  eventIds: string[];
  undo?: boolean;
  road?: string | null;
  severity?: string;
  daysOnRoute?: number;
}) {
  return apiRequest<{ ok: boolean }>("/road-alerts/dismiss", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
