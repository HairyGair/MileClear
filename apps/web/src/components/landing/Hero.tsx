import PhoneMockup from "./PhoneMockup";

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero__grid">
        <div className="hero__text">
          <div className="hero__badge">
            <span className="hero__badge-dot" />
            Early access — live now
          </div>
          <h1 className="hero__h1">
            Track every mile.
            <br />
            <em>Keep every penny.</em>
          </h1>
          <p className="hero__sub">
            The mileage tracker that actually works. Built for gig drivers,
            delivery riders, and anyone who drives for a living.
          </p>
          <a href="#early-access" className="hero__cta">
            Try it free
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
