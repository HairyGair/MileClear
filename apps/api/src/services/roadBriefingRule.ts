// Roadworks line in the morning briefing (Oct 2026): pure rules, unit-tested.
// The IO lives in services/roadBriefing.ts and jobs/notifications.ts
// (runMorningBriefingJob).
//
// For a driver with road alerts on, the morning briefing gains ONE line when
// Street Manager works on their usual roads are in place today:
//
//   "Durham Road closed today (BT), plus 2 more"
//   "Temporary lights on High Street today (Yorkshire Water)"
//   "Emergency works: Durham Road closed today"
//
// Only works that change how a driver gets through (a closure, or lights,
// lanes, boards: pushWorthy), most disruptive first (disruptionTier), and
// emergency then urgent works first within the same level. Works in place for
// more than 3 days are left out (they know about them by now, the same rule
// as the pre-departure alert), so are dismissed ones and ones with no street
// name. Never a separate push: the line rides on a briefing that was going
// anyway, and is left out if it would make the briefing too long.

import type { RoadEvent } from "./roadEvents.js";
import { groupMatches, groupUrgency, withoutDismissed, type AlertGroup } from "./roadAlertGroups.js";
import type { MatchedEvent } from "./roadAlertsRule.js";
import {
  disruptionTier,
  pushWorthy,
  shortPromoter,
  shortStreetName,
  worksPhrase,
  type WeekAheadCandidate,
  type WorksMeta,
} from "./roadWeekAheadRule.js";

/** Off unless BRIEFING_ROADWORKS is exactly "1". */
export function briefingRoadworksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BRIEFING_ROADWORKS === "1";
}

/** The longest briefing body we send. Expo has no limit this low, but iOS
 *  shows about four lines (some 178 characters) on the lock screen before it
 *  cuts the text off, and the roadworks line must never push the driver's
 *  own figures out of view. */
export const BRIEFING_BODY_MAX = 178;

export interface BriefingWorksEntry {
  group: AlertGroup;
  /** disruptionTier: 0 road closure, 1 traffic-sensitive street, 2 lights / lanes / boards. */
  tier: number;
  /** 2 emergency, 1 urgent, 0 other. */
  urgency: number;
  trafficManagement: string;
  promoter: string | null;
  name: string;
}

function normStatus(s: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** Works on this driver's usual roads in place right now, most disruptive
 *  first. `candidates` are already matched to the driver's corridor. */
export function selectBriefingWorks(
  candidates: WeekAheadCandidate[],
  opts: { now: Date; dismissed?: Set<string> }
): BriefingWorksEntry[] {
  const t = opts.now.getTime();
  const worksById = new Map<string, WorksMeta>();
  const kept: MatchedEvent[] = [];
  for (const c of candidates) {
    const e: RoadEvent = c.event;
    if (e.source !== "street_manager") continue;
    const status = normStatus(c.works.workStatus);
    if (status === "completed" || status === "cancelled") continue;
    if (e.startAt && e.startAt.getTime() > t) continue; // not started yet
    if (e.endAt && e.endAt.getTime() <= t) continue; // already ended
    if (!pushWorthy(c.works) || disruptionTier(c.works) == null) continue;
    worksById.set(e.id, c.works);
    kept.push({ event: e, days: c.days });
  }
  if (kept.length === 0) return [];

  const groups = withoutDismissed(groupMatches(kept, opts.now), opts.dismissed ?? new Set());
  const entries: BriefingWorksEntry[] = [];
  for (const g of groups) {
    if (g.ongoing) continue;
    const name = shortStreetName(g.roads[0] ?? null);
    if (!name) continue;
    const metas = g.members.map((m) => worksById.get(m.event.id)).filter((w): w is WorksMeta => w != null);
    const lead = worksById.get(g.lead.id) ?? metas[0];
    if (!lead) continue;
    entries.push({
      group: g,
      tier: Math.min(...metas.map((w) => disruptionTier(w) ?? 3)),
      urgency: groupUrgency(g),
      trafficManagement: lead.trafficManagement,
      promoter: shortPromoter(lead.promoter),
      name,
    });
  }
  entries.sort((a, b) => a.tier - b.tier || b.urgency - a.urgency || b.group.days - a.group.days);
  return entries;
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** "Durham Road closed today (BT), plus 2 more". No full stop: the briefing
 *  joins its parts with ". ". Null when there is nothing to say. */
export function buildBriefingRoadworksLine(
  entries: BriefingWorksEntry[],
  opts: { withPromoter?: boolean } = {}
): string | null {
  const top = entries[0];
  if (!top) return null;
  const phrase = worksPhrase(top.trafficManagement, top.name);
  const lead =
    top.urgency === 2 ? `Emergency works: ${phrase}` : top.urgency === 1 ? `Urgent works: ${phrase}` : capitalise(phrase);
  const who = opts.withPromoter !== false && top.promoter ? ` (${top.promoter})` : "";
  const others = entries.length - 1;
  const more = others > 0 ? `, plus ${others} more` : "";
  return `${lead} today${who}${more}`;
}

/** The briefing parts with the roadworks line added, if it fits within
 *  `max` (dropping the works company first if that is what it takes). The
 *  parts come back unchanged when there is no line or it cannot fit. */
export function addRoadworksLine(
  parts: string[],
  entries: BriefingWorksEntry[],
  max: number = BRIEFING_BODY_MAX
): string[] {
  for (const withPromoter of [true, false]) {
    const line = buildBriefingRoadworksLine(entries, { withPromoter });
    if (!line) return parts;
    const next = [...parts, line];
    if (next.join(". ").length + 1 <= max) return next;
  }
  return parts;
}
