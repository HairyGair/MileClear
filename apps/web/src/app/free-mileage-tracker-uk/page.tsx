import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: {
    absolute: "Free Mileage Tracker UK - Unlimited Trips, No Drive Cap | MileClear",
  },
  description:
    "The only UK mileage tracker with no monthly drive cap. MileIQ stops you at 40 drives, Driversnote at 20 - MileClear tracks unlimited trips, free forever. HMRC 55p/25p rates built in. Pro is only for accountant-ready exports.",
  keywords: [
    "free mileage tracker uk",
    "free mileage tracker",
    "free uk mileage app",
    "best free mileage tracker uk",
    "free business mileage tracker",
    "free hmrc mileage app",
    "mileage tracker no subscription",
  ],
  alternates: {
    canonical: "https://mileclear.com/free-mileage-tracker-uk",
  },
  openGraph: {
    title: "Free Mileage Tracker UK - No Card, No Trial | MileClear",
    description:
      "Auto-track every business mile, HMRC rates built in, unlimited trips. Free forever.",
    url: "https://mileclear.com/free-mileage-tracker-uk",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Mileage Tracker UK - No Card, No Trial",
    description:
      "Auto-track every business mile, HMRC rates built in, unlimited trips. Free forever.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Free Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/free-mileage-tracker-uk",
  description:
    "MileClear is a free UK mileage tracker - unlimited trips, HMRC rates, vehicle tracking, fuel logging. Pro tier only for tax-export PDFs.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Free Mileage Tracker UK",
        item: "https://mileclear.com/free-mileage-tracker-uk",
      },
    ],
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is MileClear really a free mileage tracker?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes - and unlike the big-name competition, the tracker is unlimited. MileIQ caps free users at 40 drives a month, TripLog caps at 40, Driversnote caps at 20; once you hit the cap you stop tracking or you pay. MileClear has no monthly drive cap at all - track as many trips as you like, forever, without paying. Pro (£4.99/month) unlocks HMRC-ready PDF exports, business insights, CSV imports, and open-banking earnings sync - but the tracking, classification, HMRC rate calculation and vehicle records stay free forever.",
      },
    },
    {
      "@type": "Question",
      name: "What is included in the free tier?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Free includes: unlimited GPS-tracked trips, business / personal classification, platform tagging for gig drivers, HMRC 55p/25p/24p rate calculation (the car/van first-tier rate rose from 45p to 55p on 6 April 2026), one vehicle with DVLA lookup, fuel logging with live UK prices from 8,300+ stations, all 18 achievements, streaks and personal records, weekly and monthly recaps, two saved locations, the Tax Readiness card, the Self Assessment wizard view, AMAP calculator, and MOT + tax reminders.",
      },
    },
    {
      "@type": "Question",
      name: "What do I need to pay for?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Pro (£4.99/month or £44.99/year) gives you: the printable HMRC Self Assessment PDF, CSV export, CSV bulk-import of platform earnings, open-banking earnings sync, Auto-Classify Rules (work-schedule-driven), Business Insights (earnings per mile/hour, platform comparison, golden hours), driving analytics with multi-month trends, unlimited saved locations, unlimited vehicles, accountant sharing, and the Journey Map.",
      },
    },
    {
      "@type": "Question",
      name: "Why is the basic tracking free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Because tracking your own mileage shouldn't cost money. The deduction is yours - MileClear's job is to make claiming it easy. The Pro tier exists to cover the real costs that come with tax-time work: PDF generation, open-banking API fees, accountant sharing infrastructure. Everything else stays free.",
      },
    },
    {
      "@type": "Question",
      name: "Are there ads in the free tier?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. MileClear has never had ads and will never have ads. The free tier is supported by users on the Pro tier choosing to pay for tax-time features. That's it.",
      },
    },
    {
      "@type": "Question",
      name: "Will free features ever move to Pro?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We've actually done the opposite. In May 2026 we moved five Pro features to free (all achievements, all recap periods, the Self Assessment wizard view, Tax Readiness card, and Work Schedule editor). If a feature fights your corner with HMRC or helps you compare your work fairly, it belongs in free.",
      },
    },
  ],
};

