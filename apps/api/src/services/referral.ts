// Referral program service (28 May 2026).
//
// Mechanics (locked with Anthony 28 May):
//  - Each user has a unique shareable `referralCode`.
//  - A friend signs up with the code -> a `pending` Referral row is created.
//  - When that friend records their FIRST real (non-phantom) trip, the
//    referrer earns 1 free month of Pro. Qualifying on first-trip (not signup)
//    is the anti-fraud measure: fake accounts that never drive never pay out.
//  - Single-sided: only the referrer is rewarded.
//  - Capped at 3 rewards (3 months) per referrer.
//  - The free month is BANKED in `users.referralProUntil`, never written to
//    the Stripe/Apple subscription columns. Effective premium = active
//    subscription OR referral credit (see resolvePremiumStatus). So a paying
//    user's earned months simply extend a date that kicks in if they lapse,
//    and a referral month can never corrupt real subscription tracking.

import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "../lib/push.js";
import { logEvent } from "./appEvents.js";

export const MAX_REFERRAL_REWARDS = 3;
const REWARD_MONTHS = 1;
export const APPLY_WINDOW_DAYS = 7;

// Unambiguous alphabet (no 0/O/1/I/L) so codes are easy to read aloud / type.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 7;

const PUBLIC_BASE_URL = process.env.PUBLIC_WEB_URL || "https://mileclear.com";

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Add whole calendar months to a date (clamps to month length). */
function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  return d;
}

export interface PremiumStatus {
  active: boolean;
  source: "subscription" | "referral" | "none";
  /** The relevant expiry for the active source (for display). */
  until: Date | null;
}

/**
 * Single source of truth for "is this user Pro right now?". ORs an active
 * paid subscription with banked referral credit. Subscription always wins as
 * the reported source when both are active (it's the user's real plan).
 *
 * Pass the four columns; callers select exactly these.
 */
export function resolvePremiumStatus(user: {
  isPremium: boolean;
  premiumExpiresAt: Date | null;
  referralProUntil: Date | null;
}): PremiumStatus {
  const now = Date.now();
  const subscriptionActive =
    user.isPremium && (user.premiumExpiresAt == null || user.premiumExpiresAt.getTime() > now);
  const referralActive =
    user.referralProUntil != null && user.referralProUntil.getTime() > now;

  if (subscriptionActive) {
    return { active: true, source: "subscription", until: user.premiumExpiresAt };
  }
  if (referralActive) {
    return { active: true, source: "referral", until: user.referralProUntil };
  }
  return { active: false, source: "none", until: null };
}

/** Get the user's referral code, generating + persisting one on first use. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (existing?.referralCode) return existing.referralCode;

  // Generate with collision retry against the unique index.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    try {
      await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch {
      // Unique violation (collision) or a race where another request set it.
      const refreshed = await prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (refreshed?.referralCode) return refreshed.referralCode;
      // else loop and try a fresh code
    }
  }
  throw new Error("Could not generate a unique referral code");
}

export interface AttachResult {
  ok: boolean;
  reason?: "invalid_code" | "self_referral" | "already_referred" | "window_closed" | "already_active";
}

/**
 * Attach a referral to a referee (the new/invited user). Used both inline at
 * registration (window check skipped) and by the post-signup catch-up endpoint
 * (window enforced). Creates a `pending` Referral; the reward is granted later
 * when the referee records their first trip.
 */
export async function attachReferral(
  refereeId: string,
  rawCode: string,
  opts: { enforceWindow: boolean }
): Promise<AttachResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "invalid_code" };

  const referrer = await prisma.user.findUnique({
    where: { referralCode: code },
    select: { id: true },
  });
  if (!referrer) return { ok: false, reason: "invalid_code" };
  if (referrer.id === refereeId) return { ok: false, reason: "self_referral" };

  // A user can be referred at most once (enforced by the unique index too).
  const existing = await prisma.referral.findUnique({
    where: { refereeId },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "already_referred" };

  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { createdAt: true },
  });
  if (!referee) return { ok: false, reason: "invalid_code" };

  if (opts.enforceWindow) {
    const ageMs = Date.now() - referee.createdAt.getTime();
    if (ageMs > APPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      return { ok: false, reason: "window_closed" };
    }
  }

  try {
    await prisma.$transaction([
      prisma.referral.create({
        data: { referrerId: referrer.id, refereeId, code, status: "pending" },
      }),
      prisma.user.update({ where: { id: refereeId }, data: { referredByCode: code } }),
    ]);
  } catch {
    // Lost a race on the unique refereeId — treat as already referred.
    return { ok: false, reason: "already_referred" };
  }

  logEvent("referral.attached", refereeId, { code, referrerId: referrer.id });
  return { ok: true };
}

