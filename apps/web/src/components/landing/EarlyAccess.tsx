import Reveal from "./Reveal";
import StoreButtons from "@/components/StoreButtons";

const stats = [
  { value: "8,300+", label: "UK fuel stations" },
  { value: "43", label: "achievements" },
  { value: "55p", label: "HMRC rate (2026-27)" },
];

export default function EarlyAccess() {
  return (
    <section id="early-access" className="section ea">
      <div className="container ea__wrap">
        {/* Decorative orb */}
        <div className="ea__orb" aria-hidden="true" />

        <Reveal>
          <div className="ea__hero-block">
            <img
              src="/branding/logo-120x120.png"
              alt="MileClear"
              className="ea__logo"
              width={64}
              height={64}
            />
            <p className="label">On the App Store, and Android next</p>
            <h2 className="heading ea__heading">
              Claim what you&apos;re owed
            </h2>
            <p className="subtext ea__subtext">
              Download MileClear free. <strong>Unlimited tracking, forever.</strong> Not
              40 drives a month like MileIQ, or 15 like Driversnote. There is no card
              and no trial. Open it, drive, and your HMRC deduction builds with every trip.
            </p>
          </div>
        </Reveal>

        <Reveal delay="reveal-d1">
          <div className="ea__download-row">
            <StoreButtons />
            <div className="ea__qr">
              <img
                src="/branding/qr-code.png"
                alt="Scan to download MileClear"
                className="ea__qr-img"
                width={100}
                height={100}
              />
              <span className="ea__qr-label">Scan to download</span>
            </div>
          </div>
          <p className="ea__download-note">Free on iPhone and iPad. Android is with Google for approval.</p>
        </Reveal>

        <Reveal delay="reveal-d2">
          <div className="ea__stats">
            {stats.map((s) => (
              <div key={s.label} className="ea__stat">
                <span className="ea__stat-value">{s.value}</span>
                <span className="ea__stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
