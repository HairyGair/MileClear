import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "DPD Mileage Tracker UK - For ODFs Doing 40,000+ Miles a Year",
  description:
    "Your DPD scanner tracks parcels, not miles. As an Owner Driver Franchisee you can claim 45p/25p per mile - £12,000+ off tax on a typical year. MileClear logs every route automatically. See the breakdown.",
  keywords: [
    "dpd mileage tracker",
    "dpd owner driver franchisee tax",
    "dpd self assessment uk",
    "dpd hmrc mileage allowance",
    "dpd odf mileage log",
  ],
  alternates: {
    canonical: "https://mileclear.com/dpd-mileage-tracker",
  },
  openGraph: {
    title: "DPD Mileage Tracker UK - For ODFs Doing 40,000+ Miles a Year",
    description:
      "MileClear records every DPD route via GPS, applies HMRC AMAP rates (or shows you whether actual costs claim more), and exports a Self Assessment-ready PDF.",
    url: "https://mileclear.com/dpd-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DPD Mileage Tracker UK - For ODFs Doing 40,000+ Miles a Year",
    description:
      "MileClear records every DPD route via GPS, applies HMRC AMAP rates (or shows you whether actual costs claim more), and exports a Self Assessment-ready PDF.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "DPD Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/dpd-mileage-tracker",
  description:
    "How MileClear helps UK DPD Owner Driver Franchisees and Owner Driver Workers track business miles, choose between Simplified Expenses and Actual Costs, and export Self Assessment reports.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "DPD Mileage Tracker",
        item: "https://mileclear.com/dpd-mileage-tracker",
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
      name: "Are DPD owner driver franchisees self-employed?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The Employment Appeal Tribunal confirmed in Stojsavljevic & Turner v DPD Group UK Ltd (2021) that DPD Owner Driver Franchisees are neither employees nor workers - they are genuinely self-employed because the franchise contract includes a real right of substitution (you can send another vetted driver in your place). That ruling means DPD ODFs file Self Assessment, pay their own tax and NI, and can claim business expenses including mileage. ODWs (Owner Driver Workers, the 2018 hybrid tier introduced after the Don Lane case) are also self-employed for tax purposes despite getting holiday and sick pay.",
      },
    },
    {
      "@type": "Question",
      name: "Can DPD drivers claim mileage on their tax return?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "It depends which tier you are on. If you are an Owner Driver Franchisee or Owner Driver Worker - meaning you own or lease your van - you can claim either Simplified Expenses (45p per mile for the first 10,000 business miles, 25p after that) or Actual Costs (fuel, insurance, lease, servicing, tyres, depreciation). If you are a directly-employed DPD driver using a DPD-provided van, you cannot claim AMAP because the vehicle is not yours.",
      },
    },
    {
      "@type": "Question",
      name: "Does DPD provide a van to drivers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Only to directly-employed drivers. ODFs and ODWs supply their own van - typically a long-wheelbase Mercedes Sprinter, Ford Transit Jumbo, Iveco Daily, or VW Crafter. The van is owned outright, financed, or leased (often £1,200 to £1,500 per month including DPD-spec livery and insurance). Because the van is yours as a business asset, every business mile is claimable.",
      },
    },
    {
      "@type": "Question",
      name: "Should DPD drivers use Simplified Expenses or Actual Costs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Run the numbers both ways. A typical ODF doing 40,000 business miles a year claims £12,000 under Simplified Expenses (10,000 x 45p + 30,000 x 25p). The same driver with a leased Sprinter at £18,000 a year, plus £6,000 fuel, £1,200 insurance, £2,000 servicing and tyres, can claim £27,000+ under Actual Costs. Drivers with high running costs (recent leases, heavy diesel use) almost always benefit from Actual Costs. Drivers with older owned vans and low monthly outgoings often do better on Simplified. You cannot mix and match on the same vehicle - the choice is locked for that van's life with the business.",
      },
    },
    {
      "@type": "Question",
      name: "How many miles a year does a typical DPD ODF cover?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Roughly 30,000 to 60,000 business miles per year. A standard route is about 250 miles a day across 130-170 parcels and 120 stops, run 5 to 6 days a week for 48 weeks. That puts most full-time ODFs comfortably above HMRC's 10,000-mile threshold, where the rate drops from 45p to 25p per mile.",
      },
    },
    {
      "@type": "Question",
      name: "Does the DPD Driver app track mileage for HMRC?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The DPD Driver app and Zebra TC77 scanner are built for parcel scanning, route sequencing, and the Predict 1-hour delivery slot - all of which serve DPD's KPIs. Neither produces a tax-year-aligned mileage total, a per-trip GPS audit log, or a private-versus-business mileage split. ODFs who want to defend their Self Assessment to HMRC need a separate, contemporaneous mileage record. MileClear creates that automatically.",
      },
    },
    {
      "@type": "Question",
      name: "Are failed delivery miles claimable?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. A failed delivery (refused, carded, or returned) does not pay - but the miles you drove to attempt it are still business miles in HMRC's view. A typical day with 5-10 failed drops still incurs the same fuel cost. Claim every business mile, paid or unpaid.",
      },
    },
  ],
};

