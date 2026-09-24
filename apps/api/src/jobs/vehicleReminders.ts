import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "../lib/push.js";
import { fetchDvlaVehicleInfo, DvlaError } from "../services/dvla.js";
import { logEvent } from "../services/appEvents.js";
import { suggestPlateCorrection, displayPlate } from "../services/plateSuggestion.js";

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

// Gap between DVLA calls. Sent back to back, a run of a couple of hundred
// plates hit the DVLA's rate limit on 22 Sep 2026 and every refused plate
// then waited a week. One a second keeps a normal run to a few minutes.
export const DVLA_CALL_GAP_MS = 1000;

// A run stops asking the DVLA after this many failures in a row that are
// not about the plate (network, 5xx, auth): the DVLA is down, not the plates.
const MAX_UPSTREAM_FAILURES_IN_A_ROW = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      dvlaPlateProblem: true,
      dvlaPlateSuggestion: true,
      motReminderSentAt: true,
      taxReminderSentAt: true,
    },
  });

  let refreshed = 0;
  let mots = 0;
  let taxes = 0;
  let plateProblems = 0;
  let deferred = 0;
  let dvlaCalls = 0;
  let upstreamFailuresInARow = 0;
  // Set when the DVLA refuses us (rate limit) or looks down. The rest of the
  // run skips refreshing and still sends reminders from the dates we hold;
  // untouched plates stay stale, so the next run (6 h later) tries them.
  let stopRefreshing: string | null = null;

  /** One paced DVLA call. */
  const lookUp = async (plate: string) => {
    if (dvlaCalls > 0) await sleep(DVLA_CALL_GAP_MS);
    dvlaCalls += 1;
    return fetchDvlaVehicleInfo(plate);
  };

  for (const v of vehicles) {
    if (!v.registrationPlate) continue;

    let motExpiry = v.motExpiryDate;
    let taxDue = v.taxDueDate;

    // Refresh from DVLA if data is stale (or missing entirely).
    if (!stopRefreshing && isStale(v.lastDvlaCheckAt, DVLA_REFRESH_DAYS)) {
      try {
        const info = await lookUp(v.registrationPlate);
        upstreamFailuresInARow = 0;
        motExpiry = info.motExpiryDate ? new Date(info.motExpiryDate) : null;
        taxDue = info.taxDueDate ? new Date(info.taxDueDate) : null;
        await prisma.vehicle.update({
          where: { id: v.id },
          data: {
            motExpiryDate: motExpiry,
            taxDueDate: taxDue,
            // Backfill emissions data for Clean Air Zone compliance on the
            // existing fleet (vehicles added before this feature shipped).
            euroStatus: info.euroStatus,
            firstRegistration: info.monthOfFirstRegistration,
            lastDvlaCheckAt: new Date(),
            dvlaPlateProblem: null,
            dvlaPlateSuggestion: null,
          },
        });
        refreshed += 1;
      } catch (err) {
        if (err instanceof DvlaError && err.isPlateProblem) {
          // The plate itself: no retry will help until the driver edits it
          // (editing clears lastDvlaCheckAt, so the next run looks again).
          // Check weekly in case the DVLA's record appears, and tell the
          // driver once, the first time.
          upstreamFailuresInARow = 0;
          const outcome = await recordPlateProblem(v, err.kind as "not_found" | "invalid", lookUp);
          if (outcome === "stop") {
            stopRefreshing = "rate_limited";
          } else {
            plateProblems += 1;
          }
          continue;
        }

        // Not the plate's fault. Leave lastDvlaCheckAt alone so the next run
        // retries, and keep whatever dates we already hold for the reminders.
        deferred += 1;
        if (err instanceof DvlaError && err.kind === "rate_limited") {
          stopRefreshing = "rate_limited";
        } else {
          upstreamFailuresInARow += 1;
          if (
            (err instanceof DvlaError && (err.kind === "auth" || err.kind === "config")) ||
            upstreamFailuresInARow >= MAX_UPSTREAM_FAILURES_IN_A_ROW
          ) {
            stopRefreshing = err instanceof DvlaError ? err.kind : "unexpected";
          }
          if (!(err instanceof DvlaError)) {
            console.warn(`[vehicle-reminders] Unexpected error for ${v.registrationPlate}:`, err);
          }
        }
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

  if (stopRefreshing) {
    const left = vehicles.filter(
      (v) => v.registrationPlate && isStale(v.lastDvlaCheckAt, DVLA_REFRESH_DAYS)
    ).length;
    console.warn(
      `[vehicle-reminders] stopped asking the DVLA (${stopRefreshing}) after ${dvlaCalls} calls; up to ${left} plates wait for the next run`
    );
  }
  if (refreshed > 0 || mots > 0 || taxes > 0 || plateProblems > 0 || deferred > 0) {
    console.log(
      `[vehicle-reminders] refreshed=${refreshed} plate_problems=${plateProblems} deferred=${deferred} mot_pushes=${mots} tax_pushes=${taxes}`
    );
  }
}

type PlateVehicle = {
  id: string;
  userId: string;
  make: string;
  model: string;
  registrationPlate: string | null;
  dvlaPlateProblem: string | null;
  dvlaPlateSuggestion: string | null;
};

/**
 * Store what is wrong with a plate, look for a look-alike correction the DVLA
 * knows, and tell the driver the first time. Returns "stop" when checking the
 * suggestion hit the DVLA's rate limit, in which case nothing is stored and
 * the plate is looked at again next run.
 */
async function recordPlateProblem(
  v: PlateVehicle,
  problem: "not_found" | "invalid",
  lookUp: (plate: string) => Promise<unknown>
): Promise<"recorded" | "stop"> {
  const plate = v.registrationPlate as string;

  let suggestion: string | null = null;
  const candidate = suggestPlateCorrection(plate);
  if (candidate) {
    try {
      await lookUp(candidate);
      suggestion = candidate;
    } catch (err) {
      if (err instanceof DvlaError && err.kind === "rate_limited") return "stop";
      // Unknown to the DVLA too, or the DVLA hiccuped: no suggestion.
    }
  }

  const firstTime = v.dvlaPlateProblem == null;
  await prisma.vehicle.update({
    where: { id: v.id },
    data: {
      lastDvlaCheckAt: new Date(),
      dvlaPlateProblem: problem,
      dvlaPlateSuggestion: suggestion,
    },
  });

  if (firstTime) {
    const shown = displayPlate(plate);
    const lead =
      problem === "not_found"
        ? `The DVLA has no record of ${shown}, so we can't remind you about MOT and tax.`
        : `The DVLA doesn't recognise ${shown} as a UK number plate, so we can't remind you about MOT and tax.`;
    const body = suggestion
      ? `${lead} Did you mean ${displayPlate(suggestion)}? Tap to check.`
      : `${lead} Tap to check the plate.`;
    const ticket = await sendPushToUser(v.userId, "Check your number plate", body, {
      action: "open_vehicle",
      vehicleId: v.id,
    });
    await logEvent("vehicle.plate_problem_found", v.userId, {
      vehicleId: v.id,
      problem,
      hasSuggestion: suggestion != null,
      pushed: Boolean(ticket),
    });
  }
  return "recorded";
}
