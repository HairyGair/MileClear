import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Deliveroo Mileage Tracker UK - Track Your Rides and Claim Tax Back",
  description:
    "Deliveroo doesn't track your mileage - we do. Automatic GPS, HMRC rates by vehicle (car, motorbike, cyclist expenses), Self Assessment exports. Free.",
  keywords: [
    "deliveroo mileage tracker",
    "deliveroo driver tax",
    "deliveroo rider expenses uk",
    "deliveroo hmrc mileage",
    "deliveroo self employed expenses",
  ],
  alternates: {
    canonical: "https://mileclear.com/deliveroo-mileage-tracker",
  },
  openGraph: {
    title: "Deliveroo Mileage Tracker UK - Track Your Rides and Claim Tax Back",
    description:
      "MileClear tracks every mile you ride for Deliveroo, calculates HMRC deductions by vehicle type, and exports a self-assessment-ready mileage log.",
    url: "https://mileclear.com/deliveroo-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Deliveroo Mileage Tracker UK - Track Your Rides and Claim Tax Back",
    description:
      "MileClear tracks every mile you ride for Deliveroo, calculates HMRC deductions by vehicle type, and exports a self-assessment-ready mileage log.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Deliveroo Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/deliveroo-mileage-tracker",
  description:
    "How MileClear helps UK Deliveroo riders and drivers track business miles, calculate HMRC deductions, and export Self Assessment reports.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Deliveroo Mileage Tracker",
        item: "https://mileclear.com/deliveroo-mileage-tracker",
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
      name: "Does Deliveroo track rider mileage?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. The Deliveroo Rider app records the orders you complete and your earnings, but it does not log the miles you cover between drops, the loops back to busy zones, or the time waiting for orders. HMRC lets you claim every business mile from the moment you go online to the moment you finish, on-order or repositioning. MileClear records the entire ride session automatically - whatever vehicle you use - and produces a Self Assessment-ready mileage log for your tax return.",
      },
    },
    {
      "@type": "Question",
      name: "Can Deliveroo cyclists claim mileage on their tax return?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. HMRC's Approved Mileage Allowance Payment (AMAP) rates only apply to motor vehicles - cars, vans, and motorbikes. Cyclists cannot claim a per-mile deduction, but they can claim the cost of equipment, clothing, repairs, and bicycle depreciation as allowable expenses.",
      },
    },
    {
      "@type": "Question",
      name: "What mileage rate can Deliveroo motorbike riders claim?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Deliveroo riders using a motorbike or moped can claim 24p per mile flat for all business miles. Unlike cars, there is no higher rate for the first 10,000 miles - it is 24p throughout the tax year.",
      },
    },
    {
      "@type": "Question",
      name: "What mileage rate can Deliveroo car drivers claim?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Deliveroo drivers using a car can claim 45p per mile for the first 10,000 business miles in a tax year, and 25p per mile for every mile after that.",
      },
    },
    {
      "@type": "Question",
      name: "Does Deliveroo count as self-employed?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Deliveroo riders in the UK are classified as self-employed contractors, which means they are responsible for their own tax via self-assessment. Business mileage is one of the most significant deductions available to them.",
      },
    },
  ],
};

