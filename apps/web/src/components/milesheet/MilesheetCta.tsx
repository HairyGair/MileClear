"use client";

import Link from "next/link";
import WaitlistForm, { WAITLIST_HEADLINE, WAITLIST_LEDE, useNewTeamsMode } from "./WaitlistForm";

// The closing card on /milesheet (4 Oct 2026). While new teams are on the
// waiting list it is the waiting-list form, open to anyone, no sign-in.
// Once the API opens new teams it goes back to "Set your company up".
export default function MilesheetCta() {
  const mode = useNewTeamsMode();

  if (mode === "open") {
    return (
      <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
        <h2 className="ms-section__title" style={{ marginBottom: "0.5rem" }}>
          Set your company up
        </h2>
        <p className="ms-lede" style={{ maxWidth: 520, margin: "0 auto 1.5rem" }}>
          Create your company, invite your drivers by email, and approve your first month.
          It takes about five minutes.
        </p>
        <Link href="/milesheet/portal" className="btn btn--lg btn--primary">
          Get started
        </Link>
      </div>
    );
  }

  return (
    <div id="waiting-list" className="card" style={{ padding: "2rem" }}>
      <h2 className="ms-section__title" style={{ marginBottom: "0.5rem", textAlign: "center" }}>
        {WAITLIST_HEADLINE}
      </h2>
      <p className="ms-lede" style={{ maxWidth: 520, margin: "0 auto 1.5rem", textAlign: "center" }}>
        {WAITLIST_LEDE}
      </p>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        {mode === null ? null : <WaitlistForm />}
      </div>
    </div>
  );
}
