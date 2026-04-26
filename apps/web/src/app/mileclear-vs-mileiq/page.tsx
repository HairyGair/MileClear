import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "MileClear vs MileIQ - Best UK Mileage Tracker Comparison",
  description:
    "Comparing MileClear and MileIQ for UK drivers. MileClear uses HMRC rates natively, costs half the price, tags Uber and Deliveroo trips, and works offline. See the full breakdown.",
  keywords: [
    "mileiq alternative uk",
    "best mileage tracker uk 2026",
    "mileclear vs mileiq",
    "uk mileage tracker comparison",
    "hmrc mileage app",
  ],
  alternates: {
    canonical: "https://mileclear.com/mileclear-vs-mileiq",
  },
  openGraph: {
    title: "MileClear vs MileIQ - UK Mileage Tracker Comparison",
    description:
      "MileClear is built for UK drivers from the ground up. HMRC rates, gig platform tagging, offline tracking, and half the price of MileIQ.",
    url: "https://mileclear.com/mileclear-vs-mileiq",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MileClear vs MileIQ - UK Mileage Tracker Comparison",
    description:
      "MileClear is built for UK drivers from the ground up. HMRC rates, gig platform tagging, offline tracking, and half the price of MileIQ.",
    images: ["/branding/og-image.png"],
  },
};

const comparisonSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "MileClear vs MileIQ - UK Mileage Tracker Comparison",
  url: "https://mileclear.com/mileclear-vs-mileiq",
  description:
    "A detailed comparison of MileClear and MileIQ for UK drivers, covering pricing, HMRC compliance, platform support, and offline capability.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "MileClear vs MileIQ",
        item: "https://mileclear.com/mileclear-vs-mileiq",
      },
    ],
  },
};

const productSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MileClear",
  applicationCategory: "BusinessApplication",
  operatingSystem: "iOS",
  downloadUrl: "https://apps.apple.com/app/mileclear/id6742044832",
  description:
    "The UK mileage tracker built for gig workers. HMRC-native rates, gig platform tagging, offline-first tracking, and a generous free tier.",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "GBP",
      description: "Unlimited trip tracking, HMRC calculator, achievements, saved locations.",
    },
    {
      "@type": "Offer",
      name: "Pro",
      price: "4.99",
      priceCurrency: "GBP",
      description: "Self Assessment wizard, HMRC-ready PDF exports with attestation cover sheet, Accountant Portal, receipt OCR, business insights, pickup-wait community insights, unlimited saved locations.",
    },
  ],
};

