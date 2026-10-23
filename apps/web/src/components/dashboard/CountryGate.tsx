"use client";

// A page for a UK-only feature (23 Oct 2026). Its way in is hidden outside
// the UK, but a bookmark or link can still open it, so it says so plainly
// instead of showing HMRC figures that don't apply.
import type { ComponentType } from "react";
import { NOT_IN_YOUR_COUNTRY, countryName, type CountryFeature } from "@mileclear/shared";
import { EmptyState } from "./kit";
import { useCountryFeatures } from "../../lib/dashboard/country";

export function NotInYourCountry() {
  const { country } = useCountryFeatures();
  return (
    <EmptyState
      icon="flag-outline"
      title={NOT_IN_YOUR_COUNTRY}
      body={`This is built for UK drivers, and your country is set to ${countryName(country)}. Your trips and downloads work as normal. You can change your country in the app, in Settings.`}
      action={{ label: "Back to Home", href: "/dashboard" }}
    />
  );
}

/** Wrap a page's default export: outside the feature's countries it shows NotInYourCountry. */
export function withCountryFeature<P extends object>(feature: CountryFeature, Page: ComponentType<P>): ComponentType<P> {
  function Gated(props: P) {
    const f = useCountryFeatures();
    if (!f[feature]) return <NotInYourCountry />;
    return <Page {...props} />;
  }
  Gated.displayName = `CountryGate(${Page.displayName ?? Page.name ?? "Page"})`;
  return Gated;
}
