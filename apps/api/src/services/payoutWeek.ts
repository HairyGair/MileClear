// Apps that pay a week behind (Ben Turner, 22 Oct 2026).
//
// Deliveroo, Uber, Just Eat and the rest mostly pay last week's work into
// the bank this week. A bank payout was dated the day it landed, so "earned
// this week" showed last week's money. A driver can now say an app pays a
// week behind; its bank payouts are then dated to the 7 days before they
// landed. Typed-in, CSV and statement earnings are left alone: the driver
// already gave those their own dates.
//
// Never back past the start of the quarter it was received in. HMRC counts
// money when it is received, and a quarter already sent under Making Tax
// Digital must not change: a payout on 8 July starts on 6 July, not 1 July.
// Quarters start on the 6th (standard) or the 1st (calendar quarters) of
// January, April, July and October; the later of the two covers both.

import type { Prisma } from "@prisma/client";
import { GIG_PLATFORMS } from "@mileclear/shared";
import { prisma } from "../lib/prisma.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Apps that can be marked as paying a week behind. "Other" and
 *  "Freelance" aren't one payer, so they keep the date paid. */
export const ARREARS_PLATFORMS: readonly string[] = GIG_PLATFORMS.map((p) => p.value as string).filter(
  (v) => v !== "other" && v !== "freelance"
);

/** The stored list, cleaned: known apps only, no repeats. */
export function parseArrears(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return ARREARS_PLATFORMS.filter((p) => value.includes(p));
}

export async function arrearsPlatformsFor(userId: string): Promise<Set<string>> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { payoutsInArrears: true } });
  return new Set(parseArrears(user?.payoutsInArrears));
}

/** The dates a bank payout is recorded under. */
export function payoutPeriod(paidOn: Date, inArrears: boolean): { periodStart: Date; periodEnd: Date } {
  const day = Date.UTC(paidOn.getUTCFullYear(), paidOn.getUTCMonth(), paidOn.getUTCDate());
  if (!inArrears) return { periodStart: new Date(day), periodEnd: new Date(day) };
  const start = Math.max(day - 7 * DAY_MS, quarterStart(day));
  const end = Math.max(day - DAY_MS, start);
  return { periodStart: new Date(start), periodEnd: new Date(end) };
}

/** The latest 1st or 6th of Jan/Apr/Jul/Oct on or before the day (UTC ms). */
function quarterStart(day: number): number {
  const d = new Date(day);
  const y = d.getUTCFullYear();
  const q = d.getUTCMonth() - (d.getUTCMonth() % 3);
  return Math.max(...[Date.UTC(y, q, 6), Date.UTC(y, q, 1), Date.UTC(y, q - 3, 6)].filter((t) => t <= day));
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** Still on dates the bank gave it, either way round (not changed by hand). */
export function isBankDated(e: { periodStart: Date; periodEnd: Date }, paidOn: Date): boolean {
  return [false, true].some((arrears) => {
    const p = payoutPeriod(paidOn, arrears);
    return sameDay(e.periodStart, p.periodStart) && sameDay(e.periodEnd, p.periodEnd);
  });
}

/**
 * Moves one app's bank payouts already recorded to match the setting. Only
 * earnings still on the dates the bank gave them are moved, so dates a
 * driver changed by hand stay as they are. Returns how many moved.
 */
export async function redateBankEarnings(
  userId: string,
  platform: string,
  inArrears: boolean,
  db: Prisma.TransactionClient = prisma
): Promise<number> {
  const earnings = await db.earning.findMany({
    where: { userId, platform, source: "open_banking", externalId: { not: null } },
    select: { id: true, externalId: true, periodStart: true, periodEnd: true },
  });
  if (earnings.length === 0) return 0;

  // The sync stores the bank's id as the earning's; the inbox adds "inbox:".
  const bankId = (externalId: string) => (externalId.startsWith("inbox:") ? externalId.slice(6) : externalId);
  const txns = await db.bankTransaction.findMany({
    where: { userId, externalId: { in: earnings.map((e) => bankId(e.externalId!)) } },
    select: { externalId: true, transactionDate: true },
  });
  const paidOn = new Map(txns.map((t) => [t.externalId, t.transactionDate]));

  let moved = 0;
  for (const e of earnings) {
    const paid = paidOn.get(bankId(e.externalId!));
    if (!paid) continue;
    // Bank dates either way round (a platform changed by hand may sit on
    // either); hand-changed dates are left alone.
    if (!isBankDated(e, paid)) continue;
    const to = payoutPeriod(paid, inArrears);
    if (sameDay(e.periodStart, to.periodStart) && sameDay(e.periodEnd, to.periodEnd)) continue;
    await db.earning.update({ where: { id: e.id }, data: to });
    moved++;
  }
  return moved;
}
