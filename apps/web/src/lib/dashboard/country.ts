"use client";

// Where the driver drives, chosen in the app (Settings > Country, 23 Oct
// 2026). The website follows it through the same gate as the app,
// featuresFor(country): pages ask whether a UK-only feature applies rather
// than checking the country themselves. Missing (an older server) is the UK.
import { featuresFor, isUk, countryOf, type CountryFeatures } from "@mileclear/shared";
import { useAuth } from "../auth-context";

export type WebCountryGate = CountryFeatures & { isUk: boolean; country: string };

export function useCountryFeatures(): WebCountryGate {
  const { user } = useAuth();
  const country = countryOf(user?.country);
  return { ...featuresFor(country), isUk: isUk(country), country };
}
