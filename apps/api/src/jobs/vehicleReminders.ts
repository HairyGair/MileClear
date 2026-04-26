import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "../lib/push.js";
import { fetchDvlaVehicleInfo, DvlaError } from "../services/dvla.js";
import { logEvent } from "../services/appEvents.js";

// Days before expiry at which we start sending reminders.
const REMINDER_LEAD_DAYS = 14;

// Cooldown between consecutive reminders for the same expiry. 14 days means
// a driver gets at most one MOT reminder until they renew (or until the next
// tax year, whichever is sooner) - never spammed.
const REMINDER_COOLDOWN_DAYS = 14;

// Refresh DVLA data weekly. The expiry dates rarely change (only on MOT
// renewal or tax payment), so daily polling would waste DVLA API quota.
const DVLA_REFRESH_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntil(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((date.getTime() - Date.now()) / MS_PER_DAY);
}

function isStale(date: Date | null, maxAgeDays: number): boolean {
  if (!date) return true;
  return Date.now() - date.getTime() > maxAgeDays * MS_PER_DAY;
}

/**
 * Vehicle expiry reminder job.
 *
 * Twice per day (via the existing 6-hour notification interval, but gated
 * on a once-per-day check in AppEvent), this:
 *   1. Refreshes DVLA data for any primary vehicle whose lastDvlaCheckAt
 *      is older than 7 days.
 *   2. Pushes a notification when MOT or tax expires within 14 days,
 *      unless the user was already reminded in the last 14 days.
 *
 * Runs only on vehicles that have a registrationPlate set. The DVLA API
 * key must be configured (DVLA_API_KEY env var) - the job no-ops cleanly
 * if it isn't.
 */
export async function runVehicleRemindersJob(): Promise<void> {
  if (!process.env.DVLA_API_KEY) return;

  const vehicles = await prisma.vehicle.findMany({
    where: {
      isPrimary: true,
      registrationPlate: { not: null },
    },
    select: {
      id: true,
      userId: true,
      make: true,
      model: true,
      registrationPlate: true,
      motExpiryDate: true,
      taxDueDate: true,
      lastDvlaCheckAt: true,
      motReminderSentAt: true,
      taxReminderSentAt: true,
    },
  });

  let refreshed = 0;
  let mots = 0;
  let taxes = 0;

  for (const v of vehicles) {
    if (!v.registrationPlate) continue;

    let motExpiry = v.motExpiryDate;
    let taxDue = v.taxDueDate;

    // Refresh from DVLA if data is stale (or missing entirely).
    if (isStale(v.lastDvlaCheckAt, DVLA_REFRESH_DAYS)) {
      try {
        const info = await fetchDvlaVehicleInfo(v.registrationPlate);
        motExpiry = info.motExpiryDate ? new Date(info.motExpiryDate) : null;
        taxDue = info.taxDueDate ? new Date(info.taxDueDate) : null;
        await prisma.vehicle.update({
          where: { id: v.id },
          data: {
            motExpiryDate: motExpiry,
            taxDueDate: taxDue,
            lastDvlaCheckAt: new Date(),
          },
        });
        refreshed += 1;
      } catch (err) {
        // 404 (not found at DVLA) or auth issues - log and move on. Don't
        // bubble up; one bad plate shouldn't kill the whole job.
        if (err instanceof DvlaError) {
          console.warn(
            `[vehicle-reminders] DVLA fetch failed for ${v.registrationPlate}: ${err.message} (${err.status})`
          );
        } else {
          console.warn(`[vehicle-reminders] Unexpected error for ${v.registrationPlate}:`, err);
        }
        continue;
      }
    }

    // MOT reminder
    const motDaysOut = daysUntil(motExpiry);
    if (
      motDaysOut !== null &&
      motDaysOut <= REMINDER_LEAD_DAYS &&
      motDaysOut >= -3 && // also covers 1-3 days overdue (urgent)
      isStale(v.motReminderSentAt, REMINDER_COOLDOWN_DAYS)
    ) {
      const ticket = await sendPushToUser(
        v.userId,
        motDaysOut < 0 ? "MOT overdue" : "MOT due soon",
        motDaysOut < 0
          ? `Your ${v.make} ${v.model} MOT expired ${Math.abs(motDaysOut)} ${Math.abs(motDaysOut) === 1 ? "day" : "days"} ago. Driving without one is uninsured and a fixed-penalty offence.`
          : motDaysOut === 0
            ? `Your ${v.make} ${v.model} MOT expires today.`
            : `Your ${v.make} ${v.model} MOT expires in ${motDaysOut} ${motDaysOut === 1 ? "day" : "days"}.`,
        { action: "open_vehicle", vehicleId: v.id }
      );
      if (ticket) {
        await prisma.vehicle.update({
          where: { id: v.id },
          data: { motReminderSentAt: new Date() },
        });
        await logEvent("vehicle.mot_reminder_sent", v.userId, {
          vehicleId: v.id,
          daysOut: motDaysOut,
        });
        mots += 1;
      }
    }

    // Tax reminder
    const taxDaysOut = daysUntil(taxDue);
    if (
      taxDaysOut !== null &&
      taxDaysOut <= REMINDER_LEAD_DAYS &&
      taxDaysOut >= -3 &&
      isStale(v.taxReminderSentAt, REMINDER_COOLDOWN_DAYS)
    ) {
      const ticket = await sendPushToUser(
        v.userId,
        taxDaysOut < 0 ? "Vehicle tax overdue" : "Vehicle tax due soon",
        taxDaysOut < 0
          ? `Your ${v.make} ${v.model} tax expired ${Math.abs(taxDaysOut)} ${Math.abs(taxDaysOut) === 1 ? "day" : "days"} ago. Driving an untaxed vehicle is automatically detected by ANPR.`
          : taxDaysOut === 0
            ? `Your ${v.make} ${v.model} tax expires today.`
            : `Your ${v.make} ${v.model} tax expires in ${taxDaysOut} ${taxDaysOut === 1 ? "day" : "days"}.`,
        { action: "open_vehicle", vehicleId: v.id }
      );
      if (ticket) {
        await prisma.vehicle.update({
          where: { id: v.id },
          data: { taxReminderSentAt: new Date() },
        });
        await logEvent("vehicle.tax_reminder_sent", v.userId, {
          vehicleId: v.id,
          daysOut: taxDaysOut,
        });
        taxes += 1;
      }
    }
  }

  if (refreshed > 0 || mots > 0 || taxes > 0) {
    console.log(
      `[vehicle-reminders] refreshed=${refreshed} mot_pushes=${mots} tax_pushes=${taxes}`
    );
  }
}
