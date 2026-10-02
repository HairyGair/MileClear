import Link from "next/link";
import type { CommunityMonthly } from "@mileclear/shared";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import StoreButtons from "@/components/StoreButtons";
import { dayLabel, formatClaim, formatCount, monthLabel, monthName, type CommunityResult } from "./data";
import "./community.css";

interface Props {
  result: CommunityResult;
  /** Path of this page, for breadcrumbs ("/community" or "/community/2026-09"). */
  path: string;
}

function Stat({ value, label, note, text }: { value: string; label: string; note?: string; text?: boolean }) {
  return (
    <div className="cm-stat">
      <dt className="cm-stat__label">{label}</dt>
      <dd className={`cm-stat__value${text ? " cm-stat__value--text" : ""}`}>{value}</dd>
      {note ? <dd className="cm-stat__note">{note}</dd> : null}
    </div>
  );
}

function MonthPicker({ months, current }: { months: string[]; current: string }) {
  if (months.length < 2) return null;
  const latest = months[0];
  return (
    <nav className="cm-months" aria-label="Choose a month">
      <h2 className="cm-months__title">Other months</h2>
      <ul className="cm-months__list">
        {months.map((m) => (
          <li key={m}>
            <Link
              href={m === latest ? "/community" : `/community/${m}`}
              className={`cm-months__link${m === current ? " cm-months__link--active" : ""}`}
              aria-current={m === current ? "page" : undefined}
            >
              {monthLabel(m)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Numbers({ c }: { c: CommunityMonthly }) {
  const name = monthName(c.month);
  const maxRegion = c.topRegions[0]?.drivers ?? 1;
  return (
    <>
      <section className="cm-hero" aria-labelledby="cm-headline">
        <span className="label">Community numbers · {monthLabel(c.month)}</span>
        <h1 id="cm-headline" className="cm-headline">
          In {name}, <em>{formatCount(c.activeDrivers ?? 0)}</em> MileClear drivers logged{" "}
          <em>{formatCount(c.totalMiles ?? 0)}</em> miles across <em>{formatCount(c.trips ?? 0)}</em> trips.
        </h1>
        {c.claimValuePence != null && c.claimValuePence > 0 && c.businessMiles != null ? (
          <p className="cm-hero__sub">
            The {formatCount(c.businessMiles)} business miles among them are worth about{" "}
            <strong>{formatClaim(c.claimValuePence)}</strong> in mileage claims at the HMRC mileage rates.
          </p>
        ) : null}
      </section>

      <section aria-label={`${monthLabel(c.month)} in figures`}>
        <dl className="cm-grid">
          <Stat value={formatCount(c.activeDrivers ?? 0)} label="Drivers on the road" note="With at least one trip" />
          <Stat value={formatCount(c.totalMiles ?? 0)} label="Miles logged" />
          <Stat value={formatCount(c.trips ?? 0)} label="Trips" />
          {c.businessMiles != null ? <Stat value={formatCount(c.businessMiles)} label="Business miles" /> : null}
          {c.claimValuePence != null ? (
            <Stat value={formatClaim(c.claimValuePence)} label="Mileage claims, estimated" note="At the HMRC mileage rates" />
          ) : null}
          {c.autoRecordedPct != null ? (
            <Stat value={`${c.autoRecordedPct}%`} label="Recorded automatically" note="The rest were typed in" />
          ) : null}
          {c.newDrivers != null ? <Stat value={formatCount(c.newDrivers)} label="New drivers joined" /> : null}
          {c.busiestDay ? (
            <Stat
              value={dayLabel(c.busiestDay)}
              text
              label="Busiest day"
              note={`${formatCount(c.busiestDay.trips)} trips, ${formatCount(c.busiestDay.miles)} miles`}
            />
          ) : null}
          {c.topPlatform ? (
            <Stat text value={c.topPlatform.label} label="Most tagged platform" note={`${formatCount(c.topPlatform.drivers)} drivers`} />
          ) : null}
        </dl>
      </section>

      {c.topRegions.length > 0 ? (
        <section className="cm-panel" aria-labelledby="cm-regions">
          <h2 id="cm-regions" className="cm-panel__title">Where drivers were</h2>
          <p className="cm-panel__sub">Regions with the most active drivers in {name}.</p>
          <ol className="cm-regions">
            {c.topRegions.map((r) => (
              <li key={r.region} className="cm-region">
                <span className="cm-region__name">{r.region}</span>
                <span className="cm-region__bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(6, Math.round((r.drivers / maxRegion) * 100))}%` }} />
                </span>
                <span className="cm-region__count">{formatCount(r.drivers)} drivers</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

function Unavailable({ title, body }: { title: string; body: string }) {
  return (
    <section className="cm-hero">
      <span className="label">Community numbers</span>
      <h1 className="cm-headline cm-headline--quiet">{title}</h1>
      <p className="cm-hero__sub">{body}</p>
    </section>
  );
}

export default function CommunityView({ result, path }: Props) {
  const crumbs = [{ name: "Community numbers", path: "/community" }];
  if (path !== "/community" && result.status === "ok") crumbs.push({ name: monthLabel(result.data.month), path });

  return (
    <>
      <BreadcrumbsJsonLd crumbs={crumbs} />
      <Navbar />
      <main className="cm">
        <div className="container cm__inner">
          {result.status === "ok" ? (
            result.data.published ? (
              <Numbers c={result.data} />
            ) : (
              <Unavailable
                title={`Not enough drivers to show ${monthLabel(result.data.month)}`}
                body={`We only publish a month when at least ${result.data.privacyFloor} drivers were on the road, so nobody can be picked out of the numbers.`}
              />
            )
          ) : (
            <Unavailable
              title="The numbers are on their way"
              body="We couldn't load the community numbers just now. Please try again in a few minutes."
            />
          )}

          {result.status === "ok" ? <MonthPicker months={result.data.months} current={result.data.month} /> : null}

          <section className="cm-panel cm-method" aria-labelledby="cm-method">
            <h2 id="cm-method" className="cm-panel__title">How we count</h2>
            <ul className="cm-method__list">
              <li>A month runs on UK time, from midnight on the 1st. A month appears here once it has ended.</li>
              <li>
                A driver counts once they record at least one trip that month. Trips our checks flag as not
                a real drive (a phone moving at walking pace, a GPS jump) are left out, and so is the second
                copy of a journey saved twice.
              </li>
              <li>
                The mileage claim figure is an estimate: each driver&apos;s business miles priced at the HMRC
                mileage rates for that tax year, including the drop to 25p a mile after 10,000 business miles.
                It is what those miles are worth at those rates, not what anyone has claimed or been paid.
              </li>
              <li>Regions come from where each driver usually starts their trips. We never show anything smaller than a region.</li>
              <li>
                Every figure is a total across many drivers. A figure is only shown when at least 10 drivers
                stand behind it, so no one person can be picked out.
              </li>
            </ul>
          </section>

          <section className="cm-cta" aria-labelledby="cm-cta">
            <h2 id="cm-cta" className="cm-cta__title">Join them</h2>
            <p className="cm-cta__sub">MileClear records your drives automatically and keeps your mileage log ready for tax time. Free to start.</p>
            <StoreButtons align="center" />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
