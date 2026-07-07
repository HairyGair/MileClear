// Server-enforced push notification preferences (8 Jul 2026).
//
// Until now these lived ONLY in the phone's local SQLite, so server-sent
// pushes (fuel alerts, recaps, streaks, briefings) could not be opted out
// of at all — the churned subscriber who received a 3am fuel push every
// night for weeks had no off switch. Mobile now syncs its preference JSON
// to User.pushPrefs; jobs check it via the pure helper below.
//
// Null / missing key = ENABLED (the historical behaviour, and safe for
// keys added later). Deliberately NOT enforced for: billing/subscription
// notices, diagnostic "your tracking is broken" alerts, and admin sends —
// those are functional, not preference material.

import type { Prisma } from "@prisma/client";

export const PUSH_PREF_KEYS = [
  "weeklySummary",
  "unclassifiedNudge",
  "shiftReminder",
  "streakReminder",
  "taxDeadline",
  "milestoneAlerts",
  "shiftSummary",
  "monthlyRecap",
  "autoTripLiveActivity",
  "fuelAlert",
  "morningBriefing",
] as const;

export type PushPrefKey = (typeof PUSH_PREF_KEYS)[number];

/** Pure check against a user's stored prefs JSON — usable inside job
 *  loops without extra queries (select pushPrefs alongside pushToken). */
export function pushPrefEnabled(
  prefs: Prisma.JsonValue | null | undefined,
  key: PushPrefKey
): boolean {
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return true;
  const v = (prefs as Record<string, unknown>)[key];
  return v !== false;
}
