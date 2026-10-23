import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { ANDROID_OS_SCHEMA } from "@/data/android";
import Navbar from "@/components/landing/Navbar";
import StoreButtons from "@/components/StoreButtons";
import {
  IRD_SOURCES,
  LOGBOOK_RULES,
  NO_LOGBOOK_TIER1_KM,
  NZ_PAGE_URL,
  latestRateRows,
  nextRatesYear,
  nzFaqs,
  workedExample,
} from "./content";
import { IRD_LATEST_RATES_YEAR, IRD_TIER1_KM } from "@mileclear/shared";
import { NZ_PRO_PRICE_MONTHLY, NZ_PRO_PRICE_YEARLY } from "@/data/nzPricing";
import { nzHomeRedirectOn } from "@/lib/region/nzHome";

// New Zealand landing page (23 Oct 2026). HELD until the NZ launch: the
// Country setting and NZ tax rules are not live yet, so this page is noindex,
// out of the sitemap and not linked from anywhere.
// TODO: remove noindex + add to sitemap at NZ launch (and add en-NZ to the
// root layout's alternates.languages).

const TITLE = "Mileage tracker NZ: IRD kilometre rates and 90-day logbook | MileClear";
const DESCRIPTION =
  "Mileage tracker for New Zealand drivers. Records every drive automatically in km, works out your claim at IRD kilometre rates and makes the 90-day logbook IRD asks for.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "mileage tracker nz",
    "mileage tracker new zealand",
    "ird kilometre rates",
    "ird mileage rate",
    "90 day logbook ird",
    "vehicle logbook nz",
    "kilometre rates 2025-2026",
  ],
  // The hreflang pairing goes out with the homepage redirect switch (and the
  // homepage carries the matching alternates), so neither page points at the
  // other before launch.
  alternates: nzHomeRedirectOn()
    ? {
        canonical: NZ_PAGE_URL,
        languages: {
          "en-NZ": NZ_PAGE_URL,
          "en-GB": "https://mileclear.com",
          "x-default": "https://mileclear.com",
        },
      }
    : { canonical: NZ_PAGE_URL },
  openGraph: {
    title: "Mileage tracker NZ: IRD kilometre rates and 90-day logbook",
    description: DESCRIPTION,
    url: NZ_PAGE_URL,
    locale: "en_NZ",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mileage tracker NZ: IRD kilometre rates and 90-day logbook",
    description: DESCRIPTION,
    images: ["/branding/og-image.png"],
  },
  // TODO: remove noindex + add to sitemap at NZ launch.
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

const rows = latestRateRows();
const example = workedExample();
const faqs = nzFaqs();

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MileClear",
  applicationCategory: "BusinessApplication",
  operatingSystem: ANDROID_OS_SCHEMA,
  description: DESCRIPTION,
  areaServed: { "@type": "Country", name: "New Zealand" },
  inLanguage: "en-NZ",
  offers: { "@type": "Offer", price: "0", priceCurrency: "NZD" },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

