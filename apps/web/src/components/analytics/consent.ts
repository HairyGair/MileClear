// Cookie-consent state for the web analytics layer.
//
// MileClear is UK/GDPR-positioned, so Google Analytics (a non-essential,
// cookie-setting tracker) must not load until the visitor explicitly accepts.
// This is the single source of truth for that choice: stored in localStorage,
// with a window event so the banner, the GA loader, and the footer
// "Cookie preferences" link all stay in sync without prop-drilling.

export const CONSENT_KEY = "mc_analytics_consent";
// Fired whenever the stored choice changes (accept / reject / reset).
export const CONSENT_EVENT = "mc-consent-change";
// Fired by the footer link to re-open the banner so a choice can be withdrawn.
export const OPEN_CONSENT_EVENT = "mc-open-consent";

export type ConsentChoice = "granted" | "denied";

export function getConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return getConsent() === "granted";
}

export function setConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    /* private mode / storage blocked — fall through, GA just won't load */
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/** Re-open the banner so the visitor can change a previous decision. */
export function openConsent(): void {
  window.dispatchEvent(new Event(OPEN_CONSENT_EVENT));
}
