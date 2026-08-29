import Image from "next/image";

import StoreButtons from "@/components/StoreButtons";

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
            The UK mileage tracker for gig workers, delivery drivers, and
            anyone who drives their own car for work. ClearTrack records your
            trips automatically, classification learns your regular routes, and
            your HMRC or employer claim adds up as you drive.{" "}
            <strong>There is no monthly drive cap.</strong> MileIQ stops you at
            40 drives a month unless you pay. We never do.
          </p>
          <StoreButtons size="lg" />
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