const h2: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#f9fafb",
  marginBottom: "1.25rem",
};
const body: CSSProperties = { color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" };
const strong: CSSProperties = { color: "#e2e8f0" };
const card: CSSProperties = {
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 14,
  padding: "1.5rem",
};
const cell: CSSProperties = {
  padding: "0.75rem 1rem",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  textAlign: "left",
};
const link: CSSProperties = { color: "#fbbf24", textDecoration: "underline" };
const section: CSSProperties = { maxWidth: 760, marginBottom: "3.5rem" };

export default function NewZealandPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <Navbar />

      <main lang="en-NZ" style={{ background: "#030712", paddingTop: "6rem", paddingBottom: "5rem" }}>
        <div className="container">
          {/* Hero */}
          <header style={{ maxWidth: 780, marginBottom: "3.5rem" }}>
            <span className="label" style={{ display: "inline-block", marginBottom: "1rem" }}>
              Mileage tracker NZ
            </span>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.875rem, 4vw, 2.75rem)",
                fontWeight: 700,
                lineHeight: 1.12,
                letterSpacing: "-0.03em",
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              The mileage tracker for New Zealand drivers
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              MileClear records every drive automatically and shows it in kilometres. It works out
              your claim at IRD kilometre rates as you go, and makes the 90-day logbook IRD asks
              for from the trips you&apos;ve already recorded.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
              <StoreButtons align="start" />
            </div>
            <p style={{ marginTop: "1.25rem", fontSize: "0.875rem" }}>
              <a href="/region/uk" rel="nofollow" data-testid="nz-uk-link" style={{ color: "#94a3b8", textDecoration: "underline" }}>
                Not in New Zealand? Go to the UK site
              </a>
            </p>
          </header>

          {/* Rates */}
          <section aria-labelledby="rates-heading" style={section}>
            <h2 id="rates-heading" style={h2}>
              How IRD kilometre rates work
            </h2>
            <p style={body}>
              If you&apos;re self-employed and use your car for work, IRD lets you claim the
              business share of your driving at a set rate per kilometre instead of adding up
              every running cost. These are IRD&apos;s rates for the {IRD_LATEST_RATES_YEAR} tax
              year (1 April to 31 March):
            </p>
            <div style={{ ...card, padding: 0, overflowX: "auto", marginBottom: "1rem" }}>
              <table
                data-testid="nz-rate-table"
                style={{ width: "100%", borderCollapse: "collapse", color: "#e2e8f0", fontSize: "0.9375rem" }}
              >
                <caption style={{ textAlign: "left", padding: "0.75rem 1rem", color: "#94a3b8", fontSize: "0.875rem" }}>
                  Rates per km, {IRD_LATEST_RATES_YEAR}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...cell, color: "#fbbf24" }}>Vehicle</th>
                    <th scope="col" style={{ ...cell, color: "#fbbf24" }}>Tier 1</th>
                    <th scope="col" style={{ ...cell, color: "#fbbf24" }}>Tier 2</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.vehicle}>
                      <th scope="row" style={{ ...cell, fontWeight: 600 }}>{r.vehicle}</th>
                      <td style={cell}>{r.tier1}</td>
                      <td style={cell}>{r.tier2}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ ...body, fontSize: "0.875rem" }}>
              Source:{" "}
              <a href={IRD_SOURCES.rates.href} style={link} target="_blank" rel="noopener noreferrer">
                {IRD_SOURCES.rates.label}
              </a>
              .
            </p>

            <h3 style={{ ...strong, fontSize: "1.0625rem", fontWeight: 700, margin: "1.75rem 0 0.75rem" }}>
              The {IRD_TIER1_KM.toLocaleString("en-NZ")} km rule
            </h3>
            <p style={body}>
              Tier 1 covers the business share of the first {IRD_TIER1_KM.toLocaleString("en-NZ")} km
              your car travels in the year, counting personal driving too. Tier 2 covers the business
              share of everything after that. IRD&apos;s own example is a car that travels{" "}
              {example.totalKm} in a year, {example.businessPercent} of it for business. At the{" "}
              {IRD_LATEST_RATES_YEAR} petrol rates:
            </p>
            <ul data-testid="nz-worked-example" style={{ ...body, paddingLeft: "1.25rem" }}>
              <li>
                Tier 1: {example.tier1Km} at {example.tier1Rate} = <strong style={strong}>{example.tier1Amount}</strong>
              </li>
              <li>
                Tier 2: {example.tier2Km} at {example.tier2Rate} = <strong style={strong}>{example.tier2Amount}</strong>
              </li>
              <li>
                Claim: <strong style={strong}>{example.total}</strong>
              </li>
            </ul>
            <p style={body}>
              MileClear counts all your driving for the {IRD_TIER1_KM.toLocaleString("en-NZ")} km,
              because it records your personal trips as well as your business ones.
            </p>

            <h3 style={{ ...strong, fontSize: "1.0625rem", fontWeight: 700, margin: "1.75rem 0 0.75rem" }}>
              Good to know
            </h3>
            <ul style={{ ...body, paddingLeft: "1.25rem" }}>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={strong}>Without a logbook</strong>, IRD limits the claim to{" "}
                {LOGBOOK_RULES.capPercent}% business use: Tier 1 on at most{" "}
                {NO_LOGBOOK_TIER1_KM.toLocaleString("en-NZ")} km of business driving, then Tier 2.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={strong}>Rates come out after the tax year ends.</strong> IRD publishes
                each year&apos;s rates after 31 March, so the {nextRatesYear()} figure is an estimate
                at the {IRD_LATEST_RATES_YEAR} rates until then. MileClear says so on the claim.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={strong}>You choose once per car.</strong> The kilometre rate method is
                chosen for each vehicle in the first year you use it for business, and it can&apos;t be
                changed later. There&apos;s no depreciation on top, and no GST claim on the rates.
              </li>
              <li>
                <strong style={strong}>Which vehicles.</strong> The rates cover cars, vans and utes.
                Motorbikes and scooters are excluded, and other fuels use actual costs. IRD doesn&apos;t
                say which rate a plug-in, diesel or mild hybrid uses, so check with your accountant.
              </li>
            </ul>
            <p style={{ ...body, fontSize: "0.875rem" }}>
              More from IRD:{" "}
              <a href={IRD_SOURCES.vehicleExpenses.href} style={link} target="_blank" rel="noopener noreferrer">
                {IRD_SOURCES.vehicleExpenses.label}
              </a>
              .
            </p>
          </section>

          {/* Logbook */}
          <section aria-labelledby="logbook-heading" style={section}>
            <h2 id="logbook-heading" style={h2}>
              Your {LOGBOOK_RULES.minDays}-day logbook, made from your trips
            </h2>
            <p style={body}>
              To claim your real business share, IRD asks for a logbook that covers at least{" "}
              {LOGBOOK_RULES.minDays} days in a row. It needs the odometer reading on the first and last
              day, and the date, distance and reason for each business trip.
            </p>
            <p style={body}>
              MileClear has already recorded those trips. Choose the car and the first day, and it makes
              the logbook as a PDF or CSV: every trip in km, whether it was Business or Personal, the
              reason, your totals and your business-use percentage. The logbook is part of Pro.
            </p>
            <p style={body}>
              IRD lets you use that percentage for up to {LOGBOOK_RULES.reuseYears} years, as long as your
              business use doesn&apos;t change by more than {LOGBOOK_RULES.reuseChangePercent}%.
            </p>
            <p style={{ ...body, fontSize: "0.875rem" }}>
              IRD&apos;s logbook rules:{" "}
              <a href={IRD_SOURCES.logbook.href} style={link} target="_blank" rel="noopener noreferrer">
                {IRD_SOURCES.logbook.label}
              </a>
              .
            </p>
          </section>

          {/* Who it's for */}
          <section aria-labelledby="who-heading" style={section}>
            <h2 id="who-heading" style={h2}>
              Who MileClear is for
            </h2>
            <ul style={{ ...body, paddingLeft: "1.25rem" }}>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={strong}>Self-employed and sole-trader drivers</strong> claiming the
                business use of their car.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={strong}>Rideshare and delivery drivers</strong> on Uber, Uber Eats,
                DoorDash and DiDi, and couriers.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={strong}>Tradies</strong> driving between jobs.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={strong}>Anyone</strong> who wants a clear record of their driving.
              </li>
              <li>
                <strong style={strong}>Employees</strong>: your employer reimburses you instead, so the
                claim figure is for self-employed driving.
              </li>
            </ul>
          </section>

          {/* Free and Pro */}
          <section aria-labelledby="pricing-heading" style={{ marginBottom: "3.5rem" }}>
            <h2 id="pricing-heading" style={h2}>
              Free, with Pro when you need it
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.25rem",
                maxWidth: 760,
              }}
            >
              <div style={card}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.625rem" }}>
                  Free
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
                  Automatic recording, your trips in km, Business or Personal, and your claim at IRD
                  kilometre rates. No monthly trip limit.
                </p>
              </div>
              <div style={card}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.625rem" }}>
                  Pro
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
                  The {LOGBOOK_RULES.minDays}-day logbook and the downloads.{" "}
                  <span data-testid="nz-pro-price">
                    {NZ_PRO_PRICE_MONTHLY} a month or {NZ_PRO_PRICE_YEARLY} a year, in the App Store.
                  </span>
                </p>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section aria-labelledby="faq-heading" style={{ maxWidth: 760, marginBottom: "4rem" }}>
            <h2 id="faq-heading" style={{ ...h2, marginBottom: "1.5rem" }}>
              Questions
            </h2>
            {faqs.map(({ q, a }, i) => (
              <div
                key={q}
                style={{
                  borderBottom: i < faqs.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  paddingBottom: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "0.5rem" }}>{q}</h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>{a}</p>
              </div>
            ))}
          </section>

          {/* CTA */}
          <section
            style={{
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.15)",
              borderRadius: 16,
              padding: "2.5rem",
              textAlign: "center",
            }}
          >
            <h2 style={{ ...h2, fontSize: "1.625rem", marginBottom: "0.75rem" }}>
              Start recording your drives
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, maxWidth: 520, margin: "0 auto 1.75rem" }}>
              Free to download. Your claim at IRD kilometre rates from your first business trip.
            </p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <StoreButtons align="center" />
            </div>
          </section>
        </div>
      </main>

      {/* A short footer of our own: the site footer lists UK guides. */}
      <footer className="footer">
        <div className="container">
          <p data-testid="nz-disclaimer" style={{ color: "#94a3b8", fontSize: "0.9375rem", marginBottom: "1rem" }}>
            MileClear isn&apos;t affiliated with Inland Revenue. Check your claim with IRD or your accountant.
          </p>
          <nav aria-label="Footer" style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <a href="/privacy" className="footer__link">Privacy</a>
            <a href="/terms" className="footer__link">Terms</a>
            <a href="/support" className="footer__link">Support</a>
            <a href="/accessibility" className="footer__link">Accessibility</a>
          </nav>
          <div className="footer__copy">
            <span>&copy; 2026 MileClear</span>
          </div>
        </div>
      </footer>
    </>
  );
}
