import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Evri Mileage Tracker UK - Round Mileage = £8,250 Off Tax",
  description:
    "Evri pays per parcel. HMRC pays per mile. A 25,000-mile rural round claims £8,250 in deduction - more than some couriers earn from a week of small packets. MileClear tracks your round automatically. See how.",
  keywords: [
    "evri mileage tracker",
    "evri courier tax uk",
    "evri self employed plus tax",
    "evri hmrc mileage allowance",
    "hermes courier mileage tracker",
  ],
  alternates: {
    canonical: "https://mileclear.com/evri-mileage-tracker",
  },
  openGraph: {
    title: "Evri Mileage Tracker UK - Round Mileage = £8,250 Off Tax",
    description:
      "MileClear records every Evri round automatically, applies HMRC AMAP rates, and exports a Self Assessment-ready PDF. Self-Employed Plus or Classic, the mileage rules are the same.",
    url: "https://mileclear.com/evri-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Evri Mileage Tracker UK - Round Mileage = £8,250 Off Tax",
    description:
      "MileClear records every Evri round automatically, applies HMRC AMAP rates, and exports a Self Assessment-ready PDF. Self-Employed Plus or Classic, the mileage rules are the same.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Evri Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/evri-mileage-tracker",
  description:
    "How MileClear helps UK Evri couriers (Self-Employed Plus and Classic) track their daily round, calculate HMRC mileage deductions, and export Self Assessment reports.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Evri Mileage Tracker",
        item: "https://mileclear.com/evri-mileage-tracker",
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
      name: "Are Evri couriers self-employed?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes - both Classic self-employed and Self-Employed Plus couriers file Self Assessment with HMRC and can claim AMAP mileage. The 2018 Leeds Employment Tribunal ruled 65 (later 194) Hermes couriers were 'limb (b) workers' rather than independent contractors, which led Evri to negotiate the Self-Employed Plus contract with the GMB union in 2019. SE+ couriers get 28 days holiday, pension, and a National Minimum Wage floor - but they remain self-employed for tax purposes. The rebrand from Hermes to Evri in March 2022 did not change any of this.",
      },
    },
    {
      "@type": "Question",
      name: "Can Self-Employed Plus couriers still claim HMRC mileage?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. SE+ holiday pay and pension contributions are still self-employed income, not PAYE. SE+ couriers file Self Assessment, claim Class 2 and Class 4 NI, and deduct AMAP mileage exactly the same as Classic couriers. The SE+ minimum wage backstop is a floor, not a tax deduction - mileage remains the largest single allowable expense for most couriers.",
      },
    },
    {
      "@type": "Question",
      name: "Does Evri provide a vehicle to couriers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Evri couriers must use their own vehicle - reliable, valid MOT, and crucially a hire-and-reward / courier insurance policy (a standard SDP or commute policy is invalid for delivery work and a claim will be refused). Couriers cover their own fuel, servicing, tyres, and depreciation. Because the vehicle is yours as a business asset, every business mile is claimable under AMAP.",
      },
    },
    {
      "@type": "Question",
      name: "How many miles a day does an Evri courier do?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Roughly 50 to 200 miles a day depending on round type. Urban rounds with dense postcodes typically run 50 to 80 miles a day for 150 to 250 parcels. Suburban rounds sit at 80 to 120 miles for 100 to 180 parcels. Rural rounds are 120 to 200 miles a day for 60 to 120 parcels - and that is where AMAP matters most, because fuel can eat half the per-parcel premium without the mileage deduction.",
      },
    },
    {
      "@type": "Question",
      name: "Did the Evri small-packet rate cut affect mileage claims?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Not directly - HMRC rates are set by HMRC, not by Evri. But it changed the maths. When Evri introduced the 35p small-packet band in January 2025 and BBC Panorama investigated below-NMW take-home in December 2025, mileage suddenly mattered more, not less. AMAP claims do not change with the per-parcel rate, so they make up a larger proportion of net earnings when parcel pay drops. For rural couriers especially, mileage is often the biggest line on the Self Assessment.",
      },
    },
    {
      "@type": "Question",
      name: "Does the Evri Courier Community app track mileage?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The Evri Courier Community app shows round offers, the availability planner, estimated pay, the parcel-band breakdown, and Onsi On-Demand Pay withdrawals. It does not produce a mileage log, a tax-year mileage total, or a private-versus-business split. That is what MileClear does - automatically, in the background, while you do your round.",
      },
    },
    {
      "@type": "Question",
      name: "Will Making Tax Digital affect Evri couriers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, in two stages. Making Tax Digital for Income Tax Self Assessment (MTD ITSA) becomes mandatory from April 2026 for self-employed earning over £50,000 a year, and from April 2027 for those over £30,000 a year. That covers a significant slice of full-time Evri couriers. Mileage records will need to be kept digitally and submitted quarterly. MileClear's data is already in a digital, exportable format ready for the transition.",
      },
    },
  ],
};

