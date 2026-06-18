"use client";

import { openConsent } from "./consent";

/** Footer link that re-opens the cookie banner so a visitor can change or
 *  withdraw their analytics consent at any time. */
export default function CookiePreferencesLink() {
  return (
    <button
      type="button"
      className="footer__link footer__link--button"
      onClick={() => openConsent()}
    >
      Cookie preferences
    </button>
  );
}
