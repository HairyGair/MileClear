import Reveal from "./Reveal";

const Tick = () => (
  <svg className="p-card__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const free = [
  "Unlimited GPS trip tracking with auto-detection - no monthly drive cap (MileIQ stops you at 40, Driversnote at 15)",
  "Self Assessment wizard - mapped to HMRC SA103 form boxes",
  "Tax Readiness card (live tax estimate, weekly set-aside, deadline countdown)",
  "HMRC Reconciliation - compare what HMRC sees to what you tracked",
  "Expenses log and on-device receipt scanning",
  "Invoicing - 3 tracked invoices a month",
  "1 vehicle with DVLA lookup, MOT history and MOT/tax reminders",
  "Fuel prices from 8,300+ UK stations, EV charging nearby",
  "Anonymous Benchmarking and Activity Heatmap",
  "Shift mode with platform tagging, pickup wait timer",
  "Achievements, streaks and recaps",
  "2 saved locations with geofencing",
  "Web dashboard included",
];

const pro = [
  "Everything in Free, plus:",
  "Print-ready Self Assessment PDF - the wizard's figures, ready to file",
  "PDF mileage log with signed HMRC attestation cover sheet, CSV exports",
  "Accountant Portal (read-only dashboard you can invite by email)",
  "Open Banking earnings import and bank-transaction inbox",
  "CSV earnings import from Uber, Deliveroo, Just Eat, Amazon Flex, Stuart",
  "Auto-Classify Rules - business or personal from your work schedule",
  "Business insights - earnings/mile, golden hours, weekly P&L, shift grades",
  "Driving Analytics and Journey Map",
  "Pickup-wait community insights",
  "Unlimited vehicles, saved locations and invoices",
];

export default function Pricing() {
  return (
    <section id="pricing" className="section">
      <div className="container pricing__center">
        <Reveal>
          <p className="label">Pricing</p>
          <h2 className="heading">Tracking is free. Forever.</h2>
          <p className="subtext">
            No drive caps, no time limits, no surprise paywalls on basic features.
            MileIQ stops you at 40 drives a month on its free tier and
            Driversnote at 15. We don&apos;t limit any of it. Track as many miles as you like, on us. Pro
            (&pound;4.99/month or &pound;44.99/year) adds the tax exports and
            earnings analytics; it never gates the tracker itself.
          </p>
        </Reveal>

        <Reveal delay="reveal-d1">
          <div className="pricing__cards">
            {/* Free */}
            <div className="p-card">
              <p className="p-card__name">Free</p>
              <p className="p-card__price">
                &pound;0<span className="p-card__period"> /month</span>
              </p>
              <p className="p-card__desc">
                Unlimited mileage tracking, forever. Everything you need to
                record your driving and see what HMRC owes you.
              </p>
              <ul className="p-card__list">
                {free.map((f) => (
                  <li key={f} className="p-card__item"><Tick />{f}</li>
                ))}
              </ul>
            </div>

            {/* Premium */}
            <div className="p-card p-card--pro">
              <span className="p-card__badge">Most popular</span>
              <p className="p-card__name">Pro</p>
              <p className="p-card__price">
                &pound;4.99<span className="p-card__period"> /month</span>
              </p>
              <p className="p-card__desc">
                Filing-ready exports, Open Banking, auto-classification and the full insights toolkit for self-employed drivers.
              </p>
              <ul className="p-card__list">
                {pro.map((f) => (
                  <li key={f} className="p-card__item"><Tick />{f}</li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>

        <Reveal delay="reveal-d2">
          <p className="pricing__footnote">
            Cancel anytime from inside the app. No card needed to start the free tier.
          </p>
          <div style={{ textAlign: "center", marginTop: "1rem" }}>
            <a href="/pricing" style={{ color: "var(--amber-400)", fontFamily: "var(--font-display)", fontSize: "0.9375rem", textDecoration: "none" }}>
              View full pricing details and FAQ &rarr;
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
