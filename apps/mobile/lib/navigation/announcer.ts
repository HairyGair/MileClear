// When to speak, and what (docs/navigation-1.4.0/DESIGN.md 3.4, timed to
// PLAN.md section 3's voice criteria).
//
// Speed bands, from speed smoothed over the last 5 seconds:
//   slow   (under 35 mph): half a mile only on a step over 0.75 mi; main at
//          about 250 yd (200 yd under 20 mph); "now" about 3 s out (25 m min).
//   medium (35 to 55 mph): 1 mile only on a step over 1.5 mi; half a mile;
//          about 350 m; "now" about 4 s out (30 m min).
//   fast   (over 55 mph): 1 mile (2 miles too for a keep on a step over 3 mi);
//          half a mile; about 450 m; "now" about 6 s out (60 to 160 m).
// "Now" triggers carry one extra second, because the next fix can be up to a
// second late; the prompt still starts at least the stated time before.
//
// Each tier is said at most once per manoeuvre. A tier that first becomes due
// below 70% of its distance is said with the real distance and counts as the
// tier below, and of two prompts due within 5 seconds only the nearer is said.
// The spoken distance is the real one, rounded as a sat nav rounds it.

import type { NavigationStep } from "@mileclear/shared";
import { METRES_PER_MILE } from "./geo";
import {
  departPhrase,
  followPhrase,
  inDistancePhrase,
  nowPhrase,
  thenPhrase,
} from "./phrases";

const MPH = 0.44704;
const HALF_MILE = 0.5 * METRES_PER_MILE;

export type Tier = "early2" | "early" | "main" | "near" | "now";
const RANK: Record<Tier, number> = { early2: 0, early: 1, main: 2, near: 3, now: 4 };
const ORDER: Tier[] = ["early2", "early", "main", "near", "now"];
/** Rank used for "Continue for" / "Follow the road for". */
const FOLLOW_RANK = -0.5;

/** A second manoeuvre this close (or this many seconds) after the first is joined on. */
export const THEN_GAP_M = 150;
export const THEN_GAP_S = 10;
/** Closer than this, the two are one prompt and the second gets no prompt of its own. */
export const MERGE_GAP_M = 20;
/** After a manoeuvre, a next one further than this gets "Follow the road for". */
export const FOLLOW_MIN_M = 2 * METRES_PER_MILE;
const SKIP_FRACTION = 0.7;
const COLLIDE_S = 5;

export type Band = "slow" | "medium" | "fast";

export function bandFor(speedMps: number | null | undefined): Band {
  const mph = Math.max(0, speedMps ?? 0) / MPH;
  if (mph > 55) return "fast";
  if (mph >= 35) return "medium";
  return "slow";
}

export type Triggers = Partial<Record<Tier, number>> & { now: number };

/** Trigger distances (metres) for one manoeuvre. */
export function triggerDistances(args: {
  speedMps: number | null | undefined;
  /** Length of the step leading to the manoeuvre. */
  stepLength: number;
  next: NavigationStep;
}): Triggers {
  const s = Math.max(0, args.speedMps ?? 0);
  const band = bandFor(s);
  const len = args.stepLength;
  const t: Triggers = { now: 0 };
  if (band === "slow") {
    if (len > 0.75 * METRES_PER_MILE) t.early = HALF_MILE;
    t.main = s < 20 * MPH ? 183 : 250;
    t.now = Math.max(25, s * 4);
  } else if (band === "medium") {
    if (len > 1.5 * METRES_PER_MILE) t.early = METRES_PER_MILE;
    t.main = HALF_MILE;
    t.near = 350;
    t.now = Math.max(30, s * 5);
  } else {
    if (args.next.type === "keep" && len > 3 * METRES_PER_MILE) t.early2 = 2 * METRES_PER_MILE;
    t.early = METRES_PER_MILE;
    t.main = HALF_MILE;
    t.near = 450;
    t.now = Math.min(160, Math.max(60, s * 7));
  }
  // Arriving: never "In 2 miles, you will arrive"; from the main prompt on.
  if (args.next.type === "arrive") {
    delete t.early2;
    delete t.early;
  }
  // A road-name change: once at the main distance and once at it.
  if (args.next.type === "continue") {
    delete t.early2;
    delete t.early;
    delete t.near;
  }
  return t;
}

export interface AnnouncerState {
  stepIndex: number;
  /** Highest tier already done for this manoeuvre, -1 for none. */
  rank: number;
  /** The previous prompt joined this manoeuvre on with "then". */
  chained: "near" | "merged" | null;
  /** No prompt yet on this route: "start" (Start) or "reroute" (a new route). */
  fresh: "start" | "reroute" | null;
}

export function initialAnnouncerState(fresh: "start" | "reroute" = "start"): AnnouncerState {
  return { stepIndex: -1, rank: -1, chained: null, fresh };
}

export interface AnnounceContext {
  stepIndex: number;
  /** The manoeuvre coming up (steps[stepIndex + 1]); null on the last step. */
  next: NavigationStep | null;
  distanceToNext: number;
  /** The step the car is on (its street is the road being followed). */
  current: NavigationStep | null;
  /** Length of the current step. */
  stepLength: number;
  after: NavigationStep | null;
  gapAfter: number | null;
  speedMps: number | null;
  arriveName?: string | null;
}

export interface Announcement {
  text: string;
  /** "now" prompts and arrival cut in; everything else waits its turn. */
  urgent: boolean;
  tier: Tier | "follow" | "depart";
}

function activeTiers(t: Triggers): Tier[] {
  return ORDER.filter((k) => t[k] != null);
}

