import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Best Mileage Tracker App UK (2026) - Free Tracking Compared",
  description:
    "The best mileage tracker apps for UK drivers in 2026, compared on what actually matters: what it costs to track your miles, and whether it does the HMRC maths. MileClear tracks unlimited miles free; MileIQ caps at 40 drives, Driversnote at 15.",
  keywords: [
    "best mileage tracker app uk",
    "best free mileage tracker app uk",
    "best mileage tracker uk 2026",
    "free mileage tracker uk",
    "mileiq alternatives",
    "mileage tracker comparison uk",
  ],
  alternates: {
    canonical: "https://mileclear.com/best-mileage-tracker-app-uk",
  },
  openGraph: {
    title: "Best Mileage Tracker App UK (2026) - Free Tracking Compared",
    description:
      "The best UK mileage tracker apps compared on what it costs to track your miles and whether they speak HMRC. MileClear tracks unlimited miles for free.",
    url: "https://mileclear.com/best-mileage-tracker-app-uk",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Mileage Tracker App UK (2026) - Free Tracking Compared",
    description:
      "The best UK mileage tracker apps compared on what it costs to track your miles and whether they speak HMRC.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Best Mileage Tracker App UK (2026) - Compared",
  url: "https://mileclear.com/best-mileage-tracker-app-uk",
  description:
    "An honest 2026 comparison of the best mileage tracker apps for UK drivers, ranked on free tracking limits, HMRC-native tax calculations, price, and gig-platform support.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Best Mileage Tracker App UK",
        item: "https://mileclear.com/best-mileage-tracker-app-uk",
      },
    ],
  },
};

// ItemList of the apps reviewed, in the order we rank them for UK drivers.
const itemListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Best Mileage Tracker Apps for UK Drivers (2026)",
  itemListOrder: "https://schema.org/ItemListOrderAscending",
  numberOfItems: 4,
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "MileClear", url: "https://mileclear.com" },
    { "@type": "ListItem", position: 2, name: "TripLog" },
    { "@type": "ListItem", position: 3, name: "MileIQ" },
    { "@type": "ListItem", position: 4, name: "Driversnote" },
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the best free mileage tracker app in the UK?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "For UK drivers, MileClear is the best free mileage tracker because it tracks unlimited miles at no cost AND does the HMRC maths for free - applying the 55p/25p AMAP rates automatically. Most rivals cap free tracking (MileIQ at 40 drives a month, Driversnote at 15) or, like TripLog, offer free tracking but gate the reports and use US/IRS rates by default. If 'free' means you can actually track every business mile and see your correct HMRC deduction without paying, MileClear is the one to beat.",
      },
    },
    {
      "@type": "Question",
      name: "Do any mileage tracker apps let you track unlimited miles for free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes - MileClear and TripLog both offer unlimited free automatic tracking. The difference is what else is free. MileClear's free tier also includes the HMRC deduction calculator, Tax Readiness card and MOT reminders, and applies UK rates by default. TripLog's free Basic plan tracks unlimited miles but gates reporting and web access behind a 7-day premium pass per year, and defaults to US IRS rates. MileIQ (40 drives/month) and Driversnote (15 trips/month) cap free tracking outright.",
      },
    },
    {
      "@type": "Question",
      name: "Is MileIQ good for UK drivers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MileIQ is a well-established, reliable tracker available on iOS and Android, but it was built for the US market and defaults to IRS mileage rates, so UK drivers must configure HMRC rates manually or risk filing the wrong deduction. Its free tier stops at 40 drives a month, and its paid price more than doubled in 2026. It works, but a UK driver has to do more setup and pay more than with a UK-native option.",
      },
    },
    {
      "@type": "Question",
      name: "What should a UK gig or delivery driver look for in a mileage tracker?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Three things: (1) no cap on free tracking, because a delivery or private-hire driver blows past a 15-40 drive monthly limit in days; (2) HMRC-native rates and a UK tax deduction total, not IRS rates you have to reconfigure; and (3) per-platform tagging so you can attribute trips to Uber, Deliveroo, Amazon Flex and the rest for both tax and earnings analysis. MileClear was built around all three; most US-first apps miss at least one.",
      },
    },
    {
      "@type": "Question",
      name: "How much does MileClear cost?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MileClear's tracking is free forever with no monthly cap, and the HMRC calculator, Tax Readiness card, Anonymous Benchmarking and MOT reminders are free too. Pro is £4.99 per month (or £44.99 a year) and adds HMRC-ready PDF and CSV exports, the Self Assessment wizard, receipt scanning and business insights. You only need Pro when you want to export a formal claim.",
      },
    },
  ],
};