/**
 * Called after a referee records their first real (non-phantom) trip. Grants
 * the referrer a banked free month if they're under the cap. Idempotent: only
 * acts on a still-`pending` referral, so repeat calls are no-ops.
 */
export async function qualifyReferralOnFirstTrip(refereeId: string): Promise<void> {
  const referral = await prisma.referral.findUnique({ where: { refereeId } });
  if (!referral || referral.status !== "pending") return;

  // Count this referrer's already-granted rewards.
  const rewarded = await prisma.referral.count({
    where: { referrerId: referral.referrerId, status: "qualified" },
  });

  if (rewarded >= MAX_REFERRAL_REWARDS) {
    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: "over_cap" },
    });
    logEvent("referral.over_cap", referral.referrerId, { refereeId, code: referral.code });
    return;
  }

  // Grant the month: extend referralProUntil from max(now, existing).
  const referrer = await prisma.user.findUnique({
    where: { id: referral.referrerId },
    select: { referralProUntil: true, displayName: true },
  });
  if (!referrer) return;

  const base =
    referrer.referralProUntil && referrer.referralProUntil.getTime() > Date.now()
      ? referrer.referralProUntil
      : new Date();
  const newUntil = addMonths(base, REWARD_MONTHS);

  // Double-sided (11 Jun 2026): the referee gets a month too. The single-sided
  // version ran two weeks with 75 code-holders and ZERO conversions — the
  // invitee had no reason to use the code over just installing. Same banked
  // referralProUntil field, so resolvePremiumStatus needs no change and real
  // subscriptions are never touched. One month, once: a referee has exactly
  // one referral row (refereeId unique), and this path only runs on the
  // pending→qualified transition.
  const referee = await prisma.user.findUnique({
    where: { id: refereeId },
    select: { referralProUntil: true },
  });
  const refereeBase =
    referee?.referralProUntil && referee.referralProUntil.getTime() > Date.now()
      ? referee.referralProUntil
      : new Date();
  const refereeUntil = addMonths(refereeBase, REWARD_MONTHS);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: referral.referrerId },
      data: { referralProUntil: newUntil },
    }),
    prisma.user.update({
      where: { id: refereeId },
      data: { referralProUntil: refereeUntil },
    }),
    prisma.referral.update({
      where: { id: referral.id },
      data: { status: "qualified", rewardGrantedAt: new Date() },
    }),
  ]);

  logEvent("referral.qualified", referral.referrerId, {
    refereeId,
    code: referral.code,
    rewardNumber: rewarded + 1,
    referralProUntil: newUntil.toISOString(),
    refereeProUntil: refereeUntil.toISOString(),
  });

  // Notify the referrer — money-moment, deep-link to the referrals screen.
  sendPushToUser(
    referral.referrerId,
    "You earned a free month of Pro!",
    `A friend you invited just started using MileClear. ${rewarded + 1} of ${MAX_REFERRAL_REWARDS} free months unlocked.`,
    { action: "open_referrals" }
  ).catch(() => {});

  // And the referee — their welcome month just unlocked.
  sendPushToUser(
    refereeId,
    "Your free month of Pro is live!",
    "First trip recorded — your invite bonus has unlocked a month of MileClear Pro. HMRC exports, business insights, the lot.",
    { action: "open_billing" }
  ).catch(() => {});
}

export interface ReferralSummary {
  code: string;
  shareUrl: string;
  maxRewards: number;
  earnedMonths: number;
  pendingCount: number;
  referralProUntil: string | null;
  referrals: Array<{ status: string; createdAt: string; rewardGrantedAt: string | null }>;
}

/** Everything the invite screen needs in one call. */
export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const code = await ensureReferralCode(userId);
  const [user, referrals] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { referralProUntil: true } }),
    prisma.referral.findMany({
      where: { referrerId: userId },
      select: { status: true, createdAt: true, rewardGrantedAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const earnedMonths = referrals.filter((r) => r.status === "qualified").length;
  const pendingCount = referrals.filter((r) => r.status === "pending").length;

  return {
    code,
    shareUrl: `${PUBLIC_BASE_URL}/r/${code}`,
    maxRewards: MAX_REFERRAL_REWARDS,
    earnedMonths,
    pendingCount,
    referralProUntil: user?.referralProUntil?.toISOString() ?? null,
    referrals: referrals.map((r) => ({
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      rewardGrantedAt: r.rewardGrantedAt?.toISOString() ?? null,
    })),
  };
}
