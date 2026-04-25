import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Just Eat Mileage Tracker UK - HMRC Sees Your Earnings From 2026",
  description:
    "Just Eat now reports your earnings to HMRC under the Digital Platform Reporting rules. If you're on a moped, you claim 24p/mile - not 45p. MileClear logs every run, every Multi-Collect, every dead mile. See how.",
  keywords: [
    "just eat mileage tracker",
    "just eat courier tax uk",
    "just eat self employed expenses",
    "just eat hmrc reporting 2026",
    "just eat moped mileage",
  ],
  alternates: {
    canonical: "https://mileclear.com/just-eat-mileage-tracker",
  },
  openGraph: {
    title: "Just Eat Mileage Tracker UK - HMRC Sees Your Earnings From 2026",
    description:
      "MileClear records every Just Eat run from log-on to log-off via GPS, applies the right HMRC rate for your vehicle (24p moped, 45p car), and exports a Self Assessment-ready PDF.",
    url: "https://mileclear.com/just-eat-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Just Eat Mileage Tracker UK - HMRC Sees Your Earnings From 2026",
    description:
      "MileClear records every Just Eat run from log-on to log-off via GPS, applies the right HMRC rate for your vehicle (24p moped, 45p car), and exports a Self Assessment-ready PDF.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Just Eat Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/just-eat-mileage-tracker",
  description:
    "How MileClear helps UK Just Eat couriers track every run, navigate the new HMRC Digital Platform Reporting rules, claim the right AMAP rate for moped or car, and export Self Assessment reports.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Just Eat Mileage Tracker",
        item: "https://mileclear.com/just-eat-mileage-tracker",
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
      name: "Are Just Eat couriers self-employed in 2026?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Just Eat ran a directly-employed Scoober workforce in cities including London, Birmingham, Liverpool, and Brighton from 2020 to 2023. In March 2023 they announced they were ending the employed model and shifting entirely to self-employed gig couriers in the UK; Scoober shut down in 2024. Every UK courier delivering directly through the Just Eat Courier app today is an independent contractor and files Self Assessment. Note that drivers fulfilling Just Eat orders via Stuart are on a separate Stuart contract.",
      },
    },
    {
      "@type": "Question",
      name: "Does Just Eat report my earnings to HMRC?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, since 1 January 2024. The HMRC Digital Platform Reporting rules require platforms including Just Eat, Uber Eats, Deliveroo, and Stuart to report each courier's annual earnings directly to HMRC. The first reports were due by 31 January 2026 covering the 2025 calendar year. If you have not been declaring your Just Eat earnings, HMRC now has the data to compare against your Self Assessment.",
      },
    },
    {
      "@type": "Question",
      name: "What HMRC mileage rate can a Just Eat moped courier claim?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "24p per mile, flat. The Approved Mileage Allowance Payment rate for motorbikes and mopeds is 24p for every business mile - there is no higher rate for the first 10,000 miles like there is for cars. A central London survey found 83 percent of food-delivery couriers ride mopeds; many of them claim the 45p car rate by mistake or simply do not claim at all.",
      },
    },
    {
      "@type": "Question",
      name: "What HMRC mileage rate can a Just Eat car driver claim?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "45p per mile for the first 10,000 business miles in a tax year, and 25p per mile after that. Outside London the car share among Just Eat couriers rises substantially because of distance and weather, so this is the most common rate for suburban and regional couriers.",
      },
    },
    {
      "@type": "Question",
      name: "Can Just Eat cyclists claim mileage on their tax return?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "There is a 20p per mile AMAP rate for bicycles, but it formally applies only to employees - HMRC does not recognise a per-mile bicycle allowance for the self-employed. Self-employed bike couriers claim actual costs instead: bicycle depreciation, repairs, replacement parts, lights, locks, and clothing as allowable business expenses. MileClear can still record your bike trips for evidence of business use.",
      },
    },
    {
      "@type": "Question",
      name: "Do dead miles between Multi-Collect Offers count as business miles?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. HMRC lets you claim every business mile from the moment you go online inside your zone to the moment you log off - including the empty leg between drops, the return loop to a busier hotspot, and the wait-around miles. Just Eat does not pay for those miles, but the AMAP rate is independent of who paid you. If you drove it on shift, claim it.",
      },
    },
    {
      "@type": "Question",
      name: "What is a Multi-Collect Offer?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Just Eat's term for stacked deliveries - one or more orders combined into a single trip. A multi-pickup Multi-Collect averages around 32 minutes from acceptance to final drop, versus 16 minutes for a single order. From a mileage perspective, every leg is a business mile, including the inter-restaurant detour and any empty repositioning afterwards.",
      },
    },
  ],
};

