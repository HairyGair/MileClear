// Milesheet free trial (4 Oct 2026). Built but OFF: trials only start while
// MILESHEET_NEW_TEAMS is "open" (services/milesheetNewTeams.ts), and the
// default is "waitlist". Pure rules only, tested in
// __tests__/services/teamTrial.test.ts.
//
// A team started while new teams are open gets trialEndsAt = now + 30 days.
// Until then it is entitled like a free pilot: every active member gets
// team Pro (services/proEntitlement.ts). When the trial ends without a
// subscription the team keeps all its data, but team Pro stops and the
// portal says "Your free trial has ended" with a subscribe button.

import type { NewTeamsMode } from "./milesheetNewTeams.js";

export const TEAM_TRIAL_DAYS = 30;
/** Same ceiling a free pilot gets: a free trial must not cover a 400-driver fleet. */
export const TEAM_TRIAL_SEAT_CAP = 20;
/** Reminder emails go this many days before the trial ends. */
export const TRIAL_REMINDER_DAYS = [7, 1] as const;
export type TrialReminderStage = (typeof TRIAL_REMINDER_DAYS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Stripe refuses a trial_end less than 48 hours away. */
const STRIPE_MIN_TRIAL_MS = 48 * 60 * 60 * 1000;

/**
 * When a new team's trial ends, or null for no trial. No trial while new
 * teams are on the waiting list (only admins create teams then, and they
 * choose pilot or paid), and one trial per person: someone who has already
 * started a trial team does not get another by starting a second one.
 */
export function trialEndsAtForNewTeam(
  mode: NewTeamsMode,
  now: Date,
  opts: { creatorHadTrial: boolean }
): Date | null {
  if (mode !== "open") return null;
  if (opts.creatorHadTrial) return null;
  return new Date(now.getTime() + TEAM_TRIAL_DAYS * DAY_MS);
}

export interface OrgEntitlementFields {
  pilotFree: boolean;
  stripeSubscriptionId: string | null;
  trialEndsAt: Date | null;
}

export function isTrialActive(trialEndsAt: Date | null, now: Date): boolean {
  return !!trialEndsAt && trialEndsAt.getTime() > now.getTime();
}

/** Does membership of this team grant Pro right now? */
export function isOrgEntitled(org: OrgEntitlementFields, now: Date): boolean {
  return org.pilotFree || !!org.stripeSubscriptionId || isTrialActive(org.trialEndsAt, now);
}

/**
 * The Prisma `where` on Organisation that matches isOrgEntitled. Kept next
 * to it so the query and the rule cannot drift apart.
 */
export function entitledOrgWhere(now: Date) {
  return {
    OR: [
      { pilotFree: true },
      { stripeSubscriptionId: { not: null } },
      { trialEndsAt: { gt: now } },
    ],
  };
}

export type TrialState = "none" | "active" | "ended";

/**
 * "ended" only when the trial is over AND nothing else covers the team: a
 * pilot or a subscribed team whose trial date has passed is just a pilot or
 * a subscribed team.
 */
export function trialStateOf(org: OrgEntitlementFields, now: Date): TrialState {
  if (!org.trialEndsAt) return "none";
  if (org.pilotFree || org.stripeSubscriptionId) return "none";
  return isTrialActive(org.trialEndsAt, now) ? "active" : "ended";
}

/** Whole days left, rounded up (23 hours left is "1 day"), never below 0. */
export function trialDaysLeft(trialEndsAt: Date | null, now: Date): number | null {
  if (!trialEndsAt) return null;
  const ms = trialEndsAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / DAY_MS);
}

/**
 * Which reminder is due now, or null. 7: the trial ends within 7 days but
 * more than 1. 1: it ends within a day. The job runs every 6 hours and
 * dedupes on (org, stage), so each stage goes once; if the 7-day one was
 * missed because the trial was already inside its last day, only the 1-day
 * one goes. Nothing for a team that is not on an active trial.
 */
export function trialReminderStage(org: OrgEntitlementFields, now: Date): TrialReminderStage | null {
  if (trialStateOf(org, now) !== "active") return null;
  const ms = org.trialEndsAt!.getTime() - now.getTime();
  if (ms <= 1 * DAY_MS) return 1;
  if (ms <= 7 * DAY_MS) return 7;
  return null;
}

/** Off unless exactly "1", like the other reminder gates. */
export function trialEmailsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MILESHEET_TRIAL_EMAILS === "1";
}

/**
 * Unix seconds to pass as Stripe's subscription_data.trial_end, so a team
 * that subscribes part-way through its trial is not charged until the trial
 * it was promised is over. Undefined when there is no active trial or it
 * ends too soon for Stripe to accept (under 48 hours).
 */
export function stripeTrialEndFor(trialEndsAt: Date | null, now: Date): number | undefined {
  if (!trialEndsAt) return undefined;
  if (trialEndsAt.getTime() - now.getTime() < STRIPE_MIN_TRIAL_MS) return undefined;
  return Math.floor(trialEndsAt.getTime() / 1000);
}
