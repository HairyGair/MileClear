// Eligibility and dismissal for the Home asks that own their own state:
// "where did you hear", odometer, employer, shift suggestion, vehicle, and the
// quiet-for-the-day rule. The asks that already live in the dashboard (saved
// places, Pro, referral, Android beta) are passed in from there.
//
// Every read is best-effort. Where the answer is unknown the ask stays quiet:
// better silent than asking twice. The order they appear in is lib/home/ask.ts.

import { useCallback, useEffect, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { acquisitionAskEligible } from "../AcquisitionSourceCard";
import type { UpdateReadingVehicle } from "../odometer/UpdateReadingSheet";
import { getDatabase } from "../../lib/db/index";
import { fetchVehicles } from "../../lib/api/vehicles";
import { fetchShiftSuggestions, type ShiftSuggestion } from "../../lib/api/shifts";
import { shouldShowOdometerPrompt } from "../../lib/odometer/logic";
import { NOMINATE_PROMPT_STATE_KEY } from "../../lib/nominateManager";
import { isQuietToday } from "../../lib/home/ask";
import { createTtlCache } from "../../lib/home/ttlCache";
import { fetchPracticeLinks } from "../../lib/api/practice";
import { pickHomePracticeAsk, type HomePracticeAsk } from "../../lib/practice/logic";
import { takePendingConsent } from "../../lib/practice/pending";
import { NZ_BALANCE_DATE_ASK_KEY, nzBalanceDateAskDue, nzBalanceDateWindowYear } from "../../lib/country/nzBalanceDate";

const QUIET_KEY = "home_ask_dismissed_at";
const VEHICLE_SNOOZE_KEY = "home_vehicle_ask_dismissed_at";
const ODOMETER_DISMISSED_KEY = "odometer_prompt_dismissed";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function readKey(key: string): Promise<string | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [key]);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function writeKey(key: string, value: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [key, value]);
  } catch {
    // best-effort
  }
}

/** "Once an ask is dismissed, the next waits until tomorrow." */
export function useAskQuietDay(): { quietToday: boolean; markDismissedToday: () => void } {
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    readKey(QUIET_KEY).then((v) => {
      const n = v ? parseInt(v, 10) : NaN;
      setAt(Number.isFinite(n) ? n : null);
    });
  }, []);
  const markDismissedToday = useCallback(() => {
    const now = Date.now();
    setAt(now);
    writeKey(QUIET_KEY, String(now));
  }, []);
  return { quietToday: isQuietToday(at, Date.now()), markDismissedToday };
}

/** "Where did you hear about MileClear?" (first 30 days, once). */
export function useAcquisitionAsk(createdAt: string | null | undefined): { eligible: boolean; recheck: () => void } {
  const [eligible, setEligible] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!createdAt) {
      setEligible(false);
      return;
    }
    let cancelled = false;
    acquisitionAskEligible(createdAt).then((ok) => !cancelled && setEligible(ok));
    return () => {
      cancelled = true;
    };
  }, [createdAt, tick]);
  return { eligible, recheck: () => setTick((n) => n + 1) };
}

/** Add your vehicle: shown with no vehicle, snoozed for 7 days when dismissed. */
export function useVehicleAskSnooze(): { snoozed: boolean; snooze: () => void } {
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => {
    readKey(VEHICLE_SNOOZE_KEY).then((v) => {
      const n = v ? parseInt(v, 10) : NaN;
      setAt(Number.isFinite(n) ? n : null);
    });
  }, []);
  const snooze = useCallback(() => {
    const now = Date.now();
    setAt(now);
    writeKey(VEHICLE_SNOOZE_KEY, String(now));
  }, []);
  return { snoozed: at !== null && Date.now() - at < SEVEN_DAYS_MS, snooze };
}