export default function MileClearVsMileIQ() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(comparisonSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />

      <Navbar />

      <main style={{ background: "#030712", paddingTop: "6rem", paddingBottom: "5rem" }}>
        <div className="container">

          {/* Hero */}
          <header style={{ maxWidth: 780, marginBottom: "3.5rem" }}>
            <span
              className="label"
              style={{ display: "inline-block", marginBottom: "1rem" }}
            >
              Comparison
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
              MileClear vs MileIQ - Which Mileage Tracker is Right for UK Drivers?
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              Choosing a mileage tracker as a UK driver in 2026 means looking past the big American brand names.
              MileIQ is well-established and widely recognised, but it was built for the US market. MileClear was
              designed from day one for UK drivers - using HMRC rates by default, tagging gig platforms like Uber
              and Deliveroo, and working completely offline. This comparison breaks down the key differences so you
              can decide which one actually suits how you drive.
            </p>
          </header>

          {/* Comparison Table */}
          <section aria-labelledby="comparison-table-heading" style={{ marginBottom: "4rem" }}>
            <h2
              id="comparison-table-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.5rem",
              }}
            >
              Side-by-Side Comparison
            </h2>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "1rem 1.25rem",
                        color: "#64748b",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        width: "35%",
                      }}
                    >
                      Feature
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "1rem 1.25rem",
                        color: "#fbbf24",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        width: "32.5%",
                      }}
                    >
                      MileClear
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "1rem 1.25rem",
                        color: "#64748b",
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        width: "32.5%",
                      }}
                    >
                      MileIQ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      feature: "Price",
                      mileclear: "Free tier + £4.99/mo Pro",
                      mileiq: "~£7.99/mo (paid-only for full features)",
                      highlight: true,
                    },
                    {
                      feature: "HMRC Rate Support",
                      mileclear: "UK-native: 45p/25p car, 24p motorbike",
                      mileiq: "IRS rates by default - manual HMRC setup required",
                      highlight: true,
                    },
                    {
                      feature: "Tax Readiness Card",
                      mileclear: "Live tax + NI estimate, weekly set-aside, deadline countdown (free)",
                      mileiq: "Not available",
                      highlight: true,
                    },
                    {
                      feature: "Anonymous Benchmarking",
                      mileclear: "Your weekly miles and trips vs other UK drivers, with privacy-floored aggregation (free)",
                      mileiq: "Not available",
                      highlight: true,
                    },
                    {
                      feature: "HMRC Reconciliation",
                      mileclear: "Compare what HMRC sees against what you tracked, per platform (free)",
                      mileiq: "Not available",
                      highlight: true,
                    },
                    {
                      feature: "MOT & Tax Reminders",
                      mileclear: "DVLA-driven push 14 days before expiry + full DVSA MOT history with advisories (free)",
                      mileiq: "Not available",
                      highlight: true,
                    },
                    {
                      feature: "Gig Platform Tagging",
                      mileclear: "Uber, Deliveroo, Amazon Flex, Just Eat, DPD, Evri, Stuart, plus 3 more",
                      mileiq: "Generic business/personal only",
                      highlight: true,
                    },
                    {
                      feature: "Pickup Wait Tracking",
                      mileclear: "Personal timer free; community insights (\"this McDonald's averages 12-min waits\") on Pro",
                      mileiq: "Not available",
                      highlight: true,
                    },
                    {
                      feature: "Self Assessment Wizard",
                      mileclear: "Step-by-step mapping to HMRC SA103 form boxes (Pro)",
                      mileiq: "Not available - exports only",
                      highlight: false,
                    },
                    {
                      feature: "Accountant Portal",
                      mileclear: "Invite by email to a read-only dashboard (Pro)",
                      mileiq: "Not available",
                      highlight: false,
                    },
                    {
                      feature: "Receipt Scanning",
                      mileclear: "On-device OCR for parking, fuel, tolls (Pro)",
                      mileiq: "Not available",
                      highlight: false,
                    },
                    {
                      feature: "Offline Mode",
                      mileclear: "Offline-first - trips saved locally, sync when back online",
                      mileiq: "Requires internet connection for full functionality",
                      highlight: false,
                    },
                    {
                      feature: "Tax Export",
                      mileclear: "PDF mileage log with signed HMRC attestation cover sheet (Pro)",
                      mileiq: "PDF and Excel reports available",
                      highlight: false,
                    },
                    {
                      feature: "Fuel Prices",
                      mileclear: "8,300+ UK stations via government-mandated feeds (free)",
                      mileiq: "Not included",
                      highlight: true,
                    },
                    {
                      feature: "Activity Heatmap",
                      mileclear: "When you drive and earn most, by hour and platform (free)",
                      mileiq: "Not available",
                      highlight: false,
                    },
                    {
                      feature: "Shift Mode",
                      mileclear: "Full shift tracking with scorecard, platform P&L, golden hours (free, Pro for advanced)",
                      mileiq: "Not included",
                      highlight: false,
                    },
                    {
                      feature: "Earnings Tracking",
                      mileclear: "Manual logging free; CSV import from gig platforms (Pro)",
                      mileiq: "Basic income tracking",
                      highlight: false,
                    },
                    {
                      feature: "Gamification",
                      mileclear: "Achievements, streaks, personal records, shift scorecards",
                      mileiq: "Not included",
                      highlight: false,
                    },
                    {
                      feature: "OS Support",
                      mileclear: "iOS now, Android on roadmap",
                      mileiq: "iOS and Android",
                      highlight: false,
                    },
                  ].map(({ feature, mileclear, mileiq, highlight }, i) => (
                    <tr
                      key={feature}
                      style={{
                        borderBottom: i < 10 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                        background: highlight ? "rgba(251,191,36,0.03)" : undefined,
                      }}
                    >
                      <td
                        style={{
                          padding: "0.875rem 1.25rem",
                          color: "#e2e8f0",
                          fontSize: "0.9375rem",
                          fontWeight: 600,
                        }}
                      >
                        {feature}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1.25rem",
                          color: "#34d399",
                          fontSize: "0.9rem",
                          lineHeight: 1.5,
                        }}
                      >
                        {mileclear}
                      </td>
                      <td
                        style={{
                          padding: "0.875rem 1.25rem",
                          color: "#94a3b8",
                          fontSize: "0.9rem",
                          lineHeight: 1.5,
                        }}
                      >
                        {mileiq}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Divider */}
          <div className="divider" style={{ marginBottom: "4rem" }} />

          {/* Key differences */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "2rem",
              marginBottom: "4rem",
            }}
          >

            {/* Section 1 */}
            <section
              aria-labelledby="hmrc-heading"
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14,
                padding: "1.75rem",
              }}
            >
              <h2
                id="hmrc-heading"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#f9fafb",
                  marginBottom: "0.875rem",
                }}
              >
                Built for HMRC, Not the IRS
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
                MileIQ is an American product. When you first open it as a UK driver, you are looking at
                mileage rates that have nothing to do with HMRC. You either configure it manually - or you
                end up calculating the wrong deductions for your self-assessment return.
              </p>
              <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
                MileClear uses HMRC rates as the default with no setup required: 45p per mile for the first
                10,000 business miles, 25p per mile after that for cars and vans, and 24p flat for
                motorbikes. Your tax deduction total is correct from the moment you start tracking. If you
                drive for work in the UK, this is not a minor convenience - it is the difference between
                accurate and inaccurate records.
              </p>
            </section>

            {/* Section 2 */}
            <section
              aria-labelledby="price-heading"
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14,
                padding: "1.75rem",
              }}
            >
              <h2
                id="price-heading"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#f9fafb",
                  marginBottom: "0.875rem",
                }}
              >
                Half the Price with a Full Free Tier
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
                MileIQ&apos;s pricing puts most useful features behind a paywall with a very limited free
                tier. MileClear gives you unlimited trip tracking, the live Tax Readiness card, Anonymous
                Benchmarking, HMRC Reconciliation, MOT and tax expiry reminders, the Activity Heatmap,
                shift mode, automatic drive detection, achievements, and real-time fuel prices for free -
                with no cap on the number of trips.
              </p>
              <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
                Pro is £4.99 per month - roughly 60% of what MileIQ charges - and adds the Self Assessment
                wizard, HMRC-ready PDF and CSV exports with a signed attestation cover sheet, the Accountant
                Portal, on-device receipt scanning, CSV earnings import from gig platforms, business insights,
                and unlimited saved locations. If you only need the Tax Readiness card, Anonymous Benchmarking,
                MOT reminders, and trip tracking, MileClear is free forever.
              </p>
            </section>

            {/* Section 3 */}
            <section
              aria-labelledby="gig-heading"
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14,
                padding: "1.75rem",
              }}
            >
              <h2
                id="gig-heading"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#f9fafb",
                  marginBottom: "0.875rem",
                }}
              >
                Gig Platform Intelligence
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
                MileIQ classifies trips as either business or personal. That is fine if you have a single
                employer, but it tells you almost nothing if you drive for multiple platforms. MileClear
                lets you tag every trip and shift with the platform you were working for: Uber, Deliveroo,
                Amazon Flex, Just Eat, Stuart, Gophr, DPD, Yodel, Evri, or Bolt.
              </p>
              <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
                This means you can see earnings per mile, earnings per hour, and a side-by-side platform
                comparison - so you know exactly which platforms are paying their way and which ones are
                costing you money once fuel and depreciation are factored in. No other UK mileage app
                offers this level of per-platform breakdown.
              </p>
            </section>

            {/* Section 4 */}
            <section
              aria-labelledby="offline-heading"
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 14,
                padding: "1.75rem",
              }}
            >
              <h2
                id="offline-heading"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "#f9fafb",
                  marginBottom: "0.875rem",
                }}
              >
                Offline-First Reliability
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
                Delivery drivers and couriers frequently work in areas with poor mobile signal - industrial
                estates, underground car parks, rural postcodes. MileClear stores every trip locally on
                your device first using SQLite, then syncs to the server when you have a connection. You
                never lose a trip because of a dropped signal.
              </p>
              <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
                MileIQ depends on a server connection for full functionality. If you drive in areas where
                signal is unreliable, that is a real risk. Offline-first is not a premium feature in
                MileClear - it is how the app works by default.
              </p>
            </section>
          </div>

          {/* Strengths of MileIQ */}
          <section
            aria-labelledby="mileiq-strengths-heading"
            style={{
              background: "rgba(15,23,42,0.4)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: "2rem",
              marginBottom: "4rem",
            }}
          >
            <h2
              id="mileiq-strengths-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1rem",
              }}
            >
              Where MileIQ Still Wins
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              It would not be a fair comparison without acknowledging where MileIQ has an advantage. MileIQ
              is available on both iOS and Android, which gives it a clear edge over MileClear right now.
              MileClear is currently iOS-only, with Android on the roadmap. If you use an Android device,
              MileIQ or one of the other alternatives may be your only option until Android launches.
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              MileIQ also has a longer track record and a larger user base, which can matter if you want
              an app with years of reliability data behind it. MileClear launched in 2026 and is still
              building its reputation - though it already has drivers across the UK using it daily. If you
              are on iOS and drive for a gig platform in the UK, MileClear is almost certainly the better
              fit. If you are on Android or want the most established option regardless of UK-native
              features, MileIQ remains a legitimate choice.
            </p>
          </section>

          {/* Long-form SEO content */}
          <section style={{ maxWidth: 760, marginBottom: "4rem" }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              What Actually Matters for UK Mileage Tracking in 2026
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The gig economy in the UK has grown significantly. Millions of drivers work across Uber,
              Deliveroo, Amazon Flex, Just Eat, DPD, and similar platforms - often juggling two or three at
              once. The tax rules for these workers are clear: you can claim 45p per mile for the first 10,000
              business miles in each tax year, then 25p per mile beyond that. For motorbikes, it is 24p flat.
              These HMRC Approved Mileage Allowance Payments (AMAP) rates are how self-employed drivers
              calculate the vehicle-running-cost portion of their self-assessment return.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              A mileage tracker that gets this wrong - or requires manual configuration - creates real risk.
              If you file a self-assessment return with incorrect mileage rates, you could under-claim your
              deductions (costing you money) or over-claim them (creating a problem with HMRC). Using a
              US-built app without properly configuring the rates is an easy mistake to make.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Beyond the rates themselves, gig workers need to track what counts as a business mile. For Uber
              drivers, that means passenger trips and positioning miles (driving to a busier area to pick up
              jobs), but not the commute from home to your first pickup location. For Deliveroo riders, that
              means restaurant-to-customer miles and repositioning, but cycles are treated differently from
              motorbikes under HMRC rules. These details matter, and a generic mileage app cannot help you
              work through them.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              MileClear was built with these specifics in mind. The shift mode lets you group trips into
              working sessions that mirror how gig work actually happens - you start your shift, track every
              trip within it, then end the shift and get a scorecard showing your total miles, earnings per
              mile, and how that compares to your previous shifts. The platform tags let you attribute each
              trip to the right platform so your records are accurate if HMRC ever asks to see them.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              You can also compare MileClear with other alternatives. See how it compares for{" "}
              <a href="/uber-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                Uber drivers
              </a>
              ,{" "}
              <a href="/deliveroo-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                Deliveroo riders
              </a>
              , and{" "}
              <a href="/amazon-flex-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                Amazon Flex drivers
              </a>
              . If you want a detailed look at everything MileClear can do, visit the{" "}
              <a href="/#features" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                features page
              </a>{" "}
              or check the{" "}
              <a href="/#pricing" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                pricing page
              </a>{" "}
              to see exactly what is included for free and what is in Pro.
            </p>
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
              Common Questions
            </h2>
            {[
              {
                q: "Can I import my MileIQ trips into MileClear?",
                a: "You can manually add past trips to MileClear, or import earnings history via CSV. Direct MileIQ import is not currently supported, but most UK drivers find it easier to start fresh from the date they switch - your historical records from MileIQ remain accessible in that app.",
              },
              {
                q: "Does MileClear work for employed drivers claiming mileage from their employer?",
                a: "Yes. You can track all your business trips and export a mileage log your employer can use to reimburse you at HMRC rates. If your employer pays less than the HMRC rate, you can also claim the difference on your self-assessment return.",
              },
              {
                q: "Is there a free trial for MileClear Pro?",
                a: "MileClear's free tier is genuinely unlimited for trip tracking - there is no trial period, it is just free. The Tax Readiness card, Anonymous Benchmarking, HMRC Reconciliation, and MOT reminders are all on the free tier. Pro features like the Self Assessment wizard, PDF exports, and the Accountant Portal can be unlocked at any time for £4.99 per month.",
              },
              {
                q: "Does MileClear work without internet?",
                a: "Yes. Trips are recorded to your device first and synced when you are back online. You never lose data due to a signal drop.",
              },
            ].map(({ q, a }) => (
              <div
                key={q}
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  paddingBottom: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "#e2e8f0",
                    marginBottom: "0.5rem",
                  }}
                >
                  {q}
                </h3>
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
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.625rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "0.75rem",
              }}
            >
              Ready to Switch to the UK-Native Option?
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, marginBottom: "1.75rem", maxWidth: 520, margin: "0 auto 1.75rem" }}>
              Download MileClear free on the App Store. No credit card required. Start tracking your miles
              with HMRC rates from day one.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <a
                href="https://apps.apple.com/app/mileclear/id6742044832"
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
                Download on the App Store
              </a>
              <a
                href="/#features"
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
                See All Features
              </a>
            </div>
          </section>

        </div>
      </main>

      <Footer />
    </>
  );
}
