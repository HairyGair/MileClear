import Reveal from "./Reveal";

const Tick = () => (
  <svg className="p-card__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const free = [
  "Unlimited GPS trip tracking with auto-detection",
  "Tax Readiness card (live tax estimate, weekly set-aside, deadline countdown)",
  "Anonymous Benchmarking vs other UK drivers",
  "HMRC Reconciliation - compare what HMRC sees to what you tracked",
  "MOT and tax expiry reminders + full DVSA MOT history",
  "Activity Heatmap (when you drive and earn most)",
  "Shift mode with platform tagging",
  "Fuel prices from 8,300+ UK stations",
  "Pickup wait timer (community insights are Pro)",
  "Achievements, streaks, weekly and monthly recaps",
  "2 saved locations with geofencing",
];

const pro = [
  "Everything in Free, plus:",
  "Self Assessment wizard - mapped to HMRC SA103 form boxes",
  "PDF mileage log with signed HMRC attestation cover sheet",
  "CSV and accounting-software exports",
  "Accountant Portal (read-only dashboard you can invite by email)",
  "Receipt scanning - on-device OCR, your images stay on your phone",
  "CSV earnings import from Uber, Deliveroo, Just Eat, Amazon Flex, Stuart",
  "Business insights - earnings/mile, golden hours, weekly P&L, shift grades",
  "Pickup-wait community insights (where averages 12-min waits)",
  "Unlimited saved locations",
];

export default function Pricing() {
  return (
    <section id="pricing" className="section">
      <div className="container pricing__center">
        <Reveal>
          <p className="label">Pricing</p>
          <h2 className="heading">Simple, honest pricing</h2>
          <p className="subtext">
            The free plan is genuinely free. No trip limits, no time limits, no surprise paywalls on basic features.
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
                Full mileage tracking with everything you need to record your driving.
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
                Tax-ready exports, earnings insights, and the full toolkit for self-employed drivers.
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