/** Odometer readings for work: Work mode, 3+ trips, a vehicle with no reading. */
export function useOdometerAsk(
  isWork: boolean,
  totalTrips: number
): { vehicle: UpdateReadingVehicle | null; dismiss: () => void } {
  const [vehicle, setVehicle] = useState<UpdateReadingVehicle | null>(null);

  useEffect(() => {
    // Cheap gates first so most Home loads never touch the network.
    if (!isWork || totalTrips < 3) {
      setVehicle(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (await readKey(ODOMETER_DISMISSED_KEY)) return;
        const list = (await fetchVehicles()).data;
        const def = list.find((v) => v.isPrimary) ?? (list.length === 1 ? list[0] : null);
        if (!def) return;
        const ok = shouldShowOdometerPrompt({
          isWork,
          vehicleCount: list.length,
          defaultVehicleHasReading: !!def.odometer,
          completedTrips: totalTrips,
          dismissedOnDevice: false,
        });
        if (cancelled) return;
        if (!ok) {
          // A reading exists (typed elsewhere): never ask on this phone either.
          if (def.odometer) writeKey(ODOMETER_DISMISSED_KEY, "1");
          return;
        }
        setVehicle({
          id: def.id,
          name: `${def.make} ${def.model}`.trim(),
          registrationPlate: def.registrationPlate ?? null,
          createdAt: def.createdAt ?? null,
        });
      } catch {
        // Offline or unreadable: stay quiet rather than risk asking twice.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isWork, totalTrips]);

  const dismiss = useCallback(() => {
    setVehicle(null);
    writeKey(ODOMETER_DISMISSED_KEY, "1");
  }, []);
  return { vehicle, dismiss };
}

/** New Zealand: note each car's odometer for 31 March. Once a year; "done" for that year when tapped or dismissed. */
export function useNzBalanceDateAsk(country: string): { eligible: boolean; done: () => void } {
  const [doneYear, setDoneYear] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (country !== "NZ") return;
    readKey(NZ_BALANCE_DATE_ASK_KEY).then((v) => setDoneYear(v));
  }, [country]);
  const done = useCallback(() => {
    const year = nzBalanceDateWindowYear(new Date());
    if (year == null) return;
    setDoneYear(String(year));
    writeKey(NZ_BALANCE_DATE_ASK_KEY, String(year));
  }, []);
  // Unknown (still reading) stays quiet.
  const eligible = doneYear !== undefined && nzBalanceDateAskDue({ country, now: new Date(), doneYear });
  return { eligible, done };
}

/**
 * Does your employer pay your mileage? Work mode, not already in a company, an
 * employee or Both driver (or one with business miles), and never answered.
 * "No" and the close button are for good; a sent invite writes the same key.
 */
export function useEmployerAsk(args: {
  isWork: boolean;
  isCompanyDriver: boolean;
  workType: string | null | undefined;
  hasBusinessMileage: boolean;
}): { eligible: boolean; decline: () => void } {
  const [answered, setAnswered] = useState<boolean | null>(null);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      // Unreadable local state fails open: worst case we ask once more than we should.
      readKey(NOMINATE_PROMPT_STATE_KEY).then((v) => live && setAnswered(v !== null));
      return () => {
        live = false;
      };
    }, [])
  );
  const looksLikeEmployee =
    args.workType === "employee" || args.workType === "both" || args.hasBusinessMileage;
  const decline = useCallback(() => {
    setAnswered(true);
    writeKey(NOMINATE_PROMPT_STATE_KEY, "declined");
  }, []);
  return {
    eligible: answered === false && args.isWork && !args.isCompanyDriver && looksLikeEmployee,
    decline,
  };
}

/** "Looks like a shift": the server's newest suggestion, gig and Both drivers in Work mode. */
export function useShiftAsk(enabled: boolean): {
  suggestion: ShiftSuggestion | null;
  remove: (id: string) => void;
  reload: () => void;
} {
  const [items, setItems] = useState<ShiftSuggestion[]>([]);
  const load = useCallback(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    fetchShiftSuggestions()
      .then((r) => setItems(r.suggestions ?? []))
      .catch(() => {});
  }, [enabled]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  return {
    suggestion: items[0] ?? null,
    remove: (id: string) => setItems((prev) => prev.filter((p) => p.id !== id)),
    reload: load,
  };
}

// ── Practice accounts (Oct 2026) ──────────────────────────────────────────
// An accountant's practice waiting on the driver: an unanswered ask to
// share, the keep-sharing prompt, or the oldest open request. Fetched on
// focus through a short cache so opening Home often is not a request each
// time. Also opens the consent sheet for an invite or join link that was
// opened before the driver signed in.
const practiceCache = createTtlCache(2 * 60 * 1000);

export function usePracticeAsk(): { ask: HomePracticeAsk | null; reload: () => void } {
  const [ask, setAsk] = useState<HomePracticeAsk | null>(null);
  const load = useCallback((force = false) => {
    practiceCache
      .get("links", fetchPracticeLinks, force)
      .then((d) => setAsk(pickHomePracticeAsk(d.links, d.requests)))
      .catch(() => {});
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
      takePendingConsent().then((p) => {
        if (!p) return;
        const q = p.invite ? `invite=${encodeURIComponent(p.invite)}` : `code=${encodeURIComponent(p.code ?? "")}`;
        router.push(`/practice-consent?${q}` as never);
      });
    }, [load])
  );
  return { ask, reload: () => load(true) };
}

const FIRST_WEEK_DONE_KEY = "home_first_week_done";

/**
 * This phone's trips for the first-week card (lib/home/firstWeek.ts): count,
 * miles, and how many are sorted. Once any trip has been sorted the card is
 * gone for good, even if that trip is later set back to "sort later".
 * `key` changes when the last trip does (a new trip, or a sort).
 */
export function useFirstWeekLocal(enabled: boolean, key: string): {
  local: { trips: number; miles: number; sorted: number } | null;
  done: boolean;
} {
  const [local, setLocal] = useState<{ trips: number; miles: number; sorted: number } | null>(null);
  const [done, setDone] = useState(true);
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusTick((n) => n + 1);
    }, [])
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      if ((await readKey(FIRST_WEEK_DONE_KEY)) === "1") {
        if (!cancelled) setDone(true);
        return;
      }
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ n: number; miles: number | null; sorted: number | null }>(
        "SELECT COUNT(*) AS n, SUM(distance_miles) AS miles, " +
          "SUM(CASE WHEN classification IN ('business', 'personal') THEN 1 ELSE 0 END) AS sorted FROM trips"
      );
      const next = { trips: row?.n ?? 0, miles: row?.miles ?? 0, sorted: row?.sorted ?? 0 };
      if (next.sorted > 0) await writeKey(FIRST_WEEK_DONE_KEY, "1");
      if (cancelled) return;
      setLocal(next);
      setDone(next.sorted > 0);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, key, focusTick]);
  return { local, done };
}
