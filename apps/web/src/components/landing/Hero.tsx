import Image from "next/image";

const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6759671005";

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero__grid">
        <div className="hero__text">
          <div className="hero__badge">
            <span className="hero__badge-dot" />
            Unlimited tracking. Free, forever.
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
            employer-reimbursement claims handled in one place &mdash;{" "}
            <strong>with no monthly drive cap</strong>. MileIQ stops you at
            40 drives a month unless you pay. We never do.
          </p>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="hero__cta">
            Download free
            <span className="hero__cta-arrow" aria-hidden="true">&rarr;</span>
          </a>
          <p className="hero__trust">
            Unlimited trips &middot; No card required &middot; Pro is optional, never gates tracking
          </p>
        </div>
        <div className="hero__phone">
          <Image
            src="/screenshot-source/iphone/iphone-01-hero.png"
            alt="MileClear app showing today's tax-deductible mileage and active shift"
            width={480}
            height={1040}
            priority
            sizes="(max-width: 768px) 80vw, 480px"
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
      </div>
    </section>
  );
}
