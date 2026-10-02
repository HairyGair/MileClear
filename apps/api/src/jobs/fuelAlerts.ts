// Opt-in fuel pushes (2 Oct 2026).
//
//   Morning, petrol/diesel: "Cheapest diesel near you today"
//     "139.9p at Tesco Gateshead, 6p under the local average and 4p under the
//      UK average. About £3.00 less on 50 litres."
//   Monday, electric: "Your EV running costs last week"
//     "142 miles in your Tesla Model 3: about £9.94 charged at home (7p a
//      mile), or £31.24 on public rapid chargers at 77p/kWh."
//
// Both are OFF unless the driver turned them on (pushPrefs.cheapestFuelDaily /
// evWeeklySummary, read with pushPrefOptedIn). They replace the old
// runFuelPriceAlertJob, which went to everyone with a saved location every
// morning whatever the prices were, and printed the price divided by ten
// ("13.9p/L").
//
// Scheduling: the 30-minute windowed runner in jobs/notifications.ts. Each
// job returns at once outside its UK-time window (cheapestFuelRule.ts), and
// an AppEvent per send stops a second push the same day / week.
//
// Every push sets data.action: open_fuel (fuel tab, where the same line sits
// at the top) or open_charging (nearby chargers and the running-cost card).

import { prisma } from "../lib/prisma.js";
import { sendPushNotifications, type ExpoPushMessage } from "../lib/push.js";
import { pushPrefOptedIn } from "../services/pushPrefs.js";
import { isPushQuietHours } from "../services/pushQuietHoursRule.js";
import { logEvent } from "../services/appEvents.js";
import { localClock, localDayBounds } from "./eveningDigest.js";
import {
  EV_WEEKLY_EVENT,
  FUEL_ALERT_EVENT,
  evRatesFor,
  loadDriverContexts,
  loadLastFuelAlerts,
  nationalAverageFor,
  selectForDriver,
} from "../services/cheapestFuel.js";
import {
  buildEvWeeklyCopy,
  buildFuelAlertCopy,
  inEvWeeklyWindow,
  inFuelAlertWindow,
  type FuelDecision,
} from "../services/cheapestFuelRule.js";

const BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface FuelAlertJobResult {
  candidates: number;
  sent: number;
  skipped: Record<string, number>;
}

/** The opted-in drivers with a push token. The JSON path filter does the
 *  heavy lifting in MySQL; pushPrefOptedIn re-checks in JS. */
async function optedInUserIds(key: "cheapestFuelDaily" | "evWeeklySummary"): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      pushToken: { not: null },
      pushPrefs: { path: `$.${key}`, equals: true },
    },
    select: { id: true, pushPrefs: true },
  });
  return rows.filter((r) => pushPrefOptedIn(r.pushPrefs, key)).map((r) => r.id);
}

async function sendAndLog(
  messages: ExpoPushMessage[],
  events: { type: string; userId: string; metadata: Record<string, unknown> }[]
): Promise<number> {
  if (messages.length === 0) return 0;
  const tickets = await sendPushNotifications(messages);
  let ok = 0;
  tickets.forEach((t, i) => {
    // Only a delivered push counts as today's alert, so a failed send is
    // retried on the next tick inside the window.
    if (t.status !== "ok") return;
    ok++;
    logEvent(events[i].type, events[i].userId, events[i].metadata);
  });
  return ok;
}

export async function runCheapestFuelAlertJob(now: Date = new Date()): Promise<FuelAlertJobResult | void> {
  if (!inFuelAlertWindow(localClock(now).hour)) return;
  // Belt and braces: the window already sits outside quiet hours, but a held
  // push must never be recorded as sent.
  if (isPushQuietHours(now)) return;

  const ids = await optedInUserIds("cheapestFuelDaily");
  const result: FuelAlertJobResult = { candidates: ids.length, sent: 0, skipped: {} };
  if (ids.length === 0) return result;
  const skip = (why: string) => (result.skipped[why] = (result.skipped[why] ?? 0) + 1);

  const today = localDayBounds(now);
  // Start of yesterday (UK): step back half a day from today's midnight.
  const yesterdayStart = localDayBounds(new Date(today.start.getTime() - 12 * 60 * 60 * 1000)).start;
  const [petrolAvg, dieselAvg] = await Promise.all([nationalAverageFor("E10"), nationalAverageFor("B7")]);

  for (const batch of chunk(ids, BATCH_SIZE)) {
    const [contexts, lastAlerts] = await Promise.all([
      loadDriverContexts(batch, now),
      loadLastFuelAlerts(batch, yesterdayStart),
    ]);

    const messages: ExpoPushMessage[] = [];
    const events: { type: string; userId: string; metadata: Record<string, unknown> }[] = [];

    for (const ctx of contexts) {
      if (!ctx.pushToken) { skip("no_token"); continue; }
      if (!ctx.fuelPath) { skip(ctx.vehicle ? "unknown_fuel_type" : "no_vehicle"); continue; }
      if (ctx.fuelPath.path !== "fuel") { skip("electric"); continue; }
      if (!ctx.start) { skip("no_start_point"); continue; }
      const prior = lastAlerts.get(ctx.userId);
      if (prior && prior.at >= today.start) { skip("already_sent_today"); continue; }

      const sel = await selectForDriver(ctx, {
        nowMs: now.getTime(),
        lastAlert: prior?.last ?? null,
        nationalAveragePence: ctx.fuelPath.key === "E10" ? petrolAvg : dieselAvg,
      });
      const decision: FuelDecision | "no_selection" = sel?.decision ?? "no_selection";
      if (!sel || decision !== "send" || !sel.cheapest) { skip(decision); continue; }

      const copy = buildFuelAlertCopy(ctx.fuelPath.label, sel);
      if (!copy) { skip("no_copy"); continue; }
      messages.push({
        to: ctx.pushToken,
        title: copy.title,
        body: copy.body,
        sound: "default",
        data: { type: "fuel_alert", action: "open_fuel" },
      });
      events.push({
        type: FUEL_ALERT_EVENT,
        userId: ctx.userId,
        metadata: {
          siteId: sel.cheapest.siteId,
          station: sel.cheapest.name,
          pencePerLitre: sel.cheapest.pencePerLitre,
          fuel: ctx.fuelPath.label,
          localAveragePence: sel.localAveragePence,
          underLocalPence: sel.underLocalPence,
          radiusMiles: sel.radiusMiles,
          stationCount: sel.stationCount,
          startSource: ctx.start.source,
        },
      });
    }

    result.sent += await sendAndLog(messages, events);
  }

  console.log(
    `[jobs/fuelAlerts] ${today.key}: cheapest-fuel sent ${result.sent} of ${result.candidates} opted in; ` +
      `skipped ${JSON.stringify(result.skipped)}`
  );
  return result;
}

