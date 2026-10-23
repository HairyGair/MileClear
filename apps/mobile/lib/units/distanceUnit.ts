// Miles or kilometres on screen (Simon, 23 Oct 2026). One small store, not a
// provider: screens read it with useDistanceUnit(), UserContext feeds it the
// server's value, and the choice is cached in tracking_state so it shows at
// once on the next open, offline too.
//
// Display only. Every stored distance is miles; anything that saves a
// distance converts back with toMiles() first. Tax figures, the 10,000-mile
// threshold, Miles by project and every download stay in miles because HMRC
// rates are per mile, so those screens don't use this.
import { useSyncExternalStore } from "react";
import {
  distanceIn,
  distanceToMiles,
  distanceUnitLabel,
  formatDistance,
  formatDistanceNumber,
  type DistanceUnit,
  type DistanceUnitStyle,
  type FormatDistanceOptions,
} from "@mileclear/shared";
import {
  DISTANCE_UNIT_KEY,
  DISTANCE_UNIT_PENDING_KEY,
  onServerDistanceUnit,
  parseCachedDistanceUnit,
  type CachedDistanceUnit,
} from "./rule";

let state: CachedDistanceUnit = { unit: "miles", pending: false };
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(next: CachedDistanceUnit) {
  const changed = next.unit !== state.unit;
  state = next;
  if (changed) emit();
}

async function db() {
  const mod = await import("../db/index");
  return mod.getDatabase();
}

async function save(next: CachedDistanceUnit): Promise<void> {
  try {
    const d = await db();
    await d.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [DISTANCE_UNIT_KEY, next.unit]);
    await d.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      DISTANCE_UNIT_PENDING_KEY,
      next.pending ? "1" : "0",
    ]);
  } catch {
    // best effort: the server still has the choice once it's sent
  }
}

/** Read the cached choice once per app run. Safe to call often. */
export function loadDistanceUnit(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const d = await db();
        const rows = await d.getAllAsync<{ key: string; value: string }>(
          "SELECT key, value FROM tracking_state WHERE key IN (?, ?)",
          [DISTANCE_UNIT_KEY, DISTANCE_UNIT_PENDING_KEY]
        );
        const by = new Map(rows.map((r) => [r.key, r.value]));
        set(parseCachedDistanceUnit(by.get(DISTANCE_UNIT_KEY), by.get(DISTANCE_UNIT_PENDING_KEY)));
      } catch {
        // unreadable: miles
      }
    })();
  }
  return loaded;
}

async function send(unit: DistanceUnit): Promise<boolean> {
  try {
    const { updateProfile } = await import("../api/user");
    const res = await updateProfile({ distanceUnit: unit });
    return res.data?.distanceUnit === undefined || res.data.distanceUnit === unit;
  } catch {
    return false;
  }
}

/**
 * The driver picked a unit in Settings. Shows at once, is cached, and is sent
 * to the server; if that fails (offline) it is sent again with the next
 * profile load.
 */
export async function chooseDistanceUnit(unit: DistanceUnit): Promise<void> {
  await loadDistanceUnit();
  const next = { unit, pending: true };
  set(next);
  await save(next);
  // A newer choice may have replaced this one while the request was out.
  if ((await send(unit)) && state.unit === unit && state.pending) {
    state = { unit, pending: false };
    await save(state);
  }
}

/** A profile arrived from the server (UserContext.refreshUser). Never throws. */
export async function adoptServerDistanceUnit(serverRaw: unknown): Promise<void> {
  await loadDistanceUnit();
  const step = onServerDistanceUnit(serverRaw, state);
  if (step.kind === "keep") return;
  if (step.kind === "adopt") {
    const next = { unit: step.unit, pending: false };
    if (next.unit !== state.unit || state.pending) {
      set(next);
      await save(next);
    }
    return;
  }
  if ((await send(step.unit)) && state.unit === step.unit && state.pending) {
    state = { unit: step.unit, pending: false };
    await save(state);
  }
}

/** Signed out: the next driver on this phone starts on miles. */
export async function clearDistanceUnit(): Promise<void> {
  await loadDistanceUnit();
  const next = { unit: "miles" as DistanceUnit, pending: false };
  set(next);
  await save(next);
}

/** The current unit outside React (notifications, plain functions). */
export function currentDistanceUnit(): DistanceUnit {
  return state.unit;
}

function subscribe(l: () => void) {
  listeners.add(l);
  void loadDistanceUnit();
  return () => {
    listeners.delete(l);
  };
}

function snapshot(): DistanceUnit {
  return state.unit;
}

export interface DistanceUnitApi {
  unit: DistanceUnit;
  isKm: boolean;
  /** Miles in, "12.3 mi" / "19.8 km" out. */
  fmt: (miles: number, opts?: FormatDistanceOptions) => string;
  /** Miles in, the number alone in the driver's unit ("19.8"). */
  num: (miles: number, opts?: FormatDistanceOptions) => string;
  /** Miles in, the raw value in the driver's unit. */
  value: (miles: number) => number;
  /** A figure typed in the driver's unit, to miles for storing. */
  toMiles: (value: number) => number;
  /** "mi" / "km", "miles" / "km", "miles" / "kilometres". */
  label: (style?: DistanceUnitStyle) => string;
}

export function distanceUnitApi(unit: DistanceUnit): DistanceUnitApi {
  return {
    unit,
    isKm: unit === "km",
    fmt: (miles, opts) => formatDistance(miles, unit, opts),
    num: (miles, opts) => formatDistanceNumber(miles, unit, opts),
    value: (miles) => distanceIn(miles, unit),
    toMiles: (value) => distanceToMiles(value, unit),
    label: (style) => distanceUnitLabel(unit, style),
  };
}

const apis: Record<DistanceUnit, DistanceUnitApi> = {
  miles: distanceUnitApi("miles"),
  km: distanceUnitApi("km"),
};

/** The driver's unit and formatters. Re-renders when the choice changes. */
export function useDistanceUnit(): DistanceUnitApi {
  const unit = useSyncExternalStore(subscribe, snapshot, snapshot);
  return apis[unit];
}
