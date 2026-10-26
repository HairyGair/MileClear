// Milesheet month-end nudge (26 Oct 2026): a team driver with trips still
// to sort hears about it before their manager approves the month.
//
//   "October ends on Saturday"
//   "Maids Of Glory approves your October business miles next. You have 14
//    trips to sort first."
//
// Why: a manager can only approve business miles, and on 26 Oct many team
// drivers' months were mostly unsorted (one team: 1,085 miles recorded, 21
// marked Business). The month-ready email goes to managers on the 1st; this
// goes to drivers two days before the month ends, in the evening, when
// drivers sort trips.
//
// Who: drivers in a team with a manager (active, or invited: a driver who
// nominated their manager is waiting in the team too), with 1 or more
// unsorted trips this month. One per driver per month (the sent event is the
// dedup). A push when the driver has a push token and hasn't turned off
// sorting reminders; otherwise an email.
//
// Gate: TEAM_MONTH_END_NUDGE. Nothing sends unless it is exactly "1". Unset,
// the job runs in its window as a DRY RUN: it logs how many it would send.

import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { pushPrefEnabled } from "../services/pushPrefs.js";
import { sendAdminEmail } from "../services/email.js";
import { londonMonthBounds } from "../services/teamExport.js";

export const TEAM_MONTH_END_NUDGE_TZ = "Europe/London";
/** Days before the month's last day the nudge may go (2 = from the 29th of a 31-day month). */
export const TEAM_MONTH_END_DAYS_BEFORE = 2;
/** Local hour from which it may go: the evening, when drivers sort trips. */
export const TEAM_MONTH_END_HOUR = 18;

export function teamMonthEndEvent(month: string): string {
  return `team.month_end_nudge_${month}`;
}

interface LondonClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  lastDay: number;
}

export function londonClock(now: Date): LondonClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TEAM_MONTH_END_NUDGE_TZ,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, day: Number(parts.day), hour: Number(parts.hour), lastDay };
}

/** True from 18:00 UK on the day TEAM_MONTH_END_DAYS_BEFORE before the month's last day. */
export function inMonthEndWindow(c: LondonClock): boolean {
  return c.day >= c.lastDay - TEAM_MONTH_END_DAYS_BEFORE && c.hour >= TEAM_MONTH_END_HOUR;
}

/** "Saturday" for the last day of the month, or "tonight" on the day itself. */
export function monthEndsWhen(c: LondonClock): string {
  if (c.day === c.lastDay) return "tonight";
  if (c.day === c.lastDay - 1) return "tomorrow";
  return `on ${new Date(Date.UTC(c.year, c.month - 1, c.lastDay)).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}`;
}

/** "2026-10" for the clock's month. */
export function clockMonth(c: LondonClock): string {
  return `${c.year}-${String(c.month).padStart(2, "0")}`;
}

