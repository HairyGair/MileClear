import PhoneMockup from "./PhoneMockup";

const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6759671005";

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero__grid">
        <div className="hero__text">
          <div className="hero__badge">
            <span className="hero__badge-dot" />
            Available on the App Store
          </div>
          <h1 className="hero__h1">
            Track every mile.
            <br />
            <em>Claim every penny.</em>
          </h1>
          <p className="hero__sub">
            The UK mileage tracker built for gig workers, delivery drivers, and
            employees who drive their own car for work. Automatic trip recording,
            smart classification that learns your routes, HMRC AMAP rates and
            employer-reimbursement claims handled in one place.
          </p>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="hero__cta">
            Download free
            <span className="hero__cta-arrow" aria-hidden="true">&rarr;</span>
          </a>
          <p className="hero__trust">
            Free to use &middot; No card required &middot; Your data stays yours
          </p>
        </div>
        <div className="hero__phone">
          <PhoneMockup />
        </div>
      </div>
    </section>
  );
}
