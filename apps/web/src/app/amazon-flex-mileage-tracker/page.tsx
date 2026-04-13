import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Amazon Flex Mileage Tracker UK - Claim Every Delivery Mile",
  description:
    "The best mileage tracker for UK Amazon Flex drivers. Track block-based shifts, route miles, return-to-depot journeys, and export HMRC Self Assessment reports. Free to download.",
  keywords: [
    "amazon flex mileage tracker",
    "amazon flex tax deduction uk",
    "amazon flex self employed expenses",
    "amazon flex hmrc mileage",
    "amazon flex driver tax return uk",
  ],
  alternates: {
    canonical: "https://mileclear.com/amazon-flex-mileage-tracker",
  },
  openGraph: {
    title: "Amazon Flex Mileage Tracker UK - Claim Every Delivery Mile",
    description:
      "MileClear tracks every mile you drive for Amazon Flex - pickup to last drop, plus return miles. Calculates your HMRC deduction automatically.",
    url: "https://mileclear.com/amazon-flex-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Amazon Flex Mileage Tracker UK - Claim Every Delivery Mile",
    description:
      "MileClear tracks every mile you drive for Amazon Flex - pickup to last drop, plus return miles. Calculates your HMRC deduction automatically.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Amazon Flex Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/amazon-flex-mileage-tracker",
  description:
    "How MileClear helps UK Amazon Flex drivers track block-based shifts, calculate HMRC mileage deductions, and export Self Assessment reports.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Amazon Flex Mileage Tracker",
        item: "https://mileclear.com/amazon-flex-mileage-tracker",
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
      name: "Can Amazon Flex drivers claim mileage on their UK tax return?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Amazon Flex drivers are self-employed in the UK and can claim the HMRC Approved Mileage Allowance Payment rate: 45p per mile for the first 10,000 business miles in a tax year, and 25p per mile after that. Business miles include the entire route from the Amazon depot to the last delivery drop, plus any return trip if you drive back to the depot.",
      },
    },
    {
      "@type": "Question",
      name: "Does driving to the Amazon depot count as a business mile?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The journey from your home to the Amazon depot at the start of a block is generally treated as ordinary commuting by HMRC and is not claimable as a business mile. Miles driven from the depot onwards - to each delivery address and back to the depot - are business miles.",
      },
    },
    {
      "@type": "Question",
      name: "How much can an Amazon Flex driver save on tax with mileage tracking?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "An Amazon Flex driver covering 25,000 business miles a year would have a deduction of £8,750 (10,000 x 45p + 15,000 x 25p). At a 20% income tax rate, that is £1,750 back from HMRC purely from mileage allowance.",
      },
    },
    {
      "@type": "Question",
      name: "Does Amazon report Flex driver earnings to HMRC?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Amazon is required to report Flex driver payments to HMRC under UK tax rules. That makes accurate expense records - including a contemporaneous mileage log - essential for Flex drivers who want to maximise their deductions legitimately.",
      },
    },
  ],
};

