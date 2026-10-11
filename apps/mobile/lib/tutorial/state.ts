// What this phone remembers about the first-run tour for the signed-in
// account, and the saves the tour makes. The rules are in ./rule.ts.
//
// Keys in tracking_state, per account (a shared phone or a second sign-in
// never inherits someone else's answer):
//   first_run:<userId>          pending | done | skipped | existing
//   first_run_starts:<userId>   how many times the tour started by itself
//   whats_new_seen:<userId>     the What's new version already handled
//   tour_pending_setup:<userId> a You drive for answer that couldn't upload yet

import type { DriveFor, User } from "@mileclear/shared";
import { driveForPatch } from "@mileclear/shared";
import { getDatabase } from "../db/index";
import { updateProfile, type UpdateProfileData } from "../api/user";
import { createVehicle, fetchVehicles } from "../api/vehicles";
import { fetchTripSummary } from "../api/trips";
import { decideFirstRun, isNewAccount, parseStored, type FirstRunStored } from "./rule";

async function readKey(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [key]);
  return row?.value ?? null;
}

async function writeKey(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [key, value]);
}

async function deleteKey(key: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM tracking_state WHERE key = ?", [key]);
}

export async function readFirstRunStored(userId: string): Promise<FirstRunStored | null> {
  return parseStored(await readKey(`first_run:${userId}`).catch(() => null));
}

export async function writeFirstRunStored(userId: string, value: FirstRunStored): Promise<void> {
  await writeKey(`first_run:${userId}`, value).catch(() => {});
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      }
    );
  });
}

/** The account's trip count from the server, else this phone's, else null. */
async function tripCount(): Promise<number | null> {
  const res = await withTimeout(fetchTripSummary(), 4000);
  if (res) return res.data.totalTrips;
  try {
    const db = await getDatabase();
    const hydrated = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM tracking_state WHERE key = 'hydration_complete'"
    );
    const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM trips");
    const n = row?.n ?? 0;
    // Trips on the phone settle it; an empty phone only does once the
    // account's trips have been copied down to it.
    if (n > 0) return n;
    return hydrated?.value === "1" ? 0 : null;
  } catch {
    return null;
  }
}

/** Who this phone's data belongs to (lib/db claimLocalDataFor), read without the network. */
export async function readLocalOwnerId(): Promise<string | null> {
  return readKey("local_data_owner_user_id").catch(() => null);
}

async function localTripCount(): Promise<number> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM trips");
    return row?.n ?? 0;
  } catch {
    return 0;
  }
}

/**
 * The answer without the network, when the phone already knows it: a stored
 * decision, or trips on the phone (an existing driver after the update).
 * Null means wait for the profile and call resolveFirstRun.
 */
export async function quickFirstRun(userId: string): Promise<"tour" | "home" | null> {
  const stored = await readFirstRunStored(userId);
  if (stored !== null) {
    const startsRaw = await readKey(`first_run_starts:${userId}`).catch(() => null);
    const autoStarts = Number(startsRaw ?? 0) || 0;
    const decision = decideFirstRun({ stored, autoStarts, isNew: null });
    if (decision.store) await writeFirstRunStored(userId, decision.store);
    if (decision.show === "tour") await writeKey(`first_run_starts:${userId}`, String(autoStarts + 1)).catch(() => {});
    return decision.show;
  }
  if ((await localTripCount()) > 0) {
    await writeFirstRunStored(userId, "existing");
    return "home";
  }
  return null;
}

/**
 * Does this account get the first-run tour now? Reads the phone first (one
 * SQLite read on every launch after the first), and only asks the server for
 * the trip count when the account is under a week old.
 */
export async function resolveFirstRun(user: Pick<User, "id" | "createdAt">): Promise<"tour" | "home"> {
  const stored = await readFirstRunStored(user.id);
  const startsRaw = await readKey(`first_run_starts:${user.id}`).catch(() => null);
  const autoStarts = Number(startsRaw ?? 0) || 0;
  let isNew: boolean | null = null;
  if (stored === null) {
    // Age first: an old account never needs the trip count.
    const byAge = isNewAccount({ createdAt: user.createdAt, tripCount: null, now: Date.now() });
    isNew = byAge === false ? false : isNewAccount({ createdAt: user.createdAt, tripCount: await tripCount(), now: Date.now() });
  }
  const decision = decideFirstRun({ stored, autoStarts, isNew });
  if (decision.store) await writeFirstRunStored(user.id, decision.store);
  if (decision.show === "tour") await writeKey(`first_run_starts:${user.id}`, String(autoStarts + 1)).catch(() => {});
  return decision.show;
}

