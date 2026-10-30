import StoreButtons from "@/components/StoreButtons";
import HeroDemo from "./HeroDemo";
import HeroOdometer from "./HeroOdometer";

export default function Hero({ miles }: { miles: number }) {
  return (
    <section className="hero">
      <div className="container hero__grid">
        <div className="hero__text">
          <HeroOdometer miles={miles} />
          <h1 className="hero__h1">
            <span className="hero__h1-kicker">
              Free mileage tracker app for UK drivers
            </span>
            Track every mile.
            <br />
            <em>Claim every penny.</em>
          </h1>
          <p className="hero__sub">
            MileClear records your drives on its own, even with the app
            closed, and turns them into your mileage claim. Free on iPhone
            and Android, for gig drivers, the self-employed and employees.
          </p>
          <dl className="hero__caps">
            <div className="hero__cap">
              <dt>Trips</dt>
              <dd>Recorded automatically. Sort business or personal in a tap. Shifts for gig work.</dd>
            </div>
            <div className="hero__cap">
              <dt>Money</dt>
              <dd>Your claim at HMRC rates, earnings by platform, expenses with receipt scanning, invoices.</dd>
            </div>
            <div className="hero__cap">
              <dt>Tax</dt>
              <dd>A Self Assessment checklist, what to set aside each week, downloads for your accountant (Pro).</dd>
            </div>
            <div className="hero__cap">
              <dt>Running costs</dt>
              <dd>Cheapest fuel near you, EV cost per mile, MOT and tax reminders.</dd>
            </div>
          </dl>
          <StoreButtons size="lg" />
          <p className="hero__trust">
            Unlimited trips &middot; No card required &middot; Pro is optional, never gates tracking
          </p>
        </div>
        <div className="hero__phone">
          <HeroDemo />
        </div>
      </div>
    </section>
  );
}
