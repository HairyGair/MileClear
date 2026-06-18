"use client";

import { useEffect, useState } from "react";
import {
  CONSENT_EVENT,
  OPEN_CONSENT_EVENT,
  getConsent,
  setConsent,
} from "./consent";

/**
 * Cookie consent banner. Shows on first visit (no stored choice) and whenever
 * the footer "Cookie preferences" link re-opens it. Reject is as prominent as
 * Accept (GDPR: withdrawing must be as easy as giving). Google Analytics only
 * loads after Accept — see GoogleAnalytics.tsx.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // First paint: show only if no decision has been made yet.
    setVisible(getConsent() === null);
    const reopen = () => setVisible(true);
    const onChange = () => setVisible(getConsent() === null);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => {
      window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
      window.removeEventListener(CONSENT_EVENT, onChange);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="cookie-consent"
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
    >
      <p className="cookie-consent__text">
        We&apos;d like to use Google Analytics cookies to see how the site is
        used and improve it. We&apos;ll only set them if you accept.{" "}
        <a href="/privacy#cookies">Privacy Policy</a>.
      </p>
      <div className="cookie-consent__actions">
        <button
          type="button"
          className="cookie-consent__btn cookie-consent__btn--ghost"
          onClick={() => {
            setConsent("denied");
            setVisible(false);
          }}
        >
          Reject
        </button>
        <button
          type="button"
          className="cookie-consent__btn cookie-consent__btn--primary"
          onClick={() => {
            setConsent("granted");
            setVisible(false);
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
