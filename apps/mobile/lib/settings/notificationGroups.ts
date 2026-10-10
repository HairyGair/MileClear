// The Notifications screen's switches, grouped by REASON (what the alert is
// about) rather than by timing: About your trips, Tax and money, Your car and
// fuel, Roads, Your progress, Summaries. One list drives the screen, the
// "12 of 15 on" count and the free-driver teaser, so they cannot drift.

import type { NotificationPreferences } from "../notifications/preferences";

export interface NotificationItem {
  key: keyof NotificationPreferences;
  icon: string;
  label: string;
  hint: string;
  /** Pro drivers only; free drivers see one teaser for all of these. */
  pro?: boolean;
}

export interface NotificationGroup {
  title: string;
  items: NotificationItem[];
}

export const NOTIFICATION_GROUPS: NotificationGroup[] = [
  {
    title: "About your trips",
    items: [
      { key: "unclassifiedNudge", icon: "alert-circle-outline", label: "Trip reminders", hint: "A nudge to sort trips you haven't reviewed" },
      { key: "autoTripLiveActivity", icon: "phone-portrait-outline", label: "Show a trip on your lock screen", hint: "A live card on your lock screen while MileClear records a drive" },
      { key: "shiftReminder", icon: "time-outline", label: "Shift alerts", hint: "A warning if a shift runs over 12 hours" },
      { key: "shiftSummary", icon: "clipboard-outline", label: "End-of-shift summary", hint: "Your numbers when you end a shift", pro: true },
    ],
  },
  {
    title: "Tax and money",
    items: [
      { key: "taxDeadline", icon: "receipt-outline", label: "Tax deadlines", hint: "Tax year end, 31 January and tax payment reminders" },
    ],
  },
  {
    title: "Your car and fuel",
    items: [
      { key: "cheapestFuelDaily", icon: "water-outline", label: "Cheapest fuel near me each morning", hint: "Only when a station near where you set off is at least 3p a litre under the local average" },
      { key: "evWeeklySummary", icon: "flash-outline", label: "Electric car running costs each Monday", hint: "Last week's miles costed at your home rate and on public rapid chargers" },
      { key: "cazPayReminder", icon: "leaf-outline", label: "Clean Air Zone pay-by reminders", hint: "The evening before a charge is due, if you haven't ticked it as paid", pro: true },
    ],
  },
  {
    title: "Roads",
    items: [
      { key: "roadAlerts", icon: "warning-outline", label: "Road alerts on my usual roads (trial)", hint: "A heads-up before you usually set off if a road you use often is closed or badly delayed. At most one a day" },
    ],
  },
  {
    title: "Your progress",
    items: [
      { key: "streakReminder", icon: "flame-outline", label: "Streak reminders", hint: "A nudge to keep your driving streak going" },
      { key: "milestoneAlerts", icon: "trophy-outline", label: "Mileage milestones", hint: "A cheer when you hit a mileage milestone", pro: true },
    ],
  },
  {
    title: "Summaries",
    items: [
      { key: "morningBriefing", icon: "sunny-outline", label: "Morning briefing", hint: "Yesterday's miles and today's outlook, around 8am" },
      { key: "eveningDigest", icon: "moon-outline", label: "Evening summary", hint: "Today's trips and miles, around 7pm" },
      { key: "weeklySummary", icon: "calendar-outline", label: "Weekly summary", hint: "Your miles every Monday morning", pro: true },
      { key: "monthlyRecap", icon: "stats-chart-outline", label: "Monthly recap", hint: "Your month in review on the 1st", pro: true },
    ],
  },
];

/** Groups with only the rows this driver can use (free drivers lose the Pro rows). */
export function visibleNotificationGroups(isPremium: boolean): NotificationGroup[] {
  return NOTIFICATION_GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => isPremium || !i.pro),
  })).filter((g) => g.items.length > 0);
}

/** How many Pro-only switches a free driver is not shown. */
export function hiddenProCount(isPremium: boolean): number {
  if (isPremium) return 0;
  return NOTIFICATION_GROUPS.reduce((n, g) => n + g.items.filter((i) => i.pro).length, 0);
}

/** "12 of 15 on": switches on out of the ones this driver can see. */
export function countNotifications(
  prefs: NotificationPreferences,
  isPremium: boolean
): { on: number; total: number } {
  const items = visibleNotificationGroups(isPremium).flatMap((g) => g.items);
  return { on: items.filter((i) => prefs[i.key]).length, total: items.length };
}
