import Reveal from "./Reveal";

const Tick = () => (
  <svg className="p-card__check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const free = [
  "Mileage tracking with shift mode",
  "Smart trip detection",
  "Offline support",
  "Daily scorecards & streaks",
  "Tax savings counter",
  "Manual trip entry",
];

const pro = [
  "Everything in Free, plus:",
  "HMRC-compliant exports",
  "Xero, FreeAgent & QuickBooks",
  "Earnings tracking & real hourly rate",
  "Fuel price finder with brand preference",
  "Audit protection & trip classification",
  "Advanced analytics & reports",
  "Multi-vehicle support",
];

export default function Pricing() {
  return (
    <section id="pricing" className="section">
      <div className="container pricing__center">
        <Reveal>
          <p className="label">Pricing</p>
          <h2 className="heading">Simple pricing. No surprises.</h2>
        </Reveal>

        <Reveal delay="reveal-d1">
          <div className="pricing__cards">
            {/* Free */}
            <div className="p-card">
              <p className="p-card__name">Free</p>
              <p className="p-card__price">
                &pound;0<span className="p-card__period"> /forever</span>
              </p>
              <p className="p-card__desc">
                Everything you need to track your miles reliably.
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
              <p className="p-card__name">Premium</p>
              <p className="p-card__price">
                &pound;4.99<span className="p-card__period"> /month</span>
              </p>
              <p className="p-card__desc">
                Tax-ready exports, earnings insights, and full control.
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
            Free during early access. No card needed.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
