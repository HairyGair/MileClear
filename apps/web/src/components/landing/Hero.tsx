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
            anyone who drives their own car for work. It records your trips on
            its own and turns them into the figures HMRC or your employer asks
            for. <strong>Every trip, every month, free.</strong>
          </p>
          <StoreButtons size="lg" />
          <p className="hero__trust">
            Unlimited trips &middot; No card required &middot; Pro is optional, never gates tracking
          </p>
        </div>
        <div className="hero__phone">
          <Image
            src="/screenshot-source/iphone/01-dashboard.png"
            alt="The MileClear dashboard: 44.30 pounds saved in tax this year, 11.9 miles today, and Start Trip and Start Shift buttons"
            className="hero__shot"
            width={440}
            height={956}
            priority
            sizes="(max-width: 768px) 80vw, 480px"
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
      </div>
    </section>
  );
}