export default function AmazonFlexMileageTracker() {
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
              For Amazon Flex Drivers
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
              Amazon Flex Mileage Tracker - Claim Every Delivery Mile
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              Amazon Flex drivers in the UK cover serious mileage. A four-hour block in a suburban area
              can mean 40 to 80 miles of delivery routes. MileClear tracks every mile automatically,
              groups them into blocks that match how Flex actually works, and calculates your HMRC
              deduction in real time. Free to download - Pro features unlock for £4.99 per month.
            </p>
          </header>

          {/* Why Amazon Flex drivers need tracking */}
          <section
            aria-labelledby="why-track-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="why-track-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Why Mileage Tracking Matters for Amazon Flex Drivers
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Amazon Flex drivers are classified as self-employed in the UK. That means you file a
              self-assessment tax return each year, and you are responsible for recording your own business
              expenses. Mileage is almost always the single largest deductible expense for Flex drivers.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              HMRC&apos;s Approved Mileage Allowance Payment (AMAP) rate lets you claim 45p per mile for
              the first 10,000 business miles in a tax year, and 25p per mile after that. For a driver
              running two or three blocks per day, five days a week, that mileage can reach 25,000 to
              35,000 miles per year - giving a tax deduction worth over £9,000 in some cases.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The problem is that HMRC requires a contemporaneous mileage log. You cannot estimate at the
              end of the year. You need a dated record of each journey with its purpose, start point, end
              point, and distance. Most Flex drivers do not keep one - and the ones who do often find that
              a rough spreadsheet is challenged by an accountant or rejected by HMRC.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear records everything automatically using GPS. Every time you drive, MileClear is
              building the mileage log you need for self-assessment.
            </p>
          </section>

          {/* Block-based shifts */}
          <section
            aria-labelledby="blocks-heading"
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
              id="blocks-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.125rem",
              }}
            >
              Block-Based Shifts - How MileClear Mirrors How Flex Works
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              Amazon Flex operates in blocks - typically two, three, or four hours. You accept a block,
              drive to the depot at the block start time, collect your packages, and begin deliveries.
              Some drivers do one block per day; others do multiple consecutive blocks or shift between
              stations in the same session.
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              MileClear&apos;s shift mode mirrors this pattern perfectly. Start a shift when you leave
              the depot with your first load. Every delivery trip within that shift is tracked and grouped
              under that single block session. When you return to the depot or complete your last drop,
              end the shift. You get a scorecard with the total miles for that block and - if you have
              entered your block earnings - your earnings per mile for that session.
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              This makes it easy to compare block types - Prime Now blocks versus standard delivery,
              grocery blocks versus parcels, city-centre dense routes versus suburban long-distance runs.
              Over time, the data shows you which blocks are actually worth your time once fuel is
              factored in.
            </p>
          </section>

          {/* What to claim */}
          <section
            aria-labelledby="what-to-claim-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="what-to-claim-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              What Amazon Flex Drivers Can and Cannot Claim
            </h2>

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
                  Business miles you CAN claim
                </h3>
                <ul
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                    lineHeight: 1.75,
                    paddingLeft: "1.125rem",
                  }}
                >
                  <li>Depot to each delivery address</li>
                  <li>Between delivery stops on your route</li>
                  <li>Return trip from last delivery back to depot (if applicable to your block type)</li>
                  <li>Positioning miles - driving to a different station or zone at Amazon&apos;s direction</li>
                  <li>Any detour required due to access issues at a delivery address</li>
                </ul>
              </div>
              <div
                style={{
                  background: "rgba(239,68,68,0.05)",
                  border: "1px solid rgba(239,68,68,0.15)",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#ef4444", marginBottom: "0.75rem" }}
                >
                  Miles you CANNOT claim
                </h3>
                <ul
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.9rem",
                    lineHeight: 1.75,
                    paddingLeft: "1.125rem",
                  }}
                >
                  <li>
                    Home to depot at the start of your block - this is ordinary commuting in HMRC&apos;s view
                  </li>
                  <li>Depot to home after your final block of the day</li>
                  <li>Personal errands between blocks</li>
                  <li>Any non-Flex driving done in the same vehicle on the same day</li>
                </ul>
              </div>
            </div>

            <p style={{ color: "#94a3b8", lineHeight: 1.75, fontSize: "0.9375rem" }}>
              The commute rule is important and frequently misunderstood. HMRC considers travel from a
              permanent place of work (including a depot you regularly report to) to be ordinary commuting,
              not a business journey. For most Amazon Flex drivers who consistently use the same station,
              the home-to-depot leg is not claimable. MileClear lets you mark that segment as personal so
              your records accurately reflect what is and is not a business mile.
            </p>
          </section>

          {/* How MileClear works for Flex */}
          <section aria-labelledby="how-it-works-heading" style={{ marginBottom: "3.5rem" }}>
            <h2
              id="how-it-works-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.5rem",
              }}
            >
              How MileClear Fits Into Your Amazon Flex Routine
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
                  title: "Automatic Detection at the Depot",
                  body:
                    "Set your Amazon depot as a saved location in MileClear. When you leave the depot, MileClear can detect that you are starting a delivery run and prompt you to begin tracking. No need to unlock your phone before heading out.",
                },
                {
                  title: "Amazon Flex Platform Tag",
                  body:
                    "Tag every shift and trip with Amazon Flex so your records are separated from personal driving. If you also do other delivery work, each platform stays in its own category.",
                },
                {
                  title: "Multi-Stop Route Tracking",
                  body:
                    "Each delivery address is a stop within your shift. MileClear records the full route including inter-stop distances. At the end of the block, you have a complete mileage record for the entire route.",
                },
                {
                  title: "Return-to-Depot Miles",
                  body:
                    "If your block includes returning to the depot after the last delivery, that return trip is also tracked as a business mile. MileClear does not cut off your record at the last drop.",
                },
                {
                  title: "Earnings Per Mile by Block Type",
                  body:
                    "Enter your block earnings when you end the shift. MileClear calculates your effective earnings per mile and per hour for each block, so you can compare which block types are most profitable for the fuel you use.",
                },
                {
                  title: "HMRC-Ready Exports",
                  body:
                    "Pro users get a PDF mileage log and self-assessment summary. Every trip is dated, timestamped, and distance-verified. Share it with your accountant or attach it directly to your HMRC online return.",
                },
              ].map(({ title, body }) => (
                <div
                  key={title}
                  style={{
                    background: "rgba(15,23,42,0.6)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 14,
                    padding: "1.5rem",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#fbbf24",
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

          {/* Savings section */}
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
              Typical Savings for a UK Amazon Flex Driver
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1.5rem" }}>
              Amazon Flex drivers typically cover high mileage compared to other gig economy work.
              Delivery routes in suburban areas can involve 40 to 70 stops spread across 50 to 80 miles
              per block. Full-time Flex drivers running two blocks per day, six days a week, can accumulate
              30,000 to 40,000 delivery miles per year.
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
                Example: 25,000 Business Miles Per Year
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
                  { label: "Next 15,000 miles", value: "£3,750", note: "at 25p/mile" },
                  { label: "Total deduction", value: "£8,250", note: "from taxable income" },
                  { label: "Tax saved (20% rate)", value: "£1,650", note: "directly from mileage" },
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
              At 40% tax (higher rate), that same 25,000 miles produces a saving of £3,300 per year from
              mileage alone. Even a part-time Flex driver doing 12,000 business miles per year would have
              a deduction of £4,900 - worth £980 in tax at the basic rate.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              The question is not whether the deduction is worth claiming. It clearly is. The question is
              whether you have the records to claim it. MileClear provides those records automatically,
              every time you drive.
            </p>
          </section>

          {/* Fuel section */}
          <section
            aria-labelledby="fuel-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="fuel-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Fuel Costs and Amazon Flex Profitability
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Fuel is the most significant running cost for Amazon Flex drivers, and it eats directly into
              your block earnings. A driver covering 60 miles in a block at 35 mpg uses approximately 1.7
              gallons - around 7.7 litres. At current UK petrol prices of around 140p per litre, that is
              roughly £10.80 in fuel per block. On a four-hour block paying £50 to £60, fuel alone is 18
              to 22% of gross earnings.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              MileClear shows live fuel prices from over 8,300 UK stations using the government-mandated
              price reporting database. You can see which stations near you have the cheapest fuel before
              you start a block. Saving 5p per litre on a regular fill-up adds up to real money across a
              working week.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              The fuel log feature also lets you log every fill-up with the cost, litres, and odometer
              reading. Over time, MileClear calculates your actual cost per mile from real data - not
              estimates - so you know exactly what your vehicle costs to run.
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
              Amazon Flex Alongside Other Delivery Work
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Many Amazon Flex drivers supplement their income with other delivery work - DPD, Yodel, Evri,
              or even Uber during quiet Amazon periods. From a tax perspective, all of this mileage is
              business miles and can be claimed under the same HMRC AMAP rules. But you need to be able
              to show which miles were for which employer, especially if HMRC queries your return.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              MileClear tags every trip with the platform. Amazon Flex blocks are tagged separately from
              DPD days or Uber shifts. The business insights comparison then shows you which platforms
              deliver the best earnings per mile and per hour from your own real data - not industry
              averages.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              If you drive for Uber or Deliveroo alongside Flex, see the dedicated guides:{" "}
              <a href="/uber-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                Uber mileage tracker
              </a>{" "}
              and{" "}
              <a
                href="/deliveroo-mileage-tracker"
                style={{ color: "#fbbf24", textDecoration: "underline" }}
              >
                Deliveroo mileage tracker
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
                q: "Can Amazon Flex drivers claim mileage on their UK tax return?",
                a: "Yes. Amazon Flex drivers are self-employed and can claim 45p per mile for the first 10,000 business miles and 25p per mile after that. Business miles include the full delivery route from depot to each drop, including inter-stop miles and any required return to depot.",
              },
              {
                q: "Does driving to the Amazon depot count as a business mile?",
                a: "No. The journey from home to the depot at the start of your block is ordinary commuting in HMRC's view and is not claimable. Miles from the depot onwards - to each delivery and back - are business miles.",
              },
              {
                q: "How much can an Amazon Flex driver save on tax with mileage tracking?",
                a: "A Flex driver covering 25,000 business miles per year has a deduction of £8,250. At a 20% tax rate that is a £1,650 saving directly from mileage allowance. At 40%, it is £3,300.",
              },
              {
                q: "Does Amazon report Flex earnings to HMRC?",
                a: "Yes. Amazon is required to report Flex driver payments under UK tax rules. Accurate expense records including a contemporaneous mileage log are essential to ensure you are only taxed on net profit, not gross earnings.",
              },
              {
                q: "What format should a mileage log be in for Amazon Flex?",
                a: "HMRC requires a record of each journey's date, start and end point, purpose, and distance. MileClear's Pro export produces a PDF mileage log in an accepted format, suitable for attaching to your self-assessment return or sharing with an accountant.",
              },
            ].map(({ q, a }, i) => (
              <div
                key={q}
                style={{
                  borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.06)" : undefined,
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
              More Guides for UK Gig Drivers
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/mileclear-vs-mileiq", label: "MileClear vs MileIQ" },
                { href: "/uber-mileage-tracker", label: "Uber Mileage Tracker" },
                { href: "/deliveroo-mileage-tracker", label: "Deliveroo Mileage Tracker" },
                { href: "/#features", label: "All Features" },
                { href: "/#pricing", label: "Pricing" },
                { href: "/#faq", label: "FAQ" },
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
              Start Tracking Your Amazon Flex Miles Today
            </h2>
            <p
              style={{
                color: "#94a3b8",
                fontSize: "1rem",
                lineHeight: 1.7,
                marginBottom: "1.75rem",
                maxWidth: 520,
                margin: "0 auto 1.75rem",
              }}
            >
              Download MileClear free. Automatic tracking, HMRC rates, and block-based shift mode built
              in from day one.
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