export default function DeliverooMileageTracker() {
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
              For Deliveroo Riders
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
              Track Your Deliveroo Miles and Claim Your Tax Back
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              Whether you ride a motorbike, drive a car, or cycle for Deliveroo, your vehicle costs are
              a tax deduction. MileClear automatically records every business mile, applies the correct
              HMRC rate for your vehicle type, and generates an export-ready mileage log. Free to download
              - no subscription needed for the core tracking features.
            </p>
          </header>

          {/* Vehicle types section */}
          <section aria-labelledby="vehicle-types-heading" style={{ marginBottom: "3.5rem" }}>
            <h2
              id="vehicle-types-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              HMRC Rates by Vehicle Type for Deliveroo Riders
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1.5rem", maxWidth: 680 }}>
              The mileage rate you can claim depends on the vehicle you use for deliveries. MileClear
              stores your vehicle type when you set it up and applies the correct HMRC rate automatically.
              You never need to remember which rate applies to you.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              {/* Motorbike */}
              <div
                style={{
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  padding: "1.5rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#fbbf24",
                    marginBottom: "0.5rem",
                  }}
                >
                  Motorbike or Moped
                </div>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "#f9fafb",
                    lineHeight: 1,
                    marginBottom: "0.375rem",
                  }}
                >
                  24p/mile
                </div>
                <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.65 }}>
                  Flat rate for all business miles. No higher rate for the first 10,000 miles - 24p per
                  mile throughout the tax year. Applies to mopeds and any engine-size motorbike.
                </p>
              </div>

              {/* Car */}
              <div
                style={{
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  padding: "1.5rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#fbbf24",
                    marginBottom: "0.5rem",
                  }}
                >
                  Car or Van
                </div>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "#f9fafb",
                    lineHeight: 1,
                    marginBottom: "0.375rem",
                  }}
                >
                  45p / 25p
                </div>
                <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.65 }}>
                  45p per mile for the first 10,000 business miles in the tax year, then 25p per mile
                  beyond that. Applies to all private cars and vans used for deliveries.
                </p>
              </div>

              {/* Bicycle */}
              <div
                style={{
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  padding: "1.5rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#64748b",
                    marginBottom: "0.5rem",
                  }}
                >
                  Bicycle
                </div>
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "#94a3b8",
                    lineHeight: 1,
                    marginBottom: "0.375rem",
                  }}
                >
                  No AMAP
                </div>
                <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.65 }}>
                  HMRC Approved Mileage Allowance Payments do not apply to bicycles. Cyclists can
                  instead claim actual costs: bicycle purchase (capital allowances), repairs,
                  accessories, clothing, and insurance. See below for more detail.
                </p>
              </div>
            </div>
          </section>

          {/* Cyclists section */}
          <section
            aria-labelledby="cyclists-heading"
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
              id="cyclists-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.125rem",
              }}
            >
              A Note for Deliveroo Cyclists
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1rem" }}>
              If you ride a bicycle for Deliveroo, the standard HMRC mileage allowance does not apply. You
              cannot claim 45p per mile - that rate is specifically for motor vehicles. What you can do
              instead is claim the actual costs associated with your bicycle and cycling gear as allowable
              business expenses.
            </p>
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: "#34d399",
                marginBottom: "0.625rem",
              }}
            >
              What cyclists CAN claim
            </h3>
            <ul
              style={{
                color: "#94a3b8",
                fontSize: "0.9375rem",
                lineHeight: 1.75,
                paddingLeft: "1.25rem",
                marginBottom: "1rem",
              }}
            >
              <li>The cost of the bicycle itself, via capital allowances (annual investment allowance)</li>
              <li>Repairs and servicing</li>
              <li>Replacement parts - tyres, chains, brakes, lights</li>
              <li>Waterproof and hi-vis clothing used specifically for deliveries</li>
              <li>Helmet, gloves, and other safety equipment</li>
              <li>Bike lock, panniers, delivery bag</li>
              <li>Insurance for business use</li>
            </ul>
            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              MileClear tracks your mileage so you have a record of how much of your cycling was for
              business use - useful for calculating the business proportion of any costs you share between
              personal and business riding. Always keep your receipts and speak to an accountant if you
              are unsure what proportion of bicycle costs you can claim.
            </p>
          </section>

          {/* How MileClear works */}
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
              How MileClear Works for Deliveroo Riders
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
                  title: "Shift Mode Matches Deliveroo Sessions",
                  body:
                    "Start a shift when you log into the Deliveroo rider app. Every trip within that session is tracked and grouped together. End the shift when you finish and get a complete summary: miles covered, time on zone, and if you have entered earnings, your rate per mile.",
                },
                {
                  title: "Deliveroo Platform Tagging",
                  body:
                    "Tag every trip or shift as Deliveroo so your records are separated from personal driving and from other platforms you might work for. At tax time, your Deliveroo miles are already isolated and totalled.",
                },
                {
                  title: "Automatic Drive Detection",
                  body:
                    "MileClear detects when you start moving and begins tracking. You get a notification - confirm if it is a delivery, dismiss if it is personal. No more forgetting to start the app before heading to your first restaurant.",
                },
                {
                  title: "HMRC Rate by Vehicle Type",
                  body:
                    "Set your vehicle as car or motorbike when you first set up MileClear. The correct HMRC rate is applied automatically. The dashboard shows your running deduction total in real time.",
                },
                {
                  title: "Multi-Platform Support",
                  body:
                    "Many Deliveroo riders also work for Uber Eats, Stuart, or other platforms. MileClear tracks all of them with separate tags, so your mileage records stay clean and accurate across every platform you work for.",
                },
                {
                  title: "Self Assessment Export",
                  body:
                    "Pro users can download a PDF mileage log and HMRC self-assessment summary. Every journey is dated, timestamped, and distance-verified. Send it directly to your accountant or attach it to your tax return.",
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

          {/* Typical shift patterns */}
          <section
            aria-labelledby="shift-patterns-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="shift-patterns-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Typical Deliveroo Shift Patterns and Mileage
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Deliveroo delivery patterns vary significantly depending on whether you are riding a bicycle
              or motorbike, whether you are in a city centre or covering suburban areas, and the time of
              day you choose to work. Lunchtime sessions tend to be dense and short-distance, while evening
              sessions - especially Friday and Saturday - often involve higher earnings but also more miles
              between restaurant clusters.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              A motorbike rider working a four-hour dinner shift in a medium-sized UK city might cover 30 to
              50 miles in that session. Over a week of part-time riding, that adds up to 150 to 250 miles
              per week. For a motorbike rider at 24p per mile, 200 weekly miles is £48 per week in deductions
              - around £2,500 per year. That is £500 back from HMRC at a 20% tax rate, purely from mileage.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              For car drivers doing Deliveroo, the distances are often longer and the earnings per mile can
              be different. MileClear&apos;s business insights screen shows you exactly which sessions
              are most efficient based on your actual earnings and mileage data.
            </p>
          </section>

          {/* Multi-platform section */}
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
              Tracking Miles Across Deliveroo and Other Platforms
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              It is very common for UK delivery riders to work across multiple platforms. Running Deliveroo
              alongside Uber Eats, Stuart, or Gophr helps fill quiet periods and maximise earning time.
              From a tax perspective, all of these miles are still business miles - but your records need
              to show which miles belong to which platform.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              MileClear handles this with per-trip platform tagging. Tag a trip as Deliveroo, then the next
              one as Uber Eats, and your mileage records stay accurate. The business insights comparison
              shows your earnings per mile by platform, so you can see objectively which one is performing
              best for your time and fuel costs.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              If you also drive for Uber, see the{" "}
              <a href="/uber-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                Uber mileage tracker guide
              </a>
              . For Amazon Flex, see the{" "}
              <a
                href="/amazon-flex-mileage-tracker"
                style={{ color: "#fbbf24", textDecoration: "underline" }}
              >
                Amazon Flex guide
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
                q: "Does Deliveroo track rider mileage?",
                a: "No. The Deliveroo Rider app records the orders you complete and your earnings, but it does not log the miles you cover between drops, the loops back to busy zones, or the time waiting for orders. HMRC lets you claim every business mile from the moment you go online to the moment you finish, on-order or repositioning. MileClear records the entire ride session automatically - whatever vehicle you use - and produces a Self Assessment-ready mileage log.",
              },
              {
                q: "Can Deliveroo cyclists claim mileage on their tax return?",
                a: "No. HMRC Approved Mileage Allowance Payments only apply to motor vehicles. Cyclists cannot claim per-mile deductions, but they can claim actual costs: bicycle purchase via capital allowances, repairs, safety clothing, and accessories.",
              },
              {
                q: "What mileage rate can Deliveroo motorbike riders claim?",
                a: "24p per mile flat for all business miles. Unlike cars, there is no higher rate for the first 10,000 miles - it is 24p throughout the tax year for motorbikes and mopeds.",
              },
              {
                q: "What mileage rate can Deliveroo car drivers claim?",
                a: "45p per mile for the first 10,000 business miles in a tax year, then 25p per mile after that.",
              },
              {
                q: "Does Deliveroo count as self-employed for tax purposes?",
                a: "Yes. Deliveroo riders are self-employed contractors in the UK and must file a self-assessment tax return. Business mileage is one of the main allowable deductions available to them.",
              },
              {
                q: "What counts as a business mile for Deliveroo?",
                a: "Restaurant to customer, positioning between restaurant zones, and travel to pickup from your previous drop-off location. The ride from your home to the zone where you start taking orders is generally not claimable - that is ordinary commuting.",
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
              More Guides for UK Gig Drivers
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/mileclear-vs-mileiq", label: "MileClear vs MileIQ" },
                { href: "/uber-mileage-tracker", label: "Uber Mileage Tracker" },
                { href: "/amazon-flex-mileage-tracker", label: "Amazon Flex Mileage Tracker" },
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
              Start Tracking Your Deliveroo Miles Today
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
              Download MileClear free on the App Store. HMRC rates applied automatically by vehicle type.
              No credit card required.
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