export default function DpdMileageTracker() {
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
              For DPD Owner Driver Franchisees & Workers
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
              DPD Mileage Tracker - For ODFs Doing 40,000+ Miles a Year
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              Your Zebra TC77 scans up to 1,000 parcels a day. It scans zero miles for HMRC.
              MileClear logs every route automatically, applies the right HMRC rate for your van,
              and gives you the contemporaneous mileage record a Self Assessment audit needs.
              Free to download - Pro from £4.99 per month.
            </p>
          </header>

          {/* Three-tier model */}
          <section
            aria-labelledby="three-tier-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="three-tier-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Are You ODF, ODW, or Employee? It Decides Whether You Can Claim
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              DPD UK runs a three-tier driver model introduced in March 2018 as part of the DPD
              Driver Code. The tier you sit in determines whether HMRC mileage allowance applies
              to you at all - and most drivers never have it explained to them clearly.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
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
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.625rem" }}
                >
                  Owner Driver Franchisee (ODF)
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: "0.75rem" }}>
                  Fully self-employed. Five-year franchise contract. Owns or leases their own van.
                  Files Self Assessment.
                </p>
                <p style={{ color: "#34d399", fontSize: "0.875rem", fontWeight: 600 }}>
                  Mileage claimable: Yes
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
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.625rem" }}
                >
                  Owner Driver Worker (ODW)
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: "0.75rem" }}>
                  Hybrid &quot;limb (b) worker&quot; status invented after Don Lane.
                  Self-employed for tax, but gets 28 days holiday, sick pay, pension, and a Real
                  Living Wage floor.
                </p>
                <p style={{ color: "#34d399", fontSize: "0.875rem", fontWeight: 600 }}>
                  Mileage claimable: Yes
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
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.625rem" }}
                >
                  Directly Employed Driver
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: "0.75rem" }}>
                  PAYE. Holiday, sick pay, pension, employment rights. DPD provides the van -
                  including fuel card, insurance, and servicing.
                </p>
                <p style={{ color: "#ef4444", fontSize: "0.875rem", fontWeight: 600 }}>
                  Mileage claimable: No
                </p>
              </div>
            </div>

            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear is for ODFs and ODWs - the two tiers where every business mile is
              potentially worth 45p of taxable income off your return. If you are a directly
              employed driver, your tax is handled at source through PAYE and a mileage tracker
              does not change your liability.
            </p>
          </section>

          {/* Stojsavljevic ruling */}
          <section
            aria-labelledby="ruling-heading"
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
              id="ruling-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.125rem",
              }}
            >
              The Stojsavljevic Ruling - Why DPD ODFs Are Unambiguously Self-Employed
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              In December 2021 the Employment Appeal Tribunal handed down its judgment in
              Stojsavljevic &amp; Turner v DPD Group UK Ltd. Two ODFs had argued they should be
              classified as workers or employees, citing the same kind of test that won Uber
              drivers worker status at the Supreme Court earlier that year.
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              They lost. The EAT upheld the Tribunal&apos;s finding that the DPD franchise
              contract contains a genuine, exercisable right of substitution - an ODF can send
              another vetted driver to run their route - which defeats the &quot;personal service&quot;
              test under section 230(3)(b) of the Employment Rights Act 1996.
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              That ruling matters for tax. Unlike Uber drivers, Bolt drivers, or the Just Eat
              couriers Leigh Day is currently representing, DPD ODFs have already been to the
              EAT and come out the other side with self-employment confirmed by precedent. You
              file Self Assessment. You claim business expenses. You keep the records. There is
              no ambiguity.
            </p>
          </section>

          {/* Your van, your deduction */}
          <section
            aria-labelledby="van-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="van-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Your Van, Your Deduction
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The single biggest tax difference between a DPD ODF and an Amazon Flex driver is
              the van. Amazon Flex drivers usually run their own car - smaller, cheaper, lower
              annual mileage. DPD ODFs run long-wheelbase or extra-long-wheelbase Mercedes
              Sprinters, Ford Transit Jumbos, Iveco Dailies, or VW Crafters. The vehicle is
              specified by route volume - a typical ODF van is around 14m³ load space and 3.5
              tonnes - and it is yours, not DPD&apos;s.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              You either own it outright, finance it, or take a DPD-affiliated lease (often
              £1,200 to £1,500 per month including DPD livery and the right insurance class).
              Many ODFs add a fuel card around £500 a month on top of the lease. All of those
              are deductible business expenses - but only if you can show the van was used for
              business. That is exactly what a contemporaneous mileage log proves.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear records every trip via GPS with the date, route, and distance. If you
              use the van for personal trips at the weekend or to take the dog to the vet, those
              get tagged as personal so your business-use percentage is accurate, not estimated.
              That percentage is what HMRC will ask for if your return is queried.
            </p>
          </section>

          {/* Simplified vs Actual decision */}
          <section
            aria-labelledby="simplified-heading"
            style={{ marginBottom: "3.5rem", maxWidth: 760 }}
          >
            <h2
              id="simplified-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Simplified Expenses or Actual Costs - Which Wins for Your Route?
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1.5rem" }}>
              HMRC lets self-employed van drivers choose one of two methods on each vehicle. You
              cannot mix them on the same van - the choice is locked for that van&apos;s life
              with the business. Most ODFs reconsider the question whenever they change vans.
              The numbers below are typical 2026 figures for a full-time route.
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
                  background: "rgba(52,211,153,0.05)",
                  border: "1px solid rgba(52,211,153,0.15)",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#34d399", marginBottom: "0.75rem" }}
                >
                  Simplified Expenses
                </h3>
                <p
                  style={{
                    color: "#e2e8f0",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    margin: "0 0 0.75rem",
                  }}
                >
                  £12,000 / 40,000 miles
                </p>
                <ul
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                    lineHeight: 1.75,
                    paddingLeft: "1.125rem",
                    margin: 0,
                  }}
                >
                  <li>10,000 miles × 45p = £4,500</li>
                  <li>30,000 miles × 25p = £7,500</li>
                  <li>No receipts to keep beyond the mileage log</li>
                  <li>Best for: older vans, low monthly outgoings</li>
                </ul>
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
                  Actual Costs
                </h3>
                <p
                  style={{
                    color: "#e2e8f0",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    margin: "0 0 0.75rem",
                  }}
                >
                  £27,000+ / 40,000 miles
                </p>
                <ul
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                    lineHeight: 1.75,
                    paddingLeft: "1.125rem",
                    margin: 0,
                  }}
                >
                  <li>£18,000 lease (£1,500/mo × 12)</li>
                  <li>£6,000 fuel</li>
                  <li>£1,200 insurance + £2,000 servicing/tyres</li>
                  <li>Best for: leased vans, heavy diesel routes</li>
                </ul>
              </div>
            </div>

            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              The decision is rarely close. A leased Sprinter on a peak-volume route almost
              always claims more under Actual Costs. An owned van that has paid off its loan,
              with low servicing because you bought it cheap and run it carefully, often does
              better on Simplified. MileClear records the GPS log either way - because Actual
              Costs still requires you to prove what proportion of the van&apos;s use was
              business. Without a route log, that percentage is a guess.
            </p>
          </section>

          {/* What DPD's tech misses */}
          <section
            aria-labelledby="tech-gap-heading"
            style={{ marginBottom: "3.5rem" }}
          >
            <h2
              id="tech-gap-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.5rem",
              }}
            >
              What DPD&apos;s Tech Tracks - and What HMRC Needs That It Misses
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.25rem",
              }}
            >
              {[
                {
                  title: "Parcel Scans (TC77)",
                  body:
                    "DPD's Zebra handheld captures depot load, Proof of Delivery, signature, and driver notes. Up to 1,000 scans a day. None of it is mileage data.",
                  what: "what dpd has",
                },
                {
                  title: "Predict 1-Hour Slot",
                  body:
                    "The DPD Driver app sequences your route to hit each customer's 1-hour delivery window. Optimises for DPD's KPIs, not for tax records.",
                  what: "what dpd has",
                },
                {
                  title: "Real-Time Vehicle Tracking",
                  body:
                    "DPD's depot ops can see where your van is. That trace stays with DPD. You don't get a tax-year-aligned export of it.",
                  what: "what dpd has",
                },
                {
                  title: "Tax-Year Mileage Total",
                  body:
                    "MileClear tallies every business mile by tax year (6 April to 5 April), with the AMAP rate applied automatically and the threshold split shown.",
                  what: "what mileclear adds",
                },
                {
                  title: "Per-Trip GPS Audit Log",
                  body:
                    "Every trip stored with start time, end time, route, distance, and a coordinate trace. If HMRC questions a return, you have evidence, not estimates.",
                  what: "what mileclear adds",
                },
                {
                  title: "Business / Personal Split",
                  body:
                    "Tag personal trips so your business-use percentage is accurate. Critical for Actual Costs claims and for any van also used outside DPD work.",
                  what: "what mileclear adds",
                },
              ].map(({ title, body, what }) => (
                <div
                  key={title}
                  style={{
                    background:
                      what === "what mileclear adds"
                        ? "rgba(251,191,36,0.06)"
                        : "rgba(15,23,42,0.6)",
                    border:
                      what === "what mileclear adds"
                        ? "1px solid rgba(251,191,36,0.18)"
                        : "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 14,
                    padding: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: what === "what mileclear adds" ? "#fbbf24" : "#64748b",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {what}
                  </div>
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#f9fafb",
                      marginBottom: "0.625rem",
                    }}
                  >
                    {title}
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7 }}>{body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Typical mileage / savings */}
          <section
            aria-labelledby="savings-heading"
            style={{ marginBottom: "3.5rem", maxWidth: 760 }}
          >
            <h2
              id="savings-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Typical Numbers for a UK DPD ODF
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              A standard DPD route is around 250 miles a day across 130 to 170 parcels and 120
              stops. Run that 5 to 6 days a week for 48 weeks and you clear 30,000 to 60,000
              business miles a year. Most ODFs sit around the middle - 40,000 miles - which is
              the worked example below.
            </p>

            <div
              style={{
                background: "rgba(251,191,36,0.06)",
                border: "1px solid rgba(251,191,36,0.15)",
                borderRadius: 12,
                padding: "1.75rem",
                marginBottom: "1.5rem",
              }}
            >
              <h3
                style={{
                  fontSize: "1.0625rem",
                  fontWeight: 700,
                  color: "#fbbf24",
                  marginBottom: "1rem",
                }}
              >
                Worked Example: 40,000 Business Miles, Simplified Method
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                  gap: "1rem",
                }}
              >
                {[
                  { label: "First 10,000 miles", value: "£4,500", note: "at 45p/mile" },
                  { label: "Next 30,000 miles", value: "£7,500", note: "at 25p/mile" },
                  { label: "Total deduction", value: "£12,000", note: "from taxable income" },
                  { label: "Tax saved (20% rate)", value: "£2,400", note: "directly from mileage" },
                ].map(({ label, value, note }) => (
                  <div key={label}>
                    <div style={{ fontSize: "0.8125rem", color: "#64748b", marginBottom: "0.25rem" }}>
                      {label}
                    </div>
                    <div
                      style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f9fafb", lineHeight: 1 }}
                    >
                      {value}
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                      {note}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              At 40% tax (higher rate), the same 40,000 miles save £4,800 in tax. Drivers who
              choose Actual Costs and have leased vans typically get to a £25,000-£30,000
              deduction - £5,000 to £6,000 in tax saved at basic rate, £10,000 to £12,000 at
              higher rate. The choice between methods can swing your tax bill by a low
              four-figure amount each year.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              The point is not the headline figure. It is the records. HMRC will accept either
              method - they will not accept &quot;I drove about 40,000 miles, I think.&quot;
              MileClear gives you a dated, GPS-verified log of every trip you made for DPD,
              ready to back up whichever method claims more.
            </p>
          </section>

          {/* Failed deliveries / peak / fuel volatility */}
          <section
            aria-labelledby="reality-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="reality-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              The £1.20-Per-Parcel Reality
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              DPD ODFs typically earn £1.00 to £1.20 per successfully delivered parcel - the
              higher end on bigger vans. A 140-drop day grosses around £150 to £180. Failed
              deliveries pay nothing, but the miles you drove to attempt them still cost you
              fuel and still count as business miles.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Fuel volatility hits Sprinters running at 25-30 mpg hard. A 10p swing in pump
              prices is £80 to £120 a week off your take-home. MileClear&apos;s fuel log lets
              you record every fill-up so you can compare actual cost-per-mile against the AMAP
              rate - which often shifts the Simplified-versus-Actual question.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              Peak (November to December) is when most ODFs feel the squeeze. Volumes 30 to 50%
              higher, longer days, more fuel, more failed drops because customers are out doing
              their own Christmas shopping. Tracking through peak gives you the largest
              deductible mileage of the year - exactly when you most need it.
            </p>
          </section>

          {/* Multi-platform */}
          <section
            aria-labelledby="multi-platform-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="multi-platform-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              DPD Alongside Amazon Flex, Evri, or Other Parcel Work
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Some ODFs take on additional courier work outside DPD hours - Amazon Flex blocks
              on a quiet evening, an Evri round at the weekend, or ad-hoc same-day work for
              other networks. From HMRC&apos;s view all of it is business mileage on the same
              vehicle, claimable under the same chosen method (Simplified or Actual). What you
              need to show is which work was for which client, and that the totals add up.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear tags every shift and trip with the platform. DPD routes are tagged
              separately from Amazon Flex blocks, Evri rounds, or any direct B2B work you do.
              The business insights view shows earnings per mile and per hour by platform - so
              you can see at a glance whether that Amazon Flex top-up is actually worth the
              wear on your Sprinter. See the dedicated guides:{" "}
              <a
                href="/amazon-flex-mileage-tracker"
                style={{ color: "#fbbf24", textDecoration: "underline" }}
              >
                Amazon Flex
              </a>{" "}
              and{" "}
              <a href="/evri-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                Evri
              </a>
              .
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
                q: "Are DPD owner driver franchisees self-employed?",
                a: "Yes. The Employment Appeal Tribunal confirmed in Stojsavljevic & Turner v DPD Group UK Ltd (2021) that DPD ODFs are neither employees nor workers - they are genuinely self-employed because the franchise contract includes a real right of substitution. ODWs (the post-Don Lane hybrid tier) are also self-employed for tax purposes despite getting holiday and sick pay benefits.",
              },
              {
                q: "Can DPD drivers claim mileage on their tax return?",
                a: "ODFs and ODWs can. Directly-employed DPD drivers cannot, because the van is provided by DPD and the AMAP rate only applies to vehicles you own or lease in your business. If you are not sure which tier you are on, check your DPD contract - 'Owner Driver Franchise Agreement' or 'Owner Driver Worker Agreement' both qualify; an Employment Contract does not.",
              },
              {
                q: "Does DPD provide a van to drivers?",
                a: "Only to directly-employed drivers. ODFs and ODWs supply their own van - typically a long-wheelbase Sprinter, Transit Jumbo, Iveco Daily, or VW Crafter. The van is owned, financed, or leased (often £1,200 to £1,500 per month). Because it is your business asset, every business mile is claimable.",
              },
              {
                q: "Should DPD drivers use Simplified Expenses or Actual Costs?",
                a: "Run both. A 40,000-mile year claims £12,000 under Simplified. The same year on a leased Sprinter claims £25,000 to £30,000 under Actual. Drivers with high running costs almost always benefit from Actual; drivers with older owned vans and low overheads often do better on Simplified. The choice is locked for that van's life with the business - you can switch when you change vans.",
              },
              {
                q: "How many miles a year does a typical DPD ODF cover?",
                a: "30,000 to 60,000 business miles. Most full-time routes sit around 40,000. That puts you well above HMRC's 10,000-mile threshold where the rate drops from 45p to 25p, so a typical Simplified claim is around £12,000 a year.",
              },
              {
                q: "Does the DPD Driver app or scanner track mileage for HMRC?",
                a: "No. The Zebra TC77 scanner and DPD Driver app track parcels, scans, signatures, and route sequencing. They do not produce a tax-year mileage total, a per-trip GPS log, or a private-versus-business split. ODFs need a separate, contemporaneous mileage record - which is what MileClear builds automatically.",
              },
              {
                q: "Are failed delivery miles still claimable?",
                a: "Yes. If you drove to a delivery address and the parcel was refused, carded, or returned, you do not get paid for the parcel - but the miles are still business miles in HMRC's view. Claim them.",
              },
              {
                q: "Does the home-to-depot drive count as a business mile?",
                a: "Generally no. HMRC treats travel from your home to a regular place of work - including the DPD depot you sort and load at every morning - as ordinary commuting, not business. Miles from the depot onwards (to each delivery and back) are business miles. MileClear lets you mark the home-to-depot leg as personal so your records reflect this.",
              },
              {
                q: "What changed after the Don Lane case?",
                a: "Don Lane was a DPD ODF who collapsed twice on his round in 2017 with diabetes complications, was fined £150 for missing a hospital appointment, and died in January 2018. The case triggered DPD's March 2018 Driver Code: the £150 daily fine was abolished, the ODW worker tier was created with paid holiday and sick pay, a Real Living Wage floor was introduced, and 6,000 drivers were given a one-off chance to re-contract between Employee, ODF, and ODW. The mileage rules did not change as a result - but the contract structure did.",
              },
              {
                q: "What format should a mileage log be in for DPD Self Assessment?",
                a: "HMRC requires a contemporaneous record - made at or around the time of each journey, not reconstructed at year end. Each entry needs the date, start point, end point, purpose, and distance. MileClear's Pro export produces a PDF mileage log in an HMRC-accepted format, suitable for attaching to your return or sharing with your accountant.",
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
              More Guides for UK Parcel Drivers
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/amazon-flex-mileage-tracker", label: "Amazon Flex Mileage Tracker" },
                { href: "/evri-mileage-tracker", label: "Evri Mileage Tracker" },
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
              Track Every DPD Mile from Today
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
              Download MileClear free. Automatic GPS tracking, HMRC AMAP rates built in, and a
              fuel log so you can run the Simplified-versus-Actual numbers on your own data,
              not estimates.
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
