// When to speak, and what. Each upcoming manoeuvre gets up to four prompts,
// each said once: about 1 mile out on fast roads, half a mile, a few hundred
// yards, and at the turn. The trigger distances scale with speed so a prompt
// leaves the same few seconds to react at 30 mph and at 70.
//
// The spoken distance is the real one at the moment of speaking, rounded the
// way a sat nav rounds it, so "In 300 yards" means about 300 yards.

import type { NavigationStep } from "@mileclear/shared";
import { METRES_PER_MILE } from "./geo";
import { followPhrase, inDistancePhrase, nowPhrase, thenPhrase } from "./phrases";

export type Tier = "follow" | "far" | "mid" | "near" | "now";
const RANK: Record<Tier, number> = { follow: 0, far: 1, mid: 2, near: 3, now: 4 };

/** A second manoeuvre this close after the first is joined on: "..., then turn left". */
export const THEN_GAP_M = 150;
/** After a turn onto a road this long, say "Continue for 3 miles". */
export const FOLLOW_MIN_M = 1.5 * METRES_PER_MILE;

export interface Triggers {
  now: number;
  near: number;
  /** null: too slow for a half-mile prompt to help. */
  mid: number | null;
  /** null: not a fast road. */
  far: number | null;
}

export function triggerDistances(speedMps: number | null | undefined): Triggers {
  const s = Math.max(0, speedMps ?? 0);
  return {
    // About 4 s before the turn, never less than 25 m.
    now: Math.min(120, Math.max(25, s * 4)),
    // About 18 s out: ~250 yards at 30 mph, capped near a quarter mile.
    near: Math.min(450, Math.max(150, s * 18)),
    mid: s >= 8 ? 0.5 * METRES_PER_MILE : null,
    // About 45 mph and up.
    far: s >= 20 ? METRES_PER_MILE : null,
  };
}

export interface AnnouncerState {
  /** The step whose next manoeuvre these prompts are for. */
  stepIndex: number;
  /** Highest tier already said for it, -1 for none. */
  rank: number;
  /** Something was said for this manoeuvre (so "now" can drop the street). */
  saidAny: boolean;
  /** The previous prompt already said "then <this manoeuvre>". */
  chained: boolean;
  /** No prompt yet on this route (start, or just rerouted). */
  fresh: boolean;
}

export function initialAnnouncerState(): AnnouncerState {
  return { stepIndex: -1, rank: -1, saidAny: false, chained: false, fresh: true };
}

export interface AnnounceContext {
  /** The step the car is on. */
  stepIndex: number;
  /** The manoeuvre coming up (steps[stepIndex + 1]); null on the last step. */
  next: NavigationStep | null;
  /** Metres to that manoeuvre. */
  distanceToNext: number;
  /** The manoeuvre after it, and the gap between the two. */
  after: NavigationStep | null;
  gapAfter: number | null;
  speedMps: number | null;
}

function tierFor(d: number, t: Triggers): Tier | null {
  if (d <= t.now) return "now";
  if (d <= t.near) return "near";
  if (t.mid != null && d <= t.mid) return "mid";
  if (t.far != null && d <= t.far) return "far";
  return null;
}

export function announce(
  prev: AnnouncerState,
  ctx: AnnounceContext
): { state: AnnouncerState; speak: string | null } {
  let state = prev;
  const newStep = ctx.stepIndex !== prev.stepIndex;
  if (newStep) {
    state = {
      stepIndex: ctx.stepIndex,
      rank: prev.chained ? RANK.near : -1,
      saidAny: prev.chained,
      chained: false,
      fresh: prev.fresh,
    };
  }
  const next = ctx.next;
  if (!next || next.type === "depart") return { state, speak: null };

  const d = ctx.distanceToNext;
  const tier = tierFor(d, triggerDistances(ctx.speedMps));

  // A name change along the same road ("continue onto ..."): said once, near
  // it, and only when there is a name to say.
  if (next.type === "continue") {
    if (!next.streetName?.trim() || state.rank >= RANK.near) return { state, speak: null };
    if (tier === "near" || tier === "now") {
      return {
        state: { ...state, rank: RANK.now, saidAny: true, fresh: false },
        speak: `Continue onto ${next.streetName.trim()}`,
      };
    }
    return { state, speak: null };
  }

  if (tier == null) {
    // Long road ahead: one "Continue for 3 miles" right after the turn onto
    // it, or at the start. Fresh routes with a closer turn get a distance.
    if (state.rank >= RANK.follow) return { state, speak: null };
    if (d >= FOLLOW_MIN_M && (newStep || state.fresh)) {
      return { state: { ...state, rank: RANK.follow, fresh: false }, speak: followPhrase(d) };
    }
    if (state.fresh) {
      return {
        state: { ...state, rank: RANK.follow, saidAny: true, fresh: false },
        speak: inDistancePhrase(d, next),
      };
    }
    return { state, speak: null };
  }

  const rank = RANK[tier];
  if (rank <= state.rank) return { state, speak: null };

  if (next.type === "arrive") {
    // The arrival itself is said by the navigator when it happens.
    if (tier === "now") return { state: { ...state, rank, fresh: false }, speak: null };
    return {
      state: { ...state, rank, saidAny: true, fresh: false },
      speak: inDistancePhrase(d, next),
    };
  }

  let text = tier === "now" ? nowPhrase(next, { saidBefore: state.saidAny }) : inDistancePhrase(d, next);
  let chained = false;
  if ((tier === "near" || tier === "now") && ctx.after && ctx.gapAfter != null && ctx.gapAfter <= THEN_GAP_M) {
    text += thenPhrase(ctx.after);
    chained = ctx.after.type !== "arrive";
  }
  return { state: { ...state, rank, saidAny: true, chained, fresh: false }, speak: text };
}
