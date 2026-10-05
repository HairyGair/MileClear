// "Next week on your roads" (Oct 2026): pure helpers for the "Coming up"
// section of the Road alerts screen. Unit-tested in lib/__tests__.

import type { RoadAlertItem } from "@mileclear/shared";

/** On a Sunday (UK time) the server sends the Monday to Sunday ahead; on any
 *  other day, the rest of this week. */
export function weekAheadTitle(now: Date = new Date()): string {
  const day = now.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });
  return day.startsWith("Sun") ? "Coming up next week" : "Coming up this week";
}

/** The "Planned in the next 7 days" list without the closures already shown
 *  under "Coming up", so nothing is listed twice. */
export function withoutWeekAhead(upcoming: RoadAlertItem[], weekAhead: RoadAlertItem[]): RoadAlertItem[] {
  if (weekAhead.length === 0) return upcoming;
  const shown = new Set<string>();
  for (const w of weekAhead) for (const id of w.memberIds ?? [w.id]) shown.add(id);
  return upcoming.filter((u) => !(u.memberIds ?? [u.id]).some((id) => shown.has(id)));
}

/** "Starts Tue 20 Oct, 08:00 (BT works)". */
export function weekAheadStartLine(item: Pick<RoadAlertItem, "startAt" | "promoter">): string | null {
  if (!item.startAt) return null;
  const d = new Date(item.startAt);
  if (Number.isNaN(d.getTime())) return null;
  const when = d
    .toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    })
    .replace(/^(\w+),/, "$1");
  return `Starts ${when}${item.promoter ? ` (${item.promoter} works)` : ""}`;
}