export function monthName(c: LondonClock): string {
  return new Date(Date.UTC(c.year, c.month - 1, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
}

export function buildMonthEndNudge(c: LondonClock, orgName: string, count: number) {
  const name = monthName(c);
  const trips = count === 1 ? "1 trip" : `${count} trips`;
  return {
    title: `${name} ends ${monthEndsWhen(c)}`,
    body: `${orgName} approves your ${name} business miles next. You have ${trips} to sort first.`,
    emailSubject: `Sort your ${name} trips before ${orgName} approves them`,
    emailText:
      `Hi,\n\n${name} ends ${monthEndsWhen(c)}, and ${orgName} approves your ${name} business miles after that. ` +
      `Only trips marked Business count, and you have ${trips} this month still to sort.\n\n` +
      `Open MileClear and go to Trips > To sort. If your work follows set hours, More > Settings > Work hours can sort them for you.\n\n` +
      `MileClear`,
  };
}

export interface MonthEndRecipient {
  userId: string;
  email: string;
  pushToken: string | null;
  pushPrefs: unknown;
  orgName: string;
  count: number;
}

/** Drivers to nudge this month: in a team with a manager, unsorted trips, not yet nudged. */
export async function planMonthEndNudges(now: Date): Promise<MonthEndRecipient[]> {
  const month = clockMonth(londonClock(now));
  const { start, end } = londonMonthBounds(month);

  const memberships = await prisma.orgMembership.findMany({
    where: { role: "driver", status: { in: ["active", "invited"] }, userId: { not: null } },
    select: {
      userId: true,
      org: {
        select: {
          name: true,
          memberships: { where: { role: "admin", status: { in: ["active", "invited"] } }, select: { id: true } },
        },
      },
    },
  });
  const byUser = new Map<string, string>();
  for (const m of memberships) {
    if (!m.userId || m.org.memberships.length === 0 || byUser.has(m.userId)) continue;
    byUser.set(m.userId, m.org.name);
  }
  if (byUser.size === 0) return [];
  const ids = [...byUser.keys()];

  const already = await prisma.appEvent.findMany({
    where: { type: teamMonthEndEvent(month), userId: { in: ids } },
    select: { userId: true },
  });
  const done = new Set(already.map((e) => e.userId));

  const counts = await prisma.trip.groupBy({
    by: ["userId"],
    where: {
      userId: { in: ids.filter((id) => !done.has(id)) },
      classification: "unclassified",
      isPhantomTrip: false,
      startedAt: { gte: start, lt: end },
    },
    _count: true,
  });
  if (counts.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: counts.map((c) => c.userId) } },
    select: { id: true, email: true, pushToken: true, pushPrefs: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const out: MonthEndRecipient[] = [];
  for (const c of counts) {
    const u = userMap.get(c.userId);
    if (!u || c._count < 1) continue;
    out.push({
      userId: u.id,
      email: u.email,
      pushToken: u.pushToken,
      pushPrefs: u.pushPrefs,
      orgName: byUser.get(u.id)!,
      count: c._count,
    });
  }
  return out;
}

let lastDryRunDay: string | null = null;

export async function runTeamMonthEndNudgeJob(now: Date = new Date()): Promise<void> {
  const clock = londonClock(now);
  if (!inMonthEndWindow(clock)) return;
  const live = process.env.TEAM_MONTH_END_NUDGE === "1";
  const dayKey = `${clock.year}-${clock.month}-${clock.day}`;
  if (!live && lastDryRunDay === dayKey) return;

  const month = clockMonth(clock);
  const plan = await planMonthEndNudges(now);

  if (!live) {
    lastDryRunDay = dayKey;
    const sample = plan[0] ? buildMonthEndNudge(clock, plan[0].orgName, plan[0].count).body : "none";
    console.log(`[jobs/teamMonthEndNudge] DRY RUN ${dayKey}: would nudge ${plan.length} team driver(s). Sample: ${sample}`);
    return;
  }

  const pushes: ExpoPushMessage[] = [];
  let emails = 0;
  for (const r of plan) {
    const msg = buildMonthEndNudge(clock, r.orgName, r.count);
    const byPush = !!r.pushToken && pushPrefEnabled(r.pushPrefs as Prisma.JsonValue, "unclassifiedNudge");
    try {
      // Written first and awaited: a failed write would leave no dedup row
      // and the driver would be nudged again on the next tick.
      await prisma.appEvent.create({
        data: { type: teamMonthEndEvent(month), userId: r.userId, metadata: { count: r.count, via: byPush ? "push" : "email" } },
      });
    } catch (err) {
      console.error(`[jobs/teamMonthEndNudge] could not record the nudge for ${r.userId.slice(0, 8)}:`, err);
      continue;
    }
    if (byPush) {
      pushes.push({
        to: r.pushToken!,
        title: msg.title,
        body: msg.body,
        sound: "default",
        // Routed by every app build in the field: lands in Trips > To sort.
        data: { type: "team_month_end", action: "open_unclassified_trips" },
      });
    } else {
      try {
        await sendAdminEmail({
          to: r.email,
          subject: msg.emailSubject,
          text: msg.emailText,
          html: msg.emailText
            .split(/\n{2,}/)
            .map((p) => `<p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">${escapeHtml(p)}</p>`)
            .join(""),
        });
        emails++;
      } catch (err) {
        console.error(`[jobs/teamMonthEndNudge] email failed for ${r.userId.slice(0, 8)}:`, err);
      }
    }
  }
  if (pushes.length > 0) await sendPushNotifications(pushes);
  console.log(`[jobs/teamMonthEndNudge] ${dayKey}: ${pushes.length} push(es), ${emails} email(s) for ${month}.`);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