export default function EvriMileageTracker() {
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
              For Evri Couriers - Self-Employed Plus & Classic
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
              Evri Mileage Tracker - Your Round, Your Deduction
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              The Evri Courier Community app tracks your parcels, your scans, and your
              estimated pay. It does not track your mileage. A rural round at 25,000 business
              miles a year claims £8,250 in HMRC AMAP deduction - often more than a quiet week
              of small-packet pay. MileClear records every round automatically, applies the
              right rate, and produces a Self Assessment-ready log. Free to download - Pro from
              £4.99 per month.
            </p>
          </header>

          {/* SE+ vs Classic */}
          <section
            aria-labelledby="contracts-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="contracts-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Self-Employed Plus or Classic - You Still File Self Assessment
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              In June 2018 a Leeds Employment Tribunal ruled that 65 Hermes couriers (later
              cited as 194) were &quot;limb (b) workers&quot; rather than independent
              contractors - the first union-recognised gig economy ruling in the UK. Hermes
              chose to negotiate rather than appeal, and in February 2019 launched
              Self-Employed Plus in partnership with the GMB union. Two contract options have
              coexisted since.
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
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.625rem" }}
                >
                  Self-Employed Plus (SE+)
                </h3>
                <ul
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                    lineHeight: 1.7,
                    paddingLeft: "1.125rem",
                    margin: 0,
                  }}
                >
                  <li>28 days paid holiday</li>
                  <li>Pension auto-enrolment (Evri 3%, courier 5%)</li>
                  <li>National Minimum Wage floor</li>
                  <li>Pay set via GMB collective bargaining</li>
                  <li>5+ days/week including weekend</li>
                  <li>Still self-employed for tax</li>
                </ul>
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
                  Classic Self-Employed
                </h3>
                <ul
                  style={{
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                    lineHeight: 1.7,
                    paddingLeft: "1.125rem",
                    margin: 0,
                  }}
                >
                  <li>No paid holiday or sick pay</li>
                  <li>No pension contribution</li>
                  <li>No NMW floor</li>
                  <li>Most flexible - work as many or few days as you choose</li>
                  <li>Common for weekend-only or part-time couriers</li>
                  <li>Self-employed for tax</li>
                </ul>
              </div>
            </div>

            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              For HMRC, both contracts are identical. Both file Self Assessment, both pay Class
              2 and Class 4 NI, both can claim AMAP mileage. SE+ holiday pay and pension
              contributions show up as taxable income, not PAYE. Whichever contract you are
              on, mileage is the largest deductible expense available to you, and you are the
              only person who can record it.
            </p>
          </section>

          {/* The Round */}
          <section
            aria-labelledby="round-heading"
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
              id="round-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.125rem",
              }}
            >
              Your Round Is Not a Gig - It Is a Territory
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              An Evri round is a defined geographic area - a postcode cluster the same courier
              delivers to most days, sometimes for years. That makes it fundamentally different
              from an Uber ride, an Amazon Flex block, or a Just Eat run. You learn it. You
              know which buildings have safe places, which dogs bite, which addresses prefer
              &quot;leave with the neighbour&quot;. Familiarity is part of the value.
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              Volume varies wildly by density. Urban rounds run 150 to 250 parcels a day across
              50 to 80 miles. Suburban rounds sit at 100 to 180 parcels across 80 to 120 miles
              - the sweet spot. Rural rounds are 60 to 120 parcels stretched across 120 to 200
              miles, where every fuel-up matters.
            </p>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              Christmas peak (late October to Christmas Eve) can push volumes to 400 to 500
              parcels a day. Your round mileage doubles too. MileClear records every drive
              without you tapping anything - critical when you are 12 hours into a 14-hour peak
              shift and not thinking about tax.
            </p>
          </section>

          {/* Round archetypes */}
          <section
            aria-labelledby="archetypes-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="archetypes-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Three Round Archetypes - Three Different Tax Stories
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              {[
                {
                  type: "Urban",
                  miles: "60 mi/day",
                  yearMi: "15,000 mi/yr",
                  claim: "£5,750",
                  saved: "£1,150",
                  note: "Dense, lots of stops, fuel cost lower per parcel - but parcel pay band sometimes lower too.",
                },
                {
                  type: "Suburban",
                  miles: "100 mi/day",
                  yearMi: "20,000 mi/yr",
                  claim: "£7,000",
                  saved: "£1,400",
                  note: "The sweet spot. Mid-range rates, mid-range mileage, healthy mix of stop density and route distance.",
                },
                {
                  type: "Rural",
                  miles: "180 mi/day",
                  yearMi: "30,000 mi/yr",
                  claim: "£9,500",
                  saved: "£1,900",
                  note: "Slightly higher per-parcel rate but fuel costs eat half the premium. Mileage deduction is the difference.",
                },
              ].map(({ type, miles, yearMi, claim, saved, note }) => (
                <div
                  key={type}
                  style={{
                    background: "rgba(251,191,36,0.06)",
                    border: "1px solid rgba(251,191,36,0.15)",
                    borderRadius: 12,
                    padding: "1.5rem",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      color: "#fbbf24",
                      marginBottom: "0.75rem",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {type} Round
                  </h3>
                  <div style={{ marginBottom: "0.625rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Daily distance</div>
                    <div style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0" }}>
                      {miles}
                    </div>
                  </div>
                  <div style={{ marginBottom: "0.625rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Annual</div>
                    <div style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0" }}>
                      {yearMi}
                    </div>
                  </div>
                  <div style={{ marginBottom: "0.625rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>AMAP claim</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#f9fafb" }}>
                      {claim}
                    </div>
                  </div>
                  <div style={{ marginBottom: "0.875rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Tax saved (basic rate)</div>
                    <div style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0" }}>
                      {saved}
                    </div>
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
                    {note}
                  </p>
                </div>
              ))}
            </div>

            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              The pattern is consistent: as the round goes more rural, the per-parcel premium
              rises slightly but fuel takes more of it back. The mileage deduction does not
              flinch - it scales linearly with miles driven, capped only by the 10,000-mile
              threshold where the rate steps from 45p to 25p. For full-time rural Evri couriers,
              AMAP is often the largest line on the Self Assessment.
            </p>
          </section>

          {/* The 35p story */}
          <section
            aria-labelledby="small-packet-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="small-packet-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              When Per-Parcel Pay Drops, Mileage Matters More
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              In January 2025 Evri introduced a new &quot;small packet&quot; rate band paying
              35p per item. A change.org petition signed by thousands of couriers reported
              parcels as large as radiators and flatpack furniture being labelled small packet
              for pay purposes. By December 2025 BBC Panorama&apos;s &quot;Where&apos;s My
              Parcel?&quot; documentary found couriers earning below National Minimum Wage
              after the change. MPs intervened ahead of the Christmas peak; the GMB tabled a
              new pay claim.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The HMRC mileage rate did not move. AMAP is set by HMRC, not by Evri - 45p first
              10,000 miles, 25p thereafter for cars, 24p flat for mopeds and motorbikes. When
              parcel pay drops, mileage becomes a larger proportion of net take-home, not a
              smaller one.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              For couriers being squeezed on per-parcel rates, the question is no longer
              &quot;can I afford to track mileage?&quot; - it is &quot;can I afford not to?&quot;
              MileClear is a free download. Pro is £4.99 a month. A typical full-time round
              recovers that in tax saved within the first week of any tax year.
            </p>
          </section>

          {/* MTD ITSA hook */}
          <section
            aria-labelledby="mtd-heading"
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
              id="mtd-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.125rem",
              }}
            >
              Making Tax Digital - April 2026 and April 2027
            </h2>
            <p style={{ color: "#cbd5e1", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              Making Tax Digital for Income Tax Self Assessment (MTD ITSA) is rolling out in
              two stages. From April 2026 it becomes mandatory for self-employed people
              earning over £50,000 a year. From April 2027 the threshold drops to £30,000.
              That second threshold catches a large slice of full-time Evri couriers,
              especially SE+ couriers running 5 to 6 day rounds.
            </p>
            <p style={{ color: "#cbd5e1", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              Once MTD applies, you will need to keep records digitally and submit quarterly
              updates to HMRC. A paper notebook with the day&apos;s mileage scribbled in pen
              will not satisfy the rules. A spreadsheet without the right software bridge will
              not either.
            </p>
            <p style={{ color: "#cbd5e1", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              MileClear&apos;s data is already in the right shape - dated, GPS-verified, with
              vehicle and platform tags, exportable to CSV and PDF. When MTD lands, your
              mileage records do not need to change. Everything else might, but not that.
            </p>
          </section>

          {/* Driver pain points / fuel reality */}
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
              No Fuel Allowance, No Round Pay - Just Per Parcel
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Evri does not pay a fuel supplement, a vehicle allowance, or a per-round flat
              rate. Pay is purely per parcel: 35p small packet, 60p to £1.20 standard, up to
              £2 for larger or rural items. Couriers fully absorb fuel rises, and the platform
              has form for cutting individual courier rates when their hourly earnings look
              &quot;too high&quot;.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              MileClear shows live fuel prices from over 8,300 UK stations using the
              government-mandated price reporting database. You can see which stations near
              your delivery unit or along your round have the cheapest fuel before you fill
              up. Saving 5p per litre on a regular fill-up is real money across a peak week.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              The fuel log feature also lets you record every fill-up with the cost, litres,
              and odometer reading. Over a few months you have your real cost per mile - which
              tells you whether AMAP&apos;s simplified rate is generous or stingy on your
              specific vehicle and round.
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
              Evri Alongside Amazon Flex, DPD, or Other Parcel Work
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Many Classic Evri couriers also pick up Amazon Flex blocks on quiet evenings, do
              an extra DPD run when their own round wraps early, or take direct B2B work
              through a local network. From HMRC&apos;s view it is all one self-employment
              trade on the same vehicle, claimable under the same chosen method (Simplified or
              Actual). What you need to show is which work was for which client, and that the
              totals add up.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear tags every shift and trip with the platform. Evri rounds are tagged
              separately from Amazon Flex blocks, DPD routes, or anything else. The business
              insights view compares earnings per mile and per hour by platform, so you can
              see whether the extra Flex blocks are actually worth the wear on your van. See
              the dedicated guides:{" "}
              <a
                href="/amazon-flex-mileage-tracker"
                style={{ color: "#fbbf24", textDecoration: "underline" }}
              >
                Amazon Flex
              </a>{" "}
              and{" "}
              <a href="/dpd-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                DPD
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
                q: "Are Evri couriers self-employed?",
                a: "Yes - both Self-Employed Plus and Classic. Both file Self Assessment and pay Class 2 and Class 4 NI. SE+ adds 28 days holiday, pension, and an NMW floor on top of self-employed status; it does not change the tax position.",
              },
              {
                q: "Can SE+ couriers still claim HMRC mileage?",
                a: "Yes. SE+ holiday pay and pension contributions are taxable self-employed income, not PAYE. SE+ couriers claim AMAP mileage exactly the same as Classic couriers.",
              },
              {
                q: "Does Evri provide a vehicle to couriers?",
                a: "No. Couriers use their own vehicle and must hold hire-and-reward (courier) insurance. Standard SDP or commute policies are invalid for delivery work and a claim will be refused. Because the vehicle is yours, every business mile is claimable.",
              },
              {
                q: "How many miles a day does an Evri round cover?",
                a: "Urban rounds 50-80 mi/day, suburban 80-120, rural 120-200. Christmas peak roughly doubles those figures. Most full-time couriers settle into a single round and the daily total stays consistent week to week.",
              },
              {
                q: "What HMRC mileage rate applies to my Evri round?",
                a: "Cars and vans: 45p per mile for the first 10,000 business miles in the tax year, 25p after that. Mopeds and motorbikes: 24p per mile flat. Most full-time Evri couriers exceed 10,000 miles partway through the year, so the 25p rate applies for a meaningful chunk of their round.",
              },
              {
                q: "Should I use Simplified Expenses or Actual Costs?",
                a: "Most Evri couriers benefit from Simplified - the AMAP rate covers fuel, insurance, servicing, depreciation, and tax in a single per-mile figure. Actual Costs (keeping every fuel and repair receipt) wins only for high-mileage diesel vans with expensive lease or finance costs. The choice is locked for that vehicle's life with the business.",
              },
              {
                q: "Did the small-packet rate cut affect mileage claims?",
                a: "Not directly. AMAP rates are set by HMRC. But because per-parcel pay dropped while mileage rates stayed the same, mileage now makes up a bigger proportion of net take-home for many couriers. Tracking it has gone from 'worth doing' to 'essential'.",
              },
              {
                q: "Does the Evri Courier Community app track mileage?",
                a: "No. It tracks parcels, scans, signatures, and pay - but no mileage log, no tax-year total, no GPS audit trail. That is what MileClear adds.",
              },
              {
                q: "What about Making Tax Digital?",
                a: "MTD ITSA becomes mandatory for self-employed earning over £50k from April 2026, and over £30k from April 2027. That second threshold catches a large slice of full-time Evri couriers. MileClear's data is already in the digital, exportable format MTD needs.",
              },
              {
                q: "Does the home-to-delivery-unit drive count as a business mile?",
                a: "Generally no. HMRC treats travel from home to your regular place of work as ordinary commuting, even if the 'place of work' is a sortation depot you only spend 30 minutes at each morning. Miles from the delivery unit onwards - through your round and back - are business miles.",
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
              More Guides for UK Parcel Couriers
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/dpd-mileage-tracker", label: "DPD Mileage Tracker" },
                { href: "/amazon-flex-mileage-tracker", label: "Amazon Flex Mileage Tracker" },
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
              Track Every Round from Today
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
              Download MileClear free. Automatic GPS tracking, AMAP rates built in, fuel-price
              comparison across 8,300+ UK stations, and a Self Assessment-ready PDF that
              survives any HMRC challenge.
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