export default function FreeMileageTrackerUk() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <Navbar />

      <main style={{ background: "#030712", paddingTop: "6rem", paddingBottom: "5rem" }}>
        <div className="container">

          {/* Hero */}
          <header style={{ maxWidth: 780, marginBottom: "3.5rem" }}>
            <span className="label" style={{ display: "inline-block", marginBottom: "1rem" }}>
              Free Mileage Tracker UK
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
              Unlimited Mileage Tracking. Free Forever. No Drive Cap.
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              Every other big-name mileage app rations you. MileIQ stops you at 40 drives a month
              unless you pay £5.99. TripLog caps at 40. Driversnote caps at 20. MileClear has
              <strong> no monthly drive cap at all</strong> - track every business mile you drive,
              forever, without paying a penny. HMRC 55p/25p rates built in (rate rose from 45p on
              6 April 2026), fuel prices from 8,300+ UK stations, all 18 achievements, vehicle
              records and a Self Assessment wizard view - free. Pro (£4.99/mo) only unlocks the
              tax-time export PDF and a few power-user extras. It never gates the tracker.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
              <a
                href="https://apps.apple.com/app/mileclear/id6759671005"
                style={{
                  background: "#fbbf24",
                  color: "#030712",
                  fontWeight: 700,
                  fontSize: "0.9375rem",
                  padding: "0.75rem 1.75rem",
                  borderRadius: 9999,
                  display: "inline-block",
                }}
              >
                Download Free on App Store
              </a>
              <a
                href="/#pricing"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "#e2e8f0",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  padding: "0.75rem 1.75rem",
                  borderRadius: 9999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "inline-block",
                }}
              >
                Compare Free vs Pro
              </a>
            </div>
          </header>

          {/* Why we have a free tier */}
          <section
            aria-labelledby="why-free-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="why-free-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Why the Tracking Is Free
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The mileage deduction is yours. HMRC's AMAP relief - 55p per mile for the first 10,000
              business miles (raised from 45p on 6 April 2026), then 25p after - is a right you have
              as a UK self-employed person.
              MileClear's job is to make claiming it easy. Charging for the basic act of recording your
              own miles felt wrong to us, so we don't.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The Pro tier exists to cover the real costs that come with tax-time work - PDF
              generation, open-banking API fees, accountant-sharing infrastructure, multi-month
              analytics queries. Pay-once-tap-export is a fair value exchange. Pay-to-record-a-trip is not.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              And there are no ads. There will never be ads. Free is paid for by the people who choose Pro,
              not by selling you anything.
            </p>
          </section>

          {/* Free vs Pro side by side */}
          <section
            aria-labelledby="compare-heading"
            style={{ marginBottom: "3.5rem" }}
          >
            <h2
              id="compare-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.5rem",
              }}
            >
              What's Free vs What's Pro
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.25rem",
              }}
            >
              <div
                style={{
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  padding: "1.5rem",
                }}
              >
                <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.875rem" }}>
                  Free Forever
                </h3>
                <ul style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.8, paddingLeft: "1.25rem", margin: 0 }}>
                  <li>Unlimited GPS-tracked trips</li>
                  <li>Business / personal classification</li>
                  <li>HMRC 55p/25p/24p calculation (rate rose from 45p on 6 April 2026)</li>
                  <li>Platform tagging (Uber/Deliveroo/etc)</li>
                  <li>1 vehicle with DVLA lookup</li>
                  <li>Fuel logging + 8,300+ UK price feeds</li>
                  <li>All 18 achievements + streaks</li>
                  <li>Daily, weekly, monthly, yearly recaps</li>
                  <li>2 saved locations</li>
                  <li>Tax Readiness card</li>
                  <li>Self Assessment wizard view</li>
                  <li>Activity heatmap + benchmarking</li>
                  <li>MOT + tax expiry reminders</li>
                  <li>Manual expense tracking</li>
                  <li>Push notifications, profile, feedback</li>
                </ul>
              </div>

              <div
                style={{
                  background: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.20)",
                  borderRadius: 14,
                  padding: "1.5rem",
                }}
              >
                <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.875rem" }}>
                  Pro (£4.99/mo or £44.99/yr)
                </h3>
                <ul style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.8, paddingLeft: "1.25rem", margin: 0 }}>
                  <li>HMRC Self Assessment PDF download</li>
                  <li>CSV export (all data)</li>
                  <li>PDF trip report</li>
                  <li>Bulk CSV earnings import</li>
                  <li>Open Banking earnings sync</li>
                  <li>Auto-Classify Rules (schedule-driven)</li>
                  <li>Business Insights (£/mile, £/hour, golden hours)</li>
                  <li>Driving Analytics multi-month trends</li>
                  <li>Pickup Wait community insights</li>
                  <li>Accountant sharing (read-only dashboard)</li>
                  <li>Journey Map (full-route visualisation)</li>
                  <li>Unlimited saved locations</li>
                  <li>Unlimited vehicles</li>
                </ul>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section style={{ maxWidth: 760, marginBottom: "4rem" }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.5rem",
              }}
            >
              Free Mileage Tracker FAQ
            </h2>
            {[
              {
                q: "Is MileClear really a free mileage tracker?",
                a: "Yes. Free to download, free to use, no card, no trial, no trip limit. Pro is optional and only unlocks tax-export PDF + power-user extras.",
              },
              {
                q: "What's included in the free tier?",
                a: "Unlimited GPS tracking, HMRC rate calculation, classification, fuel prices, achievements, recaps, vehicle records, Tax Readiness card, Self Assessment wizard view, AMAP calculator, MOT + tax reminders, expense tracking. Two saved locations and one vehicle on free.",
              },
              {
                q: "What's behind the paywall?",
                a: "Pro covers: HMRC Self Assessment PDF, CSV export + import, open banking, Auto-Classify Rules, Business Insights, multi-month analytics, accountant sharing, Journey Map, unlimited vehicles and saved locations.",
              },
              {
                q: "Why is the tracking free?",
                a: "The deduction is yours - charging for the act of recording miles felt wrong to us. Pro exists to cover real per-user costs (PDF generation, banking APIs). No ads, ever.",
              },
              {
                q: "Will free features move to Pro later?",
                a: "We've done the opposite. In May 2026 we moved five Pro features (all achievements, all recap periods, Self Assessment wizard, Tax Readiness card, Work Schedule editor) to free.",
              },
              {
                q: "Are there hidden costs?",
                a: "No. The App Store listing shows the full price clearly. There are no in-app currencies, no upsells beyond the Pro upgrade, no premium support tier.",
              },
            ].map(({ q, a }, i, arr) => (
              <div
                key={q}
                style={{
                  borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  paddingBottom: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "0.5rem" }}>
                  {q}
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>{a}</p>
              </div>
            ))}
          </section>

          {/* Related */}
          <section style={{ marginBottom: "3.5rem" }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1rem",
              }}
            >
              More UK Mileage Tracker Resources
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/mileage-tracker-uk", label: "Mileage Tracker UK" },
                { href: "/self-employed-mileage-tracker", label: "Self-Employed" },
                { href: "/hmrc-mileage-rates", label: "HMRC Rates" },
                { href: "/business-mileage-guide", label: "Business Mileage Guide" },
                { href: "/mileclear-vs-mileiq", label: "vs MileIQ" },
                { href: "/delivery-driver-mileage-tracker", label: "Delivery Drivers" },
                { href: "/employee-mileage-tracker", label: "PAYE Employees" },
                { href: "/#pricing", label: "Pricing" },
                { href: "/updates", label: "Blog" },
              ].map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                    padding: "0.5rem 1rem",
                    borderRadius: 9999,
                    display: "inline-block",
                  }}
                >
                  {label}
                </a>
              ))}
            </div>
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
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.625rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "0.75rem",
              }}
            >
              Start Tracking - Free
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, marginBottom: "1.75rem", maxWidth: 520, margin: "0 auto 1.75rem" }}>
              No card. No trial. Just download and drive. We'll be here when you want the tax-export PDF.
            </p>
            <a
              href="https://apps.apple.com/app/mileclear/id6759671005"
              style={{
                background: "#fbbf24",
                color: "#030712",
                fontWeight: 700,
                fontSize: "0.9375rem",
                padding: "0.75rem 1.75rem",
                borderRadius: 9999,
                display: "inline-block",
              }}
            >
              Download Free on App Store
            </a>
          </section>

        </div>
      </main>

      <Footer />
    </>
  );
}
