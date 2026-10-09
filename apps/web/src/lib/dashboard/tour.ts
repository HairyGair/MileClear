// First-use tour: "have they seen it" state. Pure helpers, no DOM beyond the
// never-throw localStorage helpers, so they can be unit tested.
//
// Stored in localStorage per account and browser (no API field fits; see
// docs/web-rebuild-oct2026/SPEC-TOUR.md section 1.2):
//   mc_web_tour_v1:<userId> = { state: "done" | "skipped" | null, autoStarts: 0..2, at: ISO }

import { safeGet, safeSet } from "./mode";

export const TOUR_KEY_PREFIX = "mc_web_tour_v1:";

/** Day the rebuilt dashboard went live. Accounts created before it get the "new look" opening. */
export const NEW_DASHBOARD_LIVE_AT = "2026-10-12T00:00:00.000Z";

/** Automatic starts allowed per account and browser before it stays out of the way. */
export const MAX_AUTO_STARTS = 2;

export type TourEnd = "done" | "skipped";

export interface TourState {
  state: TourEnd | null;
  autoStarts: number;
  at: string | null;
}

export function tourKey(userId: string): string {
  return `${TOUR_KEY_PREFIX}${userId}`;
}

const EMPTY: TourState = { state: null, autoStarts: 0, at: null };

export function parseTourState(raw: string | null): TourState {
  if (!raw) return { ...EMPTY };
  try {
    const v = JSON.parse(raw) as Partial<TourState> | null;
    if (!v || typeof v !== "object") return { ...EMPTY };
    const n = typeof v.autoStarts === "number" && isFinite(v.autoStarts) ? Math.max(0, Math.floor(v.autoStarts)) : 0;
    return {
      state: v.state === "done" || v.state === "skipped" ? v.state : null,
      autoStarts: n,
      at: typeof v.at === "string" ? v.at : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function readTourState(userId: string, get: (k: string) => string | null = safeGet): TourState {
  return parseTourState(get(tourKey(userId)));
}

export function writeTourState(
  userId: string,
  patch: Partial<TourState>,
  opts: { get?: (k: string) => string | null; set?: (k: string, v: string) => void; now?: () => Date } = {}
): TourState {
  const get = opts.get ?? safeGet;
  const set = opts.set ?? safeSet;
  const next: TourState = {
    ...readTourState(userId, get),
    ...patch,
    at: (opts.now ? opts.now() : new Date()).toISOString(),
  };
  set(tourKey(userId), JSON.stringify(next));
  return next;
}

/** Rule 3 and 4 of the auto-start rules: not finished, and not offered twice already. */
export function shouldAutoStart(state: TourState): boolean {
  return state.state === null && state.autoStarts < MAX_AUTO_STARTS;
}

/** Created before the new dashboard went live (or unknown): the "new look" opening. */
export function isExistingAccount(createdAt: string | Date | null | undefined, liveAt: string = NEW_DASHBOARD_LIVE_AT): boolean {
  if (!createdAt) return true;
  const t = new Date(createdAt).getTime();
  if (!isFinite(t)) return true;
  return t < new Date(liveAt).getTime();
}
