// Clean Air Zone "pay by tomorrow" pushes (Pro, Oct 2026), from Ticket
// defender's "Charges to pay" list.
//
// 18:00 to 18:59 UK on the evening before a zone's pay-by deadline, for each
// charge the driver has not ticked as paid:
//
//   "Clean Air Zone charge due tomorrow"
//   "Your trip on Tue 29 Sep went into the Birmingham Clean Air Zone. If you
//    need to pay the £8.00 daily charge, pay by 11:59pm tomorrow."
//
// data.action = open_ticket_defender (older bundles fall through to the
// dashboard). Only zones with a verified deadline rule are reminded about.
//
// Respect, in code:
//   - Pro only (isProUser, same rule as premiumMiddleware);
//   - the cazPayReminder push preference (on unless turned off);
//   - one push per charge (deduped on the sent event), outside quiet hours.
//
// Gate: CAZ_PAY_PUSH. Nothing sends unless it is exactly "1". Unset, the job
// runs as a DRY RUN once a day: it logs how many it would send and three
// sample bodies, writes nothing and sends nothing.

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { pushPrefEnabled } from "../services/pushPrefs.js";
import { isPushQuietHours } from "../services/pushQuietHoursRule.js";
import { logEvent } from "../services/appEvents.js";
import { isProUser } from "../services/proEntitlement.js";
import { chargeableVehicles, listCazCharges } from "../services/cazCharges.js";
import { cazDeadlineIsTomorrow, formatPence, ukDate, ukDateParts, ukDayOf, type CazChargeItem } from "@mileclear/shared";

export const CAZ_PAY_PUSH_EVENT = "notification.caz_pay";
export const CAZ_PAY_ACTION = "open_ticket_defender";
export const CAZ_PAY_PUSH_HOUR = 18;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Longest pay window (6 days after) plus a day. */
const LOOKBACK_DAYS = 8;

export function cazPayPushEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CAZ_PAY_PUSH === "1";
}

/** Charges worth a reminder tonight: unpaid, verified deadline tomorrow. */
export function chargesDueTomorrow(items: CazChargeItem[], now: Date): CazChargeItem[] {
  return items.filter((c) => c.status === "due" && cazDeadlineIsTomorrow(c.deadline, now));
}

export function buildCazPayTitle(count: number): string {
  return count === 1 ? "Clean Air Zone charge due tomorrow" : `${count} Clean Air Zone charges due tomorrow`;
}

export function buildCazPayBody(items: CazChargeItem[]): string {
  const first = items[0];
  const when = first.zoneId === "london-ulez" ? "by midnight tomorrow" : "by 11:59pm tomorrow";
  if (items.length === 1) {
    return `Your trip on ${ukDate(first.travelDay + "T12:00:00Z", false)} went into the ${first.zoneName}. If you need to pay the ${formatPence(first.chargePence)} daily charge, pay ${when}.`;
  }
  const zones = [...new Set(items.map((i) => i.zoneName))].join(" and ");
  return `Trips into the ${zones} may need paying for ${when}. Tap to see them and tick off any you've paid.`;
}

let lastDryRunDay: string | null = null;

export async function runCazPayRemindersJob(now: Date = new Date()): Promise<void> {
  if (ukDateParts(now).hour !== CAZ_PAY_PUSH_HOUR) return;
  if (isPushQuietHours(now)) return;
  const live = cazPayPushEnabled();
  const today = ukDayOf(now);
  if (!live && lastDryRunDay === today) return;

  // Narrow fast: vehicles that could be charged, with a trip in the window.
  const vehicles = chargeableVehicles(
    await prisma.vehicle.findMany({
      where: { user: { pushToken: { not: null } } },
      select: { id: true, userId: true, euroStatus: true, fuelType: true, firstRegistration: true, vehicleType: true },
    })
  );
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);
  const userIds = new Set<string>();
  const vehicleIds = vehicles.map((v) => v.id);
  for (let i = 0; i < vehicleIds.length; i += 1000) {
    const rows = await prisma.trip.groupBy({
      by: ["userId"],
      where: { vehicleId: { in: vehicleIds.slice(i, i + 1000) }, isPhantomTrip: false, startedAt: { gte: since } },
      _count: { _all: true },
    });
    for (const r of rows) userIds.add(r.userId);
  }

  const users = userIds.size
    ? await prisma.user.findMany({ where: { id: { in: [...userIds] }, pushToken: { not: null } }, select: { id: true, pushToken: true, pushPrefs: true } })
    : [];

  const sentRows = await prisma.appEvent.findMany({
    where: { type: CAZ_PAY_PUSH_EVENT, createdAt: { gte: since } },
    select: { userId: true, metadata: true },
  });
  const sent = new Set<string>();
  for (const r of sentRows) {
    const key = (r.metadata as { key?: unknown } | null)?.key;
    if (r.userId && typeof key === "string") sent.add(`${r.userId}|${key}`);
  }

  const plan: { userId: string; pushToken: string; items: CazChargeItem[] }[] = [];
  let prefOff = 0;
  let notPro = 0;
  for (const u of users) {
    if (!pushPrefEnabled(u.pushPrefs, "cazPayReminder")) {
      prefOff++;
      continue;
    }
    if (!(await isProUser(u.id))) {
      notPro++;
      continue;
    }
    const items = chargesDueTomorrow(await listCazCharges(u.id, now, { sinceDays: LOOKBACK_DAYS }), now).filter(
      (c) => !sent.has(`${u.id}|${c.key}`)
    );
    if (items.length > 0) plan.push({ userId: u.id, pushToken: u.pushToken!, items });
  }

  if (!live) {
    lastDryRunDay = today;
    const samples = plan
      .slice(0, 3)
      .map((p) => `${p.userId.slice(0, 8)}: ${buildCazPayBody(p.items)}`)
      .join(" | ");
    console.log(
      `[jobs/cazPay] DRY RUN ${today}: would send ${plan.length} (candidates ${users.length}; pref off ${prefOff}; not Pro ${notPro}). Samples: ${samples || "none"}`
    );
    return;
  }

  const messages: ExpoPushMessage[] = plan.map((p) => ({
    to: p.pushToken,
    title: buildCazPayTitle(p.items.length),
    body: buildCazPayBody(p.items),
    sound: "default",
    data: { type: "caz_pay", action: CAZ_PAY_ACTION, keys: p.items.map((i) => i.key) },
  }));
  // Log before sending so a crash mid-send cannot cause a repeat next tick.
  for (const p of plan) for (const i of p.items) logEvent(CAZ_PAY_PUSH_EVENT, p.userId, { key: i.key, zoneId: i.zoneId });
  if (messages.length > 0) await sendPushNotifications(messages);
  console.log(`[jobs/cazPay] ${today}: sent ${messages.length} (pref off ${prefOff}; not Pro ${notPro}).`);
}