// Comparison rows. Facts verified mid-2026. Competitor prices shown as
// published (US pricing where UK GBP is not publicly listed); the decision
// axes are the free-tier limits and HMRC-native support.
const ROWS: Array<{ feature: string; mc: string; triplog: string; mileiq: string; driversnote: string; highlight?: boolean }> = [
  {
    feature: "Free mile tracking",
    mc: "Unlimited, free forever",
    triplog: "Unlimited (Basic plan)",
    mileiq: "40 drives/month, then paid",
    driversnote: "15 trips/month, then paid",
    highlight: true,
  },
  {
    feature: "Free HMRC tax tools",
    mc: "Deduction calculator, Tax Readiness, MOT reminders - all free",
    triplog: "Reporting gated to a 7-day pass/year",
    mileiq: "Paid feature",
    driversnote: "Paid feature",
    highlight: true,
  },
  {
    feature: "HMRC rates by default",
    mc: "Yes - 55p/25p car (raised from 45p on 6 Apr 2026), tax-year aware",
    triplog: "No - US IRS rates, manual UK setup",
    mileiq: "No - US IRS rates, manual UK setup",
    driversnote: "Generic rate entry",
    highlight: true,
  },
  {
    feature: "Gig platform tagging",
    mc: "Uber, Deliveroo, Amazon Flex, Just Eat, DPD, Evri, Stuart + more",
    triplog: "Generic categories",
    mileiq: "Business / personal only",
    driversnote: "Generic categories",
    highlight: true,
  },
  {
    feature: "Paid plan",
    mc: "£4.99/mo or £44.99/yr",
    triplog: "Tiered paid plans for reporting/teams",
    mileiq: "Paid-only after cap (price more than doubled in 2026)",
    driversnote: "Paid plan for 15+ trips",
    highlight: true,
  },
  {
    feature: "Offline-first",
    mc: "Yes - saves on-device, syncs later",
    triplog: "Partial",
    mileiq: "Needs a connection for full function",
    driversnote: "Partial",
  },
  {
    feature: "Platforms",
    mc: "iOS now, Android on the roadmap",
    triplog: "iOS + Android",
    mileiq: "iOS + Android",
    driversnote: "iOS + Android",
  },
];

const VERDICTS = [
  {
    name: "MileClear",
    tag: "Best for UK drivers who want free tracking + HMRC done for them",
    body:
      "The only app on this list that pairs unlimited free tracking with free HMRC tax tooling. It applies the 55p/25p AMAP rates automatically, tags gig platforms, works offline, and keeps the whole tracker free forever - Pro (£4.99/mo) is only for exports and the Self Assessment wizard. The catch: iOS only for now, with Android on the roadmap.",
    accent: "#fbbf24",
  },
  {
    name: "TripLog",
    tag: "Also offers free unlimited tracking, but US-first",
    body:
      "TripLog's free Basic plan now tracks unlimited miles, which makes it a genuine free option. But it is a US product: it defaults to IRS rates, so UK drivers must reconfigure, and it gates reporting and web access behind a 7-day premium pass each year. Strong feature set if you are comfortable doing the HMRC setup yourself.",
    accent: "#94a3b8",
  },
  {
    name: "MileIQ",
    tag: "Established and cross-platform, but capped and pricey",
    body:
      "The best-known name, on both iOS and Android, with a long track record. For UK drivers the downsides are real: IRS rates by default, a 40-drive-a-month free cap, and a paid price that more than doubled in 2026. Fine if you want the most established option and do not mind the setup and cost.",
    accent: "#94a3b8",
  },
  {
    name: "Driversnote",
    tag: "Simple, but the tightest free cap",
    body:
      "A clean, simple tracker on iOS and Android. Its free tier is the most restrictive here at 15 trips a month, after which you pay. No UK-specific tax tooling or gig-platform intelligence, but a reasonable choice for someone doing only a handful of business trips a month.",
    accent: "#94a3b8",
  },
];

const FAQS = [
  {
    q: "What is the best free mileage tracker app in the UK?",
    a: "MileClear - because it tracks unlimited miles for free and does the HMRC maths for free too, applying the 55p/25p AMAP rates automatically. MileIQ caps free tracking at 40 drives a month and Driversnote at 15; TripLog offers free tracking but gates the reports and uses US rates. If 'free' means you can actually track every business mile and see your correct HMRC deduction without paying, MileClear is the one to beat.",
  },
  {
    q: "Do any apps let you track unlimited miles for free?",
    a: "MileClear and TripLog both do. The difference is what else is free: MileClear's free tier also includes the HMRC calculator, Tax Readiness card and MOT reminders and uses UK rates by default, whereas TripLog gates reporting behind a 7-day premium pass a year and defaults to US IRS rates. MileIQ and Driversnote cap free tracking outright.",
  },
  {
    q: "Is MileIQ good for UK drivers?",
    a: "It is reliable and available on Android as well as iOS, but it is built for the US: IRS rates by default (manual HMRC setup required), a 40-drive free cap, and a price that more than doubled in 2026. It works, but you do more setup and pay more than with a UK-native app.",
  },
  {
    q: "Which mileage tracker is best for Uber, Deliveroo or Amazon Flex drivers?",
    a: "A gig driver needs uncapped free tracking (you pass a 15-40 drive limit in days), HMRC-native rates, and per-platform tagging to attribute trips and compare earnings. MileClear was built around all three - see the dedicated Uber, Deliveroo, Amazon Flex and delivery-driver guides.",
  },
  {
    q: "Does MileClear work on Android?",
    a: "Not yet - MileClear is iOS-only for now, with Android on the roadmap. If you are on Android today, MileIQ, Driversnote or TripLog are your cross-platform options, with the trade-offs above.",
  },
];