export async function runEvWeeklySummaryJob(now: Date = new Date()): Promise<FuelAlertJobResult | void> {
  const clock = localClock(now);
  if (!inEvWeeklyWindow(clock)) return;
  if (isPushQuietHours(now)) return;

  const ids = await optedInUserIds("evWeeklySummary");
  const result: FuelAlertJobResult = { candidates: ids.length, sent: 0, skipped: {} };
  if (ids.length === 0) return result;
  const skip = (why: string) => (result.skipped[why] = (result.skipped[why] ?? 0) + 1);

  // Last week = the previous UK Monday 00:00 to this Monday 00:00.
  const weekEnd = localDayBounds(now).start;
  const weekStart = localDayBounds(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)).start;

  for (const batch of chunk(ids, BATCH_SIZE)) {
    const [contexts, sentThisWeek, trips] = await Promise.all([
      loadDriverContexts(batch, now),
      prisma.appEvent.findMany({
        where: { type: EV_WEEKLY_EVENT, userId: { in: batch }, createdAt: { gte: weekEnd } },
        select: { userId: true },
      }),
      prisma.trip.findMany({
        where: { userId: { in: batch }, startedAt: { gte: weekStart, lt: weekEnd } },
        select: { userId: true, vehicleId: true, distanceMiles: true },
      }),
    ]);
    const already = new Set(sentThisWeek.map((e) => e.userId));

    const messages: ExpoPushMessage[] = [];
    const events: { type: string; userId: string; metadata: Record<string, unknown> }[] = [];

    for (const ctx of contexts) {
      if (!ctx.pushToken) { skip("no_token"); continue; }
      if (ctx.fuelPath?.path !== "ev" || !ctx.vehicle) { skip("not_electric"); continue; }
      if (already.has(ctx.userId)) { skip("already_sent_this_week"); continue; }

      // Miles in the EV: trips tagged to it, plus untagged trips (most trips
      // carry no vehicle, and the EV is their primary).
      const vehicleId = ctx.vehicle.id;
      const miles = trips
        .filter((t) => t.userId === ctx.userId && (t.vehicleId == null || t.vehicleId === vehicleId))
        .reduce((sum, t) => sum + t.distanceMiles, 0);

      const rates = await evRatesFor(ctx);
      const copy = buildEvWeeklyCopy({
        ...rates,
        miles,
        vehicleName: `${ctx.vehicle.make} ${ctx.vehicle.model}`.trim() || null,
      });
      if (!copy) { skip("no_driving"); continue; }

      messages.push({
        to: ctx.pushToken,
        title: copy.title,
        body: copy.body,
        sound: "default",
        data: { type: "ev_weekly_summary", action: "open_charging" },
      });
      events.push({
        type: EV_WEEKLY_EVENT,
        userId: ctx.userId,
        metadata: {
          miles: Math.round(miles * 10) / 10,
          milesPerKwh: rates.milesPerKwh,
          homePencePerKwh: rates.homePencePerKwh,
          homeRateSource: rates.homeRateSource,
          publicPencePerKwh: rates.publicPencePerKwh,
        },
      });
    }

    result.sent += await sendAndLog(messages, events);
  }

  console.log(
    `[jobs/fuelAlerts] EV weekly sent ${result.sent} of ${result.candidates} opted in; ` +
      `skipped ${JSON.stringify(result.skipped)}`
  );
  return result;
}
