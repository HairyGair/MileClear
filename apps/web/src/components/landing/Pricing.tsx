import Reveal from "./Reveal";

const Tick = () => (
  <svg className="p-card__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const free = [
  "Unlimited trip tracking (GPS and manual)",
  "Auto trip detection and recording",
  "Shift mode with scorecards",
  "HMRC tax deduction calculator",
  "Fuel prices from 8,300+ UK stations",
  "43 achievements, streaks, and recaps",
  "Live Activities on lock screen",
  "2 saved locations with geofencing",
  "Vehicle management with DVLA lookup",
  "Apple Sign-In and email auth",
];

const pro = [
  "Everything in Free, plus:",
  "PDF trip reports and Self Assessment exports",
  "CSV exports for accountants",
  "Earnings tracking across platforms",
  "CSV earnings import (bulk)",
  "Open Banking earnings sync",
  "Business insights and weekly P&L",
  "Platform comparison and golden hours",
  "Unlimited saved locations",
  "Priority support",
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
            Annual plan available at &pound;44.99/year (save 25%). No card needed to start.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
