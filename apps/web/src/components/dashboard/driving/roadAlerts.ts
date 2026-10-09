import type { RoadAlertItem, RoadAlertsResponse } from "@mileclear/shared";
import { api } from "../../../lib/api";
import { formatDay, formatTime } from "../../../lib/dashboard/dates";

export type RoadAlertsData = RoadAlertsResponse["data"];

/** GET /road-alerts. Errors and "feature off" both become an empty result, never a failure. */
export async function fetchRoadAlerts(): Promise<RoadAlertsData> {
  try {
    const res = await api.get<RoadAlertsResponse>("/road-alerts");
    return res.data;
  } catch {
    return {
      enabled: false,
      available: false,
      plannedWorksCoverage: null,
      offerEligible: false,
      hasUsualRoads: false,
      current: [],
      upcoming: [],
      attribution: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

/** "Until about 10:00" / "From Fri 10 Oct, 20:00 to 06:00". */
export function whenText(item: RoadAlertItem): string | null {
  if (item.when === "now") {
    return item.endAt ? `Until about ${formatTime(item.endAt)}${sameDay(item.endAt) ? "" : `, ${formatDay(item.endAt)}`}` : "In place now";
  }
  if (item.startAt && item.endAt) return `From ${formatDay(item.startAt)}, ${formatTime(item.startAt)} to ${formatTime(item.endAt)}`;
  if (item.startAt) return `From ${formatDay(item.startAt)}, ${formatTime(item.startAt)}`;
  return null;
}

function sameDay(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** Where line that adds to the sentence rather than repeating it. */
export function whereText(item: RoadAlertItem): string | null {
  const parts = [item.town, item.delayMinutes ? `About ${item.delayMinutes} minutes of delay` : null].filter(Boolean) as string[];
  return parts.length ? parts.join(" · ") : null;
}

/** Drops the first words of the sentence when they only repeat the headline. */
export function bodyLine(item: RoadAlertItem): string {
  const h = item.headline.trim().toLowerCase();
  const s = item.sentence.trim();
  return s.toLowerCase() === h ? "" : s;
}

export function dismissBody(item: RoadAlertItem) {
  return {
    eventIds: item.memberIds && item.memberIds.length > 0 ? item.memberIds : [item.id],
    road: item.road,
    severity: item.severity,
    daysOnRoute: Math.max(0, Math.min(100, Math.round(item.daysOnRoute ?? 0))),
  };
}