const cardStyle = {
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 14,
  padding: "1.5rem",
} as const;

const h2Style = {
  fontFamily: "var(--font-display)",
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#f9fafb",
  marginBottom: "1.25rem",
} as const;

const thBase = {
  textAlign: "left" as const,
  padding: "0.875rem 1rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

export default function BestMileageTrackerAppUK() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <Navbar />

      <main style={{ background: "#030712", paddingTop: "6rem", paddingBottom: "5rem" }}>
        <div className="container">

          {/* Hero */}
          <header style={{ maxWidth: 800, marginBottom: "3.5rem" }}>
            <span className="label" style={{ display: "inline-block", marginBottom: "1rem" }}>
              Comparison · 2026
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
              Best Mileage Tracker App UK (2026)
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 720 }}>
              Every app here will track your miles. The real questions are what it costs you to track them,
              and whether it speaks HMRC. Most trackers either cap free tracking (MileIQ stops at 40 drives a
              month, Driversnote at 15) or, like TripLog, track for free but gate the reports and default to
              US IRS rates. <strong style={{ color: "#e2e8f0" }}>MileClear is free to track your miles - unlimited,
              forever - and does the UK tax maths for free too</strong>, applying HMRC&apos;s 55p/25p rates
              automatically. That is the lens we use to rank them below.
            </p>
          </header>

          {/* Quick answer / TL;DR */}
          <section
            aria-labelledby="tldr-heading"
            style={{
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.15)",
              borderRadius: 14,
              padding: "1.75rem",
              marginBottom: "3.5rem",
              maxWidth: 800,
            }}
          >
            <h2 id="tldr-heading" style={{ ...h2Style, fontSize: "1.125rem", marginBottom: "0.75rem", color: "#fbbf24" }}>
              The short answer
            </h2>
            <p style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: "0.75rem" }}>
              For most UK drivers, <strong>MileClear is the best free mileage tracker</strong>: it tracks
              unlimited miles for free and applies HMRC rates automatically, so you see your correct deduction
              without paying or configuring anything. <strong>TripLog</strong> is the next-best free option but is
              US-first and gates reports. <strong>MileIQ</strong> and <strong>Driversnote</strong> are solid,
              cross-platform trackers, but both cap free tracking and default to non-UK rates.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, fontSize: "0.9rem" }}>
              On Android today? MileClear is iOS-only for now (Android is on the roadmap), so MileIQ, Driversnote
              or TripLog are your cross-platform choices.
            </p>
          </section>

          {/* Comparison table */}
          <section aria-labelledby="table-heading" style={{ marginBottom: "4rem" }}>
            <h2 id="table-heading" style={h2Style}>
              Free Tracking &amp; HMRC Support, Compared
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  minWidth: 720,
                  borderCollapse: "collapse",
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <th style={{ ...thBase, color: "#64748b", width: "22%" }}>Feature</th>
                    <th style={{ ...thBase, color: "#fbbf24", width: "22%" }}>MileClear</th>
                    <th style={{ ...thBase, color: "#94a3b8", width: "19%" }}>TripLog</th>
                    <th style={{ ...thBase, color: "#94a3b8", width: "19%" }}>MileIQ</th>
                    <th style={{ ...thBase, color: "#94a3b8", width: "18%" }}>Driversnote</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => (
                    <tr
                      key={r.feature}
                      style={{
                        borderBottom: i < ROWS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                        background: r.highlight ? "rgba(251,191,36,0.03)" : undefined,
                      }}
                    >
                      <td style={{ padding: "0.875rem 1rem", color: "#e2e8f0", fontSize: "0.875rem", fontWeight: 600 }}>
                        {r.feature}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", color: "#34d399", fontSize: "0.85rem", lineHeight: 1.5 }}>
                        {r.mc}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.5 }}>
                        {r.triplog}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.5 }}>
                        {r.mileiq}
                      </td>
                      <td style={{ padding: "0.875rem 1rem", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.5 }}>
                        {r.driversnote}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.75rem" }}>
              Free-tier limits and features verified mid-2026. Competitor plans and prices can change - check each
              provider for the latest.
            </p>
          </section>

          {/* Per-app verdicts */}
          <section aria-labelledby="verdicts-heading" style={{ marginBottom: "4rem" }}>
            <h2 id="verdicts-heading" style={h2Style}>
              The Verdict on Each App
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {VERDICTS.map((v, i) => (
                <div
                  key={v.name}
                  style={{
                    ...cardStyle,
                    borderColor: i === 0 ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.07)",
                    background: i === 0 ? "rgba(251,191,36,0.05)" : "rgba(15,23,42,0.6)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                    <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: v.accent }}>
                      {i + 1}. {v.name}
                    </h3>
                    <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{v.tag}</span>
                  </div>
                  <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>{v.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* How to choose */}
          <section style={{ maxWidth: 760, marginBottom: "4rem" }}>
            <h2 style={h2Style}>How to Choose a Mileage Tracker in the UK</h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Ignore the feature lists for a second and ask three questions. First:{" "}
              <strong style={{ color: "#e2e8f0" }}>can I track every mile for free?</strong> A delivery driver,
              private-hire driver or busy field rep passes a 15-to-40-drive monthly cap within days, and a mile
              you did not record is a deduction you cannot claim. Unlimited free tracking is not a nice-to-have -
              it is the whole point.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Second: <strong style={{ color: "#e2e8f0" }}>does it speak HMRC?</strong> US-built apps default to
              IRS rates. If you never change the setting, your Self Assessment deduction is simply wrong. A
              UK-native app applies the Approved Mileage Allowance Payment (AMAP) rates - 55p per mile for the
              first 10,000 business miles, then 25p, since 6 April 2026 - by default, and keeps older trips at the
              old 45p rate.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Third: <strong style={{ color: "#e2e8f0" }}>does it understand how you work?</strong> If you drive
              for gig platforms, per-platform tagging lets you attribute trips to Uber, Deliveroo, Amazon Flex and
              the rest - so your tax records are defensible and you can see which platform actually pays once fuel
              and mileage are counted.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear is the only option here that answers all three with a yes on the free tier. If you want the
              detail, read the{" "}
              <a href="/free-mileage-tracker-uk" style={{ color: "#fbbf24", textDecoration: "underline" }}>free mileage tracker</a>{" "}
              breakdown, the{" "}
              <a href="/mileclear-vs-mileiq" style={{ color: "#fbbf24", textDecoration: "underline" }}>MileClear vs MileIQ</a>{" "}
              comparison, or the guides for{" "}
              <a href="/uber-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>Uber</a>,{" "}
              <a href="/delivery-driver-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>delivery drivers</a>{" "}
              and{" "}
              <a href="/employee-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>employees</a>.
            </p>
          </section>

          {/* FAQ */}
          <section style={{ maxWidth: 760, marginBottom: "4rem" }}>
            <h2 style={h2Style}>Frequently Asked Questions</h2>
            {FAQS.map(({ q, a }, i, arr) => (
              <div
                key={q}
                style={{
                  borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  paddingBottom: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "0.5rem" }}>{q}</h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>{a}</p>
              </div>
            ))}
          </section>

          {/* Related links */}
          <section style={{ marginBottom: "3.5rem" }}>
            <h2 style={{ ...h2Style, fontSize: "1.125rem", marginBottom: "1rem" }}>More Comparisons &amp; Guides</h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/free-mileage-tracker-uk", label: "Free Mileage Tracker UK" },
                { href: "/mileage-tracker-uk", label: "Mileage Tracker UK" },
                { href: "/mileclear-vs-mileiq", label: "MileClear vs MileIQ" },
                { href: "/mileiq-alternative-uk", label: "MileIQ Alternative UK" },
                { href: "/driversnote-alternative", label: "Driversnote Alternative" },
                { href: "/employee-mileage-tracker", label: "For Employees" },
                { href: "/self-employed-mileage-tracker", label: "For the Self-Employed" },
                { href: "/hmrc-mileage-rates", label: "HMRC Mileage Rates" },
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
            <h2 style={{ ...h2Style, fontSize: "1.625rem", marginBottom: "0.75rem" }}>
              Track Every Mile Free - and Get the HMRC Maths Right
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, marginBottom: "1.75rem", maxWidth: 520, margin: "0 auto 1.75rem" }}>
              No trip cap, no US rates to reconfigure, no card required. Download MileClear free on the App Store.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
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
                href="/pricing"
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
                See Pricing
              </a>
            </div>
          </section>

        </div>
      </main>

      <Footer />
    </>
  );
}
