// Where the driver drives (23 Oct 2026). One small store, the same pattern
// as Miles / Kilometres (lib/units/distanceUnit.ts): screens read it with
// useCountryFeatures(), UserContext feeds it the server's value, and the
// choice is cached in tracking_state so it shows at once, offline too.
//
// Screens never check the country themselves: they ask featuresFor() (via
// useCountryFeatures) whether a UK-only feature applies.
import { useSyncExternalStore } from "react";
import { NativeModules, Platform } from "react-native";
import { countryOf, featuresFor, isUk, type CountryFeatures } from "@mileclear/shared";
import {
  COUNTRY_KEY,
  COUNTRY_PENDING_KEY,
  NO_COUNTRY,
  onServerCountry,
  parseCachedCountry,
  regionFromAppleLocale,
  type CachedCountry,
} from "./rule";

let state: CachedCountry = NO_COUNTRY;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(next: CachedCountry) {
  const changed = next.country !== state.country;
  state = next;
  if (changed) {
    emit();
    // The phone's own UK tax-year reminder follows the country: off outside
    // the UK, back on for the UK. Never throws.
    import("../notifications/scheduler")
      .then((m) => m.scheduleTaxYearDeadlineReminder())
      .catch(() => {});
  }
}

async function db() {
  const mod = await import("../db/index");
  return mod.getDatabase();
}

async function save(next: CachedCountry): Promise<void> {
  try {
    const d = await db();
    await d.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [COUNTRY_KEY, next.country]);
    await d.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
      COUNTRY_PENDING_KEY,
      next.pending ? "1" : "0",
    ]);
  } catch {
    // best effort: the server still has the choice once it's sent
  }
}

/** Read the cached choice. A failed read is tried again next time. */
export function loadCountry(): Promise<void> {
  if (!loaded) {
    loaded = (async () => {
      try {
        const d = await db();
        const rows = await d.getAllAsync<{ key: string; value: string }>(
          "SELECT key, value FROM tracking_state WHERE key IN (?, ?)",
          [COUNTRY_KEY, COUNTRY_PENDING_KEY]
        );
        const by = new Map(rows.map((r) => [r.key, r.value]));
        // A newer choice made while this read was out wins.
        if (!state.pending) set(parseCachedCountry(by.get(COUNTRY_KEY), by.get(COUNTRY_PENDING_KEY)));
      } catch {
        loaded = null; // unreadable: the UK for now, try again later
      }
    })();
  }
  return loaded;
}

async function send(country: string): Promise<boolean> {
  try {
    const { updateProfile } = await import("../api/user");
    const res = await updateProfile({ country });
    return res.data?.country === undefined || res.data.country === country;
  } catch {
    return false;
  }
}

/** The driver picked a country. Shows at once, is cached, and is sent; if
 *  that fails (offline) it is sent again with the next profile load. */
export async function chooseCountry(raw: string): Promise<void> {
  await loadCountry();
  const country = countryOf(raw);
  const next = { country, pending: true };
  set(next);
  await save(next);
  if ((await send(country)) && state.country === country && state.pending) {
    state = { country, pending: false };
    await save(state);
  }
}

/** A profile arrived from the server (UserContext.refreshUser). Never throws. */
export async function adoptServerCountry(serverRaw: unknown): Promise<void> {
  await loadCountry();
  const step = onServerCountry(serverRaw, state);
  if (step.kind === "keep") return;
  if (step.kind === "adopt") {
    const next = { country: step.country, pending: false };
    if (next.country !== state.country || state.pending) {
      set(next);
      await save(next);
    }
    return;
  }
  if ((await send(step.country)) && state.country === step.country && state.pending) {
    state = { country: step.country, pending: false };
    await save(state);
  }
}

/**
 * The server has the Country setting off for this driver (no
 * countrySettingEnabled, or an older server): they are the UK, and nothing
 * is sent. Never throws.
 */
export async function countrySettingOff(): Promise<void> {
  await loadCountry();
  if (state.country === NO_COUNTRY.country && !state.pending) return;
  set(NO_COUNTRY);
  await save(NO_COUNTRY);
}

/** A real sign-out: the next driver on this phone starts as the UK. */
export async function clearCountry(): Promise<void> {
  await loadCountry();
  set(NO_COUNTRY);
  await save(NO_COUNTRY);
}

/** The current country outside React (notifications, plain functions). */
export function currentCountry(): string {
  return state.country;
}

/** featuresFor(the current country), outside React. */
export function currentCountryFeatures(): CountryFeatures {
  return featuresFor(state.country);
}

/**
 * The iPhone's REGION setting ("NZ"), or null. Never a language: "en_US" is
 * a common language on UK phones. Android exposes no region to JS without a
 * native module (its localeIdentifier is the language), so it returns null
 * there and the sign-up country is the only hint.
 */
export function deviceRegion(): string | null {
  try {
    if (Platform.OS !== "ios") return null;
    return regionFromAppleLocale(NativeModules.SettingsManager?.settings?.AppleLocale);
  } catch {
    return null;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  void loadCountry();
  return () => {
    listeners.delete(l);
  };
}

function snapshot(): string {
  return state.country;
}

/** The driver's country code. Re-renders when it changes. */
export function useCountry(): string {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Which UK-only features apply to this driver. The one gate for screens. */
export type CountryGate = CountryFeatures & { isUk: boolean; country: string };

// One object per country, so screens can put it in effect deps safely.
const gates = new Map<string, CountryGate>();

export function countryGate(country: string): CountryGate {
  let g = gates.get(country);
  if (!g) {
    g = { ...featuresFor(country), isUk: isUk(country), country };
    gates.set(country, g);
  }
  return g;
}

export function useCountryFeatures(): CountryGate {
  return countryGate(useCountry());
}