function tierFor(d: number, t: Triggers): Tier | null {
  for (let i = ORDER.length - 1; i >= 0; i--) {
    const k = ORDER[i];
    const v = t[k];
    if (v != null && d <= v) return k;
  }
  return null;
}

function lowerTier(k: Tier, t: Triggers): Tier | null {
  const tiers = activeTiers(t);
  const i = tiers.indexOf(k);
  return i >= 0 && i + 1 < tiers.length ? tiers[i + 1] : null;
}

/** The prompt for a manoeuvre at a tier, with "then" when one follows closely. */
function promptText(tier: Tier, ctx: AnnounceContext, t: Triggers): { text: string; chained: AnnouncerState["chained"] } {
  const next = ctx.next!;
  const base =
    tier === "now"
      ? nowPhrase(next, { arriveName: ctx.arriveName })
      : inDistancePhrase(ctx.distanceToNext, next, { arriveName: ctx.arriveName });
  // "then" goes on the near and now prompts, or on the main prompt in the
  // slow band (it has no near).
  const lastBeforeNow = activeTiers(t).filter((k) => k !== "now").at(-1);
  const thenTier = tier === "now" || tier === "near" || tier === lastBeforeNow;
  const s = Math.max(1, ctx.speedMps ?? 0);
  const close =
    ctx.after != null &&
    ctx.gapAfter != null &&
    next.type !== "arrive" &&
    (ctx.gapAfter <= THEN_GAP_M || ctx.gapAfter / s <= THEN_GAP_S);
  if (thenTier && close && ctx.after) {
    return {
      text: base + thenPhrase(ctx.after),
      chained: ctx.after.type === "arrive" ? null : ctx.gapAfter! < MERGE_GAP_M ? "merged" : "near",
    };
  }
  return { text: base, chained: null };
}

export function announce(prev: AnnouncerState, ctx: AnnounceContext): { state: AnnouncerState; say: Announcement | null } {
  let state = prev;
  const newStep = ctx.stepIndex !== prev.stepIndex;
  if (newStep) {
    const rank = prev.chained === "merged" ? RANK.now : prev.chained === "near" ? RANK.near : -1;
    state = { stepIndex: ctx.stepIndex, rank, chained: null, fresh: prev.fresh };
  }
  const next = ctx.next;
  if (!next || next.type === "depart") return { state, say: null };
  if (next.type === "continue" && !next.streetName?.trim()) return { state, say: null };

  const d = ctx.distanceToNext;
  const t = triggerDistances({ speedMps: ctx.speedMps, stepLength: ctx.stepLength, next });
  const tier = tierFor(d, t);

  // Start: "Head along Station Road" when nothing is due yet.
  if (state.fresh === "start") {
    state = { ...state, fresh: null };
    if (tier == null) {
      const startAt = ctx.current?.type === "depart" ? ctx.current : null;
      return {
        state: { ...state, rank: d > FOLLOW_MIN_M ? FOLLOW_RANK : state.rank },
        say: { text: departPhrase(startAt, d), urgent: false, tier: "depart" },
      };
    }
  }

  // A new route: its first instruction straight away, with distance.
  if (state.fresh === "reroute") {
    state = { ...state, fresh: null };
    if (tier == null) {
      return {
        state: { ...state, rank: FOLLOW_RANK },
        say: { text: inDistancePhrase(d, next, { arriveName: ctx.arriveName }), urgent: false, tier: "main" },
      };
    }
  }

  if (tier == null) {
    // Just round a corner onto a long road: "Follow the A1 for 6 miles", once.
    if (newStep && prev.stepIndex >= 0 && state.rank < FOLLOW_RANK && d > FOLLOW_MIN_M) {
      return {
        state: { ...state, rank: FOLLOW_RANK },
        say: { text: followPhrase(ctx.current?.streetName ?? null, d), urgent: false, tier: "follow" },
      };
    }
    return { state, say: null };
  }

  const rank = RANK[tier];
  if (rank <= state.rank) return { state, say: null };

  // Arriving: the navigator says "You have arrived" when it happens.
  if (next.type === "arrive" && tier === "now") return { state: { ...state, rank }, say: null };

  if (tier !== "now") {
    const lower = lowerTier(tier, t);
    // Two prompts within 5 seconds: only the nearer one.
    if (lower) {
      const s = Math.max(1, ctx.speedMps ?? 0);
      const secsToLower = (d - (t[lower] as number)) / s;
      if (secsToLower < COLLIDE_S) return { state: { ...state, rank }, say: null };
    }
    // Due late (a short step): say it now, counted as the tier below.
    const trig = t[tier] as number;
    const counted = d < SKIP_FRACTION * trig && lower && lower !== "now" ? RANK[lower] : rank;
    const p = promptText(tier, ctx, t);
    return {
      state: { ...state, rank: counted, chained: p.chained },
      say: { text: p.text, urgent: false, tier },
    };
  }

  const p = promptText("now", ctx, t);
  return { state: { ...state, rank, chained: p.chained }, say: { text: p.text, urgent: true, tier: "now" } };
}

/** What a banner tap, the end of a call or turning the voice on says: the
 *  current instruction with its distance. Null when nothing is close enough. */
export function currentInstruction(
  ctx: Pick<AnnounceContext, "next" | "distanceToNext" | "arriveName">,
  maxMetres = Infinity
): string | null {
  const next = ctx.next;
  if (!next || next.type === "depart") return null;
  if (ctx.distanceToNext > maxMetres) return null;
  if (ctx.distanceToNext < 25) return nowPhrase(next, { arriveName: ctx.arriveName });
  return inDistancePhrase(ctx.distanceToNext, next, { arriveName: ctx.arriveName });
}

export const HALF_MILE_M = HALF_MILE;