// ── Telling the root layout the tour is over ──────────────────────────────
//
// The layout holds the decision in React state and uses it in the Stack's
// redirect props (as it did for the old onboarding, see the 26 Sep 2026 note
// that lived in lib/onboardingGate.ts): finishing must tell it before
// navigating, or Home is redirected straight back to the tour.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onFirstRunFinished(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyFirstRunFinished(): void {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      // one bad listener must not stop the others
    }
  }
}

// ── What's new ────────────────────────────────────────────────────────────

export async function readWhatsNewSeen(userId: string): Promise<string | null> {
  return readKey(`whats_new_seen:${userId}`).catch(() => null);
}

export async function writeWhatsNewSeen(userId: string, version: string): Promise<void> {
  await writeKey(`whats_new_seen:${userId}`, version).catch(() => {});
}

// ── Flags the tour sets so Home doesn't ask the same thing again ──────────

/** The tour asked for location: Home's location pop-up has nothing to add today. */
export async function markLocationAsked(): Promise<void> {
  await writeKey("loc_primer_seen", "1").catch(() => {});
  await writeKey("loc_primer_foreground_seen", "1").catch(() => {});
}

/** The tour asked for notifications: the after-trip Alert only shows to drivers who skipped (decision I). */
export async function markNotificationsAsked(): Promise<void> {
  await writeKey("notification_contextual_asked", "true").catch(() => {});
}

/** The last screen explained the Work | Personal switch, so its pop-up isn't needed. */
export async function markWorkExplainerSeen(): Promise<void> {
  await writeKey("work_explainer_seen", "1").catch(() => {});
}

/** The first split trip note shows once per phone. Returns true the first time. */
export async function claimFirstSplitNote(): Promise<boolean> {
  try {
    if (await readKey("first_split_note_seen")) return false;
    await writeKey("first_split_note_seen", "1");
    return true;
  } catch {
    return false;
  }
}

// ── Saving "You drive for" ────────────────────────────────────────────────

interface PendingSetup {
  profile?: UpdateProfileData;
  motorbike?: boolean;
  attempts?: number;
}

const MAX_SETUP_ATTEMPTS = 5;

async function applySetup(p: PendingSetup): Promise<PendingSetup | null> {
  const left: PendingSetup = {};
  if (p.profile) {
    try {
      await updateProfile(p.profile);
    } catch {
      left.profile = p.profile;
    }
  }
  if (p.motorbike) {
    // The rate follows the trip's vehicle, so a motorbike rider needs one on
    // the account to claim 24p, not the car rate. The old onboarding made the
    // same placeholder. Never a second vehicle: free accounts have one.
    try {
      const res = await fetchVehicles();
      if (res.data.length === 0) {
        await createVehicle({
          make: "My Motorbike",
          model: "(edit details)",
          vehicleType: "motorbike",
          fuelType: "petrol",
          isPrimary: true,
        });
      }
    } catch {
      left.motorbike = true;
    }
  }
  return left.profile || left.motorbike ? left : null;
}

/**
 * Save the answer through the existing profile update. If there's no signal
 * it waits on the phone and goes up on the next open (flushPendingSetup).
 * A car or van needs nothing saved: with no vehicle the car rate applies.
 */
export async function saveDriveFor(args: {
  userId: string;
  answer: DriveFor;
  motorbike: boolean;
  employerRatePence: number | null;
  currentDashboardMode: string | null | undefined;
}): Promise<"saved" | "queued"> {
  const profile: UpdateProfileData = { ...driveForPatch(args.answer, args.currentDashboardMode) };
  if ((args.answer === "employee" || args.answer === "both") && args.employerRatePence) {
    profile.employerMileageRatePence = args.employerRatePence;
  }
  const left = await applySetup({ profile, motorbike: args.motorbike });
  if (!left) {
    await deleteKey(`tour_pending_setup:${args.userId}`).catch(() => {});
    return "saved";
  }
  await writeKey(`tour_pending_setup:${args.userId}`, JSON.stringify({ ...left, attempts: 1 })).catch(() => {});
  return "queued";
}

/** Retry a tour answer that couldn't upload. Called on every signed-in launch. */
export async function flushPendingSetup(userId: string): Promise<boolean> {
  const key = `tour_pending_setup:${userId}`;
  const raw = await readKey(key).catch(() => null);
  if (!raw) return false;
  let pending: PendingSetup;
  try {
    pending = JSON.parse(raw) as PendingSetup;
  } catch {
    await deleteKey(key).catch(() => {});
    return false;
  }
  const left = await applySetup(pending);
  const attempts = (pending.attempts ?? 1) + 1;
  if (!left || attempts > MAX_SETUP_ATTEMPTS) {
    await deleteKey(key).catch(() => {});
  } else {
    await writeKey(key, JSON.stringify({ ...left, attempts })).catch(() => {});
  }
  return !left;
}