export default function JustEatMileageTracker() {
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
              For Just Eat Couriers
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
              Just Eat Mileage Tracker - HMRC Sees Your Earnings Now
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              Since January 2024 Just Eat has been required to report your annual earnings
              directly to HMRC. The first reports landed on 31 January 2026. If you ride a
              moped you claim 24p per mile, not 45p - and the difference between the two on a
              full-time year is over £4,000 of overstated deduction. MileClear records every
              run, applies the right rate for your vehicle, and produces a Self Assessment-ready
              log. Free to download - Pro from £4.99 per month.
            </p>
          </header>

          {/* HMRC Digital Platform Reporting hero callout */}
          <section
            aria-labelledby="hmrc-reporting-heading"
            style={{
              background: "rgba(239,68,68,0.06)",
              border: "1px solid rgba(239,68,68,0.18)",
              borderRadius: 14,
              padding: "2rem",
              marginBottom: "3.5rem",
              maxWidth: 760,
            }}
          >
            <h2
              id="hmrc-reporting-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.125rem",
              }}
            >
              The HMRC Digital Platform Rules - January 2026 Was the First Deadline
            </h2>
            <p style={{ color: "#cbd5e1", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              On 1 January 2024 the UK adopted the OECD&apos;s Model Reporting Rules for Digital
              Platforms. From that date Just Eat, Uber Eats, Deliveroo, Stuart, Amazon Flex,
              and every other gig platform operating in the UK has been logging your full
              annual earnings - and reporting them directly to HMRC. The first batch of reports
              were due by 31 January 2026, covering the 2025 calendar year.
            </p>
            <p style={{ color: "#cbd5e1", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              The practical effect: if you have been delivering for Just Eat without filing
              Self Assessment, or filing but understating, HMRC already has the data they need
              to flag a discrepancy. The compliance window for catching up is closing fast.
            </p>
            <p style={{ color: "#cbd5e1", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              The good news for couriers who do file: every business mile you can prove is a
              deduction the platform did not subtract. Mileage is the largest single allowable
              expense for most couriers, and the only one Just Eat does not record for you.
            </p>
          </section>

          {/* Vehicle rate split */}
          <section
            aria-labelledby="vehicle-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="vehicle-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              The Moped Trap - 24p/Mile, Not 45p
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              A 2024 academic study tracking 40,941 deliveries across 195 couriers in central
              London found that 83 percent rode petrol mopeds, 10 percent drove cars, and 7
              percent used bicycles. Outside London the car share rises sharply - distance,
              weather, and the suburban demand profile push more couriers into hatchbacks. Each
              vehicle has a different HMRC rate, and most couriers claim the wrong one.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "0.875rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.625rem", letterSpacing: "0.04em", textTransform: "uppercase" }}
                >
                  Moped or Motorbike
                </h3>
                <p
                  style={{
                    color: "#f9fafb",
                    fontSize: "1.75rem",
                    fontWeight: 700,
                    margin: "0 0 0.5rem",
                  }}
                >
                  24p / mile
                </p>
                <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.65, margin: 0 }}>
                  Flat rate. No higher band for the first 10,000 miles - it is 24p whether you
                  do 5,000 or 25,000 business miles.
                </p>
              </div>
              <div
                style={{
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "0.875rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.625rem", letterSpacing: "0.04em", textTransform: "uppercase" }}
                >
                  Car or Van
                </h3>
                <p
                  style={{
                    color: "#f9fafb",
                    fontSize: "1.75rem",
                    fontWeight: 700,
                    margin: "0 0 0.5rem",
                  }}
                >
                  45p / 25p
                </p>
                <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.65, margin: 0 }}>
                  45p per mile for the first 10,000 business miles in the tax year, then 25p
                  per mile thereafter.
                </p>
              </div>
              <div
                style={{
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "0.875rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.625rem", letterSpacing: "0.04em", textTransform: "uppercase" }}
                >
                  Bicycle
                </h3>
                <p
                  style={{
                    color: "#f9fafb",
                    fontSize: "1.75rem",
                    fontWeight: 700,
                    margin: "0 0 0.5rem",
                  }}
                >
                  Actual costs
                </p>
                <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.65, margin: 0 }}>
                  No AMAP rate for self-employed cyclists. Claim depreciation, repairs, parts,
                  lights, locks, and waterproofs as actual allowable expenses.
                </p>
              </div>
            </div>

            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear lets you set your vehicle once and applies the correct rate for every
              business mile automatically. If you switch from a moped to a car mid-year (a
              common pattern in autumn) the app handles the rate change cleanly, and the export
              shows both methods broken out by vehicle.
            </p>
          </section>

          {/* The Just Eat language */}
          <section
            aria-labelledby="terminology-heading"
            style={{
              background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: "2rem",
              marginBottom: "3.5rem",
              maxWidth: 760,
            }}
          >
            <h2
              id="terminology-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.125rem",
              }}
            >
              How Just Eat Couriers Actually Work
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              The Just Eat Courier app structures the day around a few specific concepts. A
              <strong style={{ color: "#e2e8f0" }}> Run</strong> is a scheduled delivery block,
              typically 3 to 5 hours, claimed from the
              <strong style={{ color: "#e2e8f0" }}> Drop Time </strong>release on Thursday at
              around 14:00 for the following week. Within a Run, the app dispatches
              <strong style={{ color: "#e2e8f0" }}> Offers </strong>(individual orders, with a
              one-minute window to accept) and
              <strong style={{ color: "#e2e8f0" }}> Multi-Collect Offers </strong>(stacked
              orders combined into a single trip). Surge bonuses appear as
              <strong style={{ color: "#e2e8f0" }}> Fee Boost </strong>on the offer card and on
              your Tuesday payslip.
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              MileClear&apos;s shift mode maps cleanly to a Run. Start a shift when you go
              online inside your Zone. Every Offer accepted within that shift, every
              Multi-Collect leg, every Hotspot reposition between drops, and the empty drive
              back to a busier area at the end of the run is recorded as a single grouped
              session. End the shift when you log off. The total mileage, broken down by leg,
              is yours.
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              Tag the shift as Just Eat. If you also pick up Stuart-branded Just Eat orders -
              McDonald&apos;s, KFC and Greggs deliveries are commonly fulfilled by Stuart
              rather than direct Just Eat - those go on your Stuart contract, get reported to
              HMRC separately, and benefit from the same automatic mileage capture.
            </p>
          </section>

          {/* Dead miles */}
          <section
            aria-labelledby="dead-miles-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="dead-miles-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Dead Miles Between Drops Are Still Business Miles
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The biggest unclaimed mileage on a Just Eat shift is the empty leg. You finish a
              drop in a quiet residential area, accept a new Offer at a restaurant 1.4 miles
              back toward the high street. Just Eat does not pay you for the 1.4 miles; HMRC
              does not care. The mile counts because you drove it on shift, with the intent of
              taking the next paid delivery.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Multi-Collect makes this worse from a pay perspective and better from a tax
              perspective. A multi-pickup Multi-Collect runs around 32 minutes versus 16 for a
              single order, with effective hourly rates at £15.54 multi-pickup, £15.70 single,
              and £14.55 two-from-one-restaurant. The dead miles between the two restaurants
              feel like wasted time - until you remember each one is worth 24p (moped) or 45p
              (car) of taxable income off your return.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear logs every mile by GPS without you having to tap anything between
              drops. The breakdown then shows what proportion of your shift was on-order versus
              repositioning. For most couriers it is roughly 40 percent dead miles - and 40
              percent of a year&apos;s mileage deduction is several hundred pounds of tax not
              given back.
            </p>
          </section>

          {/* Typical numbers */}
          <section
            aria-labelledby="numbers-heading"
            style={{ marginBottom: "3.5rem", maxWidth: 760 }}
          >
            <h2
              id="numbers-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Typical Numbers for a UK Just Eat Courier
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1.5rem" }}>
              Per-Offer pay sits at £3 to £5 with Fee Boost on top during peak. Glassdoor
              estimates around £15 per hour gross before vehicle costs; full-time couriers in
              busy cities report £15 to £20. A 5-day-a-week courier doing two 4-hour Runs each
              shift might cover 15,000 to 25,000 business miles a year on a moped, or 12,000
              to 18,000 on a car (cars do fewer drops per hour because of parking).
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  background: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.15)",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.75rem" }}
                >
                  Moped, 20,000 mi / yr
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: "0.5rem" }}>
                  20,000 × 24p = <strong style={{ color: "#f9fafb" }}>£4,800</strong> deduction
                </p>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, margin: 0 }}>
                  Tax saved at 20% basic rate: <strong style={{ color: "#f9fafb" }}>£960</strong>
                </p>
              </div>
              <div
                style={{
                  background: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.15)",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.75rem" }}
                >
                  Car, 18,000 mi / yr
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: "0.5rem" }}>
                  10,000 × 45p + 8,000 × 25p = <strong style={{ color: "#f9fafb" }}>£6,500</strong>
                </p>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, margin: 0 }}>
                  Tax saved at 20% basic rate: <strong style={{ color: "#f9fafb" }}>£1,300</strong>
                </p>
              </div>
            </div>

            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              Both figures assume you actually have a contemporaneous mileage log. Without one,
              HMRC can challenge any estimate - and given they now hold your Just Eat earnings
              data, a Self Assessment with no supporting mileage record stands out. MileClear
              produces the log automatically.
            </p>
          </section>

          {/* AI deactivation / GPS evidence */}
          <section
            aria-labelledby="ai-deactivation-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="ai-deactivation-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              GPS Evidence for Deactivation Appeals
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The 2023 reports that Just Eat couriers were being deactivated by AI for
              suspected overpayments as small as £1.35 - based on the platform&apos;s
              interpretation of GPS data showing the courier had &quot;strayed&quot; from the
              restaurant - hit driver communities hard. Appeals were largely ignored.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              A separate, independent GPS log can be the difference between an appeal that
              gets read and one that does not. MileClear records the precise route of every
              shift, with timestamps, speed, and stop points. If a deactivation hinges on
              whether you were actually at the restaurant when the platform claims you were
              not, an independent record of where you were is real evidence.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              That is not the primary use of the app - the primary use is HMRC mileage. But
              the trace exists either way.
            </p>
          </section>

          {/* Multi-apping */}
          <section
            aria-labelledby="multi-app-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="multi-app-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Multi-Apping Just Eat with Uber Eats and Deliveroo
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              In May 2023 Just Eat amended its contractor agreement to explicitly permit
              couriers to work for direct competitors at the same time. Most active UK
              food-delivery couriers run two or three apps simultaneously - the classic stack
              is Just Eat plus Uber Eats plus Deliveroo, sometimes with Stuart added for the
              big-brand fast food orders.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              For HMRC, all of it is one self-employment trade. Earnings from each platform
              are reported to HMRC separately under the Digital Platform Reporting rules, but
              they all go on the same SA103S/SA103F page of your Self Assessment, with one
              combined mileage figure. You do not need three trackers - you need one tracker
              that tags the platform of each shift and totals correctly.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear&apos;s platform tag handles this. Compare earnings per mile and per
              hour by platform from your own data. See the dedicated guides:{" "}
              <a
                href="/uber-mileage-tracker"
                style={{ color: "#fbbf24", textDecoration: "underline" }}
              >
                Uber
              </a>{" "}
              and{" "}
              <a
                href="/deliveroo-mileage-tracker"
                style={{ color: "#fbbf24", textDecoration: "underline" }}
              >
                Deliveroo
              </a>
              .
            </p>
          </section>

          {/* Legal context - Leigh Day claim */}
          <section
            aria-labelledby="legal-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="legal-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              The Leigh Day Claim and What Worker Status Would Mean
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              In April 2023 the law firm Leigh Day launched a group claim representing tens of
              thousands of Just Eat couriers, arguing they should be classified as workers
              rather than independent contractors. The case is ongoing. Uber drivers won
              worker status at the Supreme Court in 2021; Bolt drivers won worker status in
              November 2024; the Just Eat case is the obvious next domino.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              If the claim succeeds, eligible couriers would be entitled to backdated holiday
              pay, NMW shortfall, and other employment rights. Worker status would not change
              the fact that you are still self-employed for tax purposes - couriers in this
              position remain on Self Assessment and continue to claim mileage. Whatever the
              outcome, the records you keep now are evidence either way. MileClear stores them
              automatically.
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
              Frequently Asked Questions
            </h2>
            {[
              {
                q: "Are Just Eat couriers self-employed in 2026?",
                a: "Yes. The directly-employed Scoober workforce was wound down in 2023-2024. Every UK courier on the Just Eat Courier app is now an independent contractor and files Self Assessment. Stuart-fulfilled Just Eat orders sit on a separate Stuart contract.",
              },
              {
                q: "Does Just Eat report my earnings to HMRC?",
                a: "Yes, since 1 January 2024 under the Digital Platform Reporting rules. The first reports were due by 31 January 2026 covering the 2025 calendar year. HMRC now has your earnings data; if you are not declaring, the discrepancy is visible to them.",
              },
              {
                q: "What HMRC mileage rate can a moped courier claim?",
                a: "24p per mile, flat. The same rate applies to all motorbikes and mopeds regardless of CC or annual mileage. There is no higher band for the first 10,000 miles like there is for cars.",
              },
              {
                q: "What HMRC mileage rate can a car courier claim?",
                a: "45p per mile for the first 10,000 business miles in the tax year, 25p per mile after that.",
              },
              {
                q: "Can I claim mileage if I deliver by bike?",
                a: "Self-employed cyclists do not get a per-mile AMAP rate. Instead, claim actual costs - bike depreciation, repairs, parts, lights, locks, waterproofs, gloves. MileClear can still record bike trips for evidence of business use, even though the per-mile rate does not apply.",
              },
              {
                q: "Do dead miles between deliveries count as business miles?",
                a: "Yes. Every mile from the moment you go online inside your zone to the moment you log off counts as business mileage - including the empty leg between drops, the loop back to a busier hotspot, and any inter-restaurant detour during a Multi-Collect.",
              },
              {
                q: "What is a Multi-Collect Offer?",
                a: "Just Eat's term for a stacked delivery - one or more orders combined into a single trip. Multi-pickup Multi-Collects average around 32 minutes versus 16 for a single order. Every leg, including the inter-restaurant drive, is a business mile.",
              },
              {
                q: "Does the home-to-zone drive count as a business mile?",
                a: "Generally no. HMRC treats the journey from your home to your usual delivery zone as ordinary commuting, even if the zone covers a wide area. Once you are inside the zone and online, the meter starts. MileClear lets you mark the home-to-zone leg as personal.",
              },
              {
                q: "I work Just Eat plus Uber Eats plus Deliveroo. Do I need separate trackers?",
                a: "No. All three are one self-employment trade for HMRC, recorded on the same Self Assessment page. MileClear tags each shift with the platform so you can compare earnings per mile by platform, while the total mileage rolls up correctly. Just Eat amended its contractor agreement in May 2023 to explicitly allow multi-apping.",
              },
              {
                q: "What format does HMRC need a Just Eat mileage log in?",
                a: "Contemporaneous - made at or around the time of each shift. Each entry needs date, start point, end point, purpose, and distance. MileClear's Pro export produces a PDF mileage log in an HMRC-accepted format you can attach to your return or share with an accountant.",
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

          {/* Related links */}
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
              More Guides for UK Food-Delivery Couriers
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/uber-mileage-tracker", label: "Uber Mileage Tracker" },
                { href: "/deliveroo-mileage-tracker", label: "Deliveroo Mileage Tracker" },
                { href: "/hmrc-mileage-rates", label: "HMRC Mileage Rates" },
                { href: "/business-mileage-guide", label: "Business Mileage Guide" },
                { href: "/mileclear-vs-mileiq", label: "MileClear vs MileIQ" },
                { href: "/#pricing", label: "Pricing" },
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
              Track Every Just Eat Mile from Today
            </h2>
            <p
              style={{
                color: "#94a3b8",
                fontSize: "1rem",
                lineHeight: 1.7,
                marginBottom: "1.75rem",
                maxWidth: 540,
                margin: "0 auto 1.75rem",
              }}
            >
              Download MileClear free. Automatic GPS tracking, the right HMRC rate for your
              vehicle, and a Self Assessment-ready PDF that lines up exactly with the figures
              Just Eat is reporting to HMRC.
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
                View Pricing
              </a>
            </div>
          </section>

        </div>
      </main>

      <Footer />
    </>
  );
}
