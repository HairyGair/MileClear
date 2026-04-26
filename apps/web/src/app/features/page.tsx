import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore MileClear's full feature set: GPS trip tracking, HMRC mileage calculator, shift and earnings tracking, UK fuel prices, business intelligence, and more. The mileage tracker built for UK drivers.",
  keywords:
    "mileage tracker features UK, GPS trip tracking, HMRC mileage calculator, mileage app UK, gig worker mileage, delivery driver mileage tracker",
  alternates: {
    canonical: "https://mileclear.com/features",
  },
  openGraph: {
    title: "Features | MileClear",
    description:
      "GPS trip tracking, HMRC mileage deductions, shift and earnings tracking, UK fuel prices, and business intelligence - all in one app built for UK drivers.",
    url: "https://mileclear.com/features",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Features | MileClear",
    description:
      "GPS trip tracking, HMRC mileage deductions, shift and earnings tracking, UK fuel prices, and business intelligence - all in one app built for UK drivers.",
    images: ["/branding/og-image.png"],
  },
};

const CHECK_ICON = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CROSS_ICON = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const featuresItemList = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "MileClear Features",
  url: "https://mileclear.com/features",
  description:
    "GPS trip tracking, HMRC mileage deductions, shift and earnings tracking, UK fuel prices, business intelligence, and more.",
  mainEntity: {
    "@type": "ItemList",
    name: "MileClear feature list",
    itemListElement: [
      "Automatic GPS trip recording with background detection",
      "Tax Readiness card with live HMRC tax estimate and weekly set-aside",
      "Anonymous Benchmarking against other UK drivers",
      "HMRC Reconciliation against Digital Platform Reporting figures",
      "MOT and tax expiry reminders + full DVSA MOT history",
      "Activity Heatmap of when you drive and earn most",
      "Shift mode with scorecards and platform tagging",
      "Business insights with earnings per mile, per hour, weekly P&L (Pro)",
      "UK fuel prices from 8,300+ government-mandated stations",
      "Saved locations with geofencing for auto-classification",
      "Self Assessment wizard with HMRC SA103 box mapping (Pro)",
      "PDF mileage log with signed HMRC attestation cover sheet (Pro)",
      "Accountant Portal - read-only dashboard sharing (Pro)",
      "On-device receipt OCR (Pro)",
      "Pickup wait timer with community insights (Pro)",
      "Live Activities on lock screen and Dynamic Island",
      "Offline-first with background tracking",
    ].map((name, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
    })),
  },
};

export default function FeaturesPage() {
  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: "Features", path: "/features" }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(featuresItemList) }}
      />
      <Navbar />

      <main
        style={{
          background: "var(--bg-deep)",
          paddingTop: "calc(68px + clamp(3rem, 6vw, 5rem))",
          paddingBottom: "var(--section-y)",
        }}
      >
        {/* Page Header */}
        <div className="container">
          <div
            style={{
              textAlign: "center",
              marginBottom: "clamp(3rem, 6vw, 5rem)",
              maxWidth: "780px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            <p className="label">Features</p>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "-0.04em",
                color: "var(--text-white)",
                marginBottom: "1.25rem",
              }}
            >
              Every Feature You Need to Track Mileage in the UK
            </h1>
            <p
              style={{
                fontSize: "clamp(1rem, 1.4vw, 1.125rem)",
                color: "var(--text-secondary)",
                lineHeight: 1.75,
                maxWidth: "600px",
                margin: "0 auto",
              }}
            >
              MileClear is built from the ground up for UK drivers. Whether
              you drive for Uber, Deliveroo, Amazon Flex, or just want to
              track your own mileage, every feature is designed to save you
              time and money at tax time.
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="container">
          <div className="divider" style={{ marginBottom: "clamp(3rem, 6vw, 5rem)" }} />
        </div>

        {/* Section 1 — Automatic Trip Recording */}
        <section
          id="gps-tracking"
          style={{
            paddingTop: "clamp(3rem, 6vw, 5rem)",
            paddingBottom: "clamp(3rem, 6vw, 5rem)",
          }}
        >
          <div className="container">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)",
                gap: "clamp(2rem, 5vw, 5rem)",
                alignItems: "start",
              }}
            >
              <div>
                <p className="label">GPS Tracking</p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.025em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Automatic Trip Recording
                </h2>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--amber-400)",
                    fontWeight: 600,
                    marginBottom: "1.5rem",
                  }}
                >
                  Free on all plans
                </p>
              </div>

              <div>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  MileClear detects when you start driving and begins recording
                  your trip automatically in the background. You do not need to
                  remember to press start or stop - the app handles it for you
                  using GPS data from your iPhone. Trips are recorded with
                  full route breadcrumbs so you can replay the exact path you
                  took.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  Drive detection uses significant location changes and speed
                  thresholds to identify when you have started a journey. Once a
                  drive is detected, a notification appears on your lock screen
                  with action buttons - tap "Track Trip" to begin recording from
                  your exact departure point, or "Not Driving" to dismiss it.
                  The app buffers your coordinates from the moment detection
                  fires, so your trip starts from when you actually left, not
                  from when you tapped the button.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1.5rem",
                  }}
                >
                  Live Activities bring your trip data to the iOS lock screen
                  and Dynamic Island. You can see your current distance, speed,
                  and elapsed time at a glance, and end a trip or dismiss a
                  false detection directly from the lock screen widget without
                  opening the app.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  {[
                    "Background GPS tracking",
                    "Full route breadcrumbs",
                    "Drive detection notifications",
                    "Lock screen Live Activities",
                    "Dynamic Island support",
                    "Offline-first - no signal needed",
                    "Smart stop detection",
                    "Manual trip entry for past trips",
                  ].map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span style={{ color: "var(--emerald-400)", flexShrink: 0, marginTop: "1px" }}>
                        {CHECK_ICON}
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="divider" />
        </div>

        {/* Section 2 — HMRC Tax Deductions */}
        <section
          id="hmrc"
          style={{
            background: "var(--bg-secondary)",
            paddingTop: "clamp(3rem, 6vw, 5rem)",
            paddingBottom: "clamp(3rem, 6vw, 5rem)",
          }}
        >
          <div className="container">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)",
                gap: "clamp(2rem, 5vw, 5rem)",
                alignItems: "start",
              }}
            >
              <div>
                <p className="label">Tax</p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.025em",
                    marginBottom: "0.5rem",
                  }}
                >
                  HMRC Tax Deductions
                </h2>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--amber-400)",
                    fontWeight: 600,
                    marginBottom: "1.5rem",
                  }}
                >
                  Free on all plans
                </p>
              </div>

              <div>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  HMRC allows self-employed drivers to claim mileage as a
                  business expense using the approved mileage rates. For cars
                  and vans, that is 45p per mile for the first 10,000 business
                  miles in a tax year, dropping to 25p per mile after that.
                  For motorbikes, the flat rate is 24p per mile. MileClear
                  applies these rates automatically to every business trip you
                  record.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  Your running tax deduction total updates every time you
                  complete a business trip. The dashboard shows your
                  year-to-date deduction in pounds - so you always know
                  exactly how much mileage relief you have built up before
                  your Self Assessment deadline. Deductions are tracked per
                  vehicle and per tax year, so multi-vehicle drivers and
                  drivers who started mid-year get accurate figures.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1.5rem",
                  }}
                >
                  Pro users can export a complete HMRC Self Assessment PDF
                  that includes a dated trip log, distance totals, deduction
                  breakdown per vehicle type, and a ready-to-use summary
                  formatted for the employment expenses section of your tax
                  return. You can also download a CSV of all trips for
                  accountants who prefer to work with spreadsheets.
                  Learn more on the{" "}
                  <a
                    href="/pricing"
                    style={{ color: "var(--amber-400)", textDecoration: "underline" }}
                  >
                    pricing page
                  </a>
                  .
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  {[
                    "45p/mi (first 10,000 miles)",
                    "25p/mi (after 10,000 miles)",
                    "24p/mi for motorbikes",
                    "Automatic per-trip calculation",
                    "Per-vehicle tracking",
                    "Per-tax-year breakdown",
                    "HMRC Self Assessment PDF (Pro)",
                    "CSV export for accountants (Pro)",
                  ].map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span style={{ color: "var(--amber-400)", flexShrink: 0, marginTop: "1px" }}>
                        {CHECK_ICON}
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3 — Shift & Earnings Tracking */}
        <section
          id="shifts"
          style={{
            paddingTop: "clamp(3rem, 6vw, 5rem)",
            paddingBottom: "clamp(3rem, 6vw, 5rem)",
          }}
        >
          <div className="container">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)",
                gap: "clamp(2rem, 5vw, 5rem)",
                alignItems: "start",
              }}
            >
              <div>
                <p className="label">Gig Work</p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.025em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Shift and Earnings Tracking
                </h2>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--amber-400)",
                    fontWeight: 600,
                    marginBottom: "1.5rem",
                  }}
                >
                  Free on all plans
                </p>
              </div>

              <div>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  Gig workers do not just drive trips - they work shifts. Shift
                  mode lets you clock on when you go online on a platform and
                  clock off when you are done. Every trip you record during
                  that shift is automatically grouped together, giving you a
                  shift-level view of your distance, earnings, and efficiency
                  rather than just a disconnected list of trips.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  You can tag each trip or earnings entry to a specific
                  platform - Uber, Deliveroo, Just Eat, Amazon Flex, Stuart,
                  Gophr, DPD, Yodel, Evri, and more. Platform tagging lets you
                  see exactly how much each app is contributing to your income
                  and which platforms are actually worth your time once fuel
                  and vehicle costs are factored in.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1.5rem",
                  }}
                >
                  At the end of every shift, MileClear generates a scorecard
                  showing total distance, total earnings, earnings per mile,
                  and an A to F grade based on how efficient the shift was.
                  Earnings can be added manually or imported from a CSV if your
                  platform lets you download payment history. Need help
                  importing earnings? Visit the{" "}
                  <a
                    href="/support"
                    style={{ color: "var(--amber-400)", textDecoration: "underline" }}
                  >
                    support page
                  </a>
                  .
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  {[
                    "Shift mode (clock on/off)",
                    "Trips grouped by shift",
                    "Shift scorecard with A-F grade",
                    "Platform tagging (10 platforms)",
                    "Manual earnings entry",
                    "CSV earnings import (Pro)",
                    "Pickup wait timer",
                    "Earnings per mile calculation",
                  ].map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span style={{ color: "var(--emerald-400)", flexShrink: 0, marginTop: "1px" }}>
                        {CHECK_ICON}
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="divider" />
        </div>

        {/* Section 4 — Business Intelligence */}
        <section
          id="intelligence"
          style={{
            background: "var(--bg-secondary)",
            paddingTop: "clamp(3rem, 6vw, 5rem)",
            paddingBottom: "clamp(3rem, 6vw, 5rem)",
          }}
        >
          <div className="container">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)",
                gap: "clamp(2rem, 5vw, 5rem)",
                alignItems: "start",
              }}
            >
              <div>
                <p className="label">Analytics</p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.025em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Business Intelligence
                </h2>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--amber-400)",
                    fontWeight: 600,
                    marginBottom: "1.5rem",
                  }}
                >
                  Free on all plans
                </p>
              </div>

              <div>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  Knowing your gross earnings is not enough. MileClear breaks
                  down your performance into metrics that actually matter for
                  running a driving business. The business insights dashboard
                  shows earnings per mile and earnings per hour across all
                  platforms, so you can see whether your rate is improving or
                  declining week over week.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  Golden hours analysis looks at your historical shift data
                  and identifies which days and times you earn most per hour.
                  This helps you make better decisions about when to go online
                  rather than just putting in more hours. The platform
                  comparison view ranks every platform you use by total
                  earnings, earnings per mile, and earnings per hour side by
                  side.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1.5rem",
                  }}
                >
                  The weekly profit and loss summary shows income minus
                  estimated fuel costs, giving you a real picture of what you
                  actually kept after expenses. Shift grades (A through F) are
                  calculated for every shift so you can identify your best and
                  worst performing sessions at a glance. All of this is
                  available in the iOS app and on the{" "}
                  <a
                    href="/dashboard"
                    style={{ color: "var(--amber-400)", textDecoration: "underline" }}
                  >
                    web dashboard
                  </a>
                  .
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  {[
                    "Earnings per mile",
                    "Earnings per hour",
                    "Platform comparison table",
                    "Shift grading (A-F)",
                    "Golden hours analysis",
                    "Weekly profit and loss",
                    "12-week trend charts",
                    "HMRC monthly breakdown",
                  ].map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span style={{ color: "var(--amber-400)", flexShrink: 0, marginTop: "1px" }}>
                        {CHECK_ICON}
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5 — UK Fuel Prices */}
        <section
          id="fuel"
          style={{
            paddingTop: "clamp(3rem, 6vw, 5rem)",
            paddingBottom: "clamp(3rem, 6vw, 5rem)",
          }}
        >
          <div className="container">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)",
                gap: "clamp(2rem, 5vw, 5rem)",
                alignItems: "start",
              }}
            >
              <div>
                <p className="label">Fuel</p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.025em",
                    marginBottom: "0.5rem",
                  }}
                >
                  UK Fuel Prices
                </h2>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--amber-400)",
                    fontWeight: 600,
                    marginBottom: "1.5rem",
                  }}
                >
                  Free on all plans
                </p>
              </div>

              <div>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  From February 2026, the UK government requires fuel retailers
                  to report their pump prices daily. MileClear pulls data from
                  over 8,300 stations across the country - covering Shell, BP,
                  Esso, Tesco, Sainsbury's, Asda, Morrisons, Texaco, Gulf, Jet,
                  and more. The data is sourced from official government feeds
                  and is updated every day.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  The nearby fuel prices view uses your current location to show
                  the closest stations and their petrol and diesel prices, sorted
                  by distance. You can filter by fuel type and retailer. For
                  drivers covering large areas, this can save a meaningful
                  amount over the course of a week by making it easy to spot
                  cheaper stations on your route rather than just stopping at
                  the nearest one.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1.5rem",
                  }}
                >
                  You can also log your own fuel fill-ups to track your real
                  fuel costs over time. Each fuel log records the litres filled,
                  total cost, price per litre, station name, and odometer
                  reading. MileClear uses your fuel logs to calculate your
                  real cost per mile based on your vehicle's actual fuel
                  consumption, which feeds into the weekly P&amp;L and
                  personal driving summaries.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  {[
                    "8,300+ UK stations",
                    "Government-mandated data",
                    "Petrol and diesel prices",
                    "Filter by retailer",
                    "Nearby stations by GPS",
                    "Fuel fill-up logging",
                    "Cost per litre tracking",
                    "Real cost per mile",
                  ].map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span style={{ color: "var(--emerald-400)", flexShrink: 0, marginTop: "1px" }}>
                        {CHECK_ICON}
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="divider" />
        </div>

        {/* Section 6 — Expenses & Tax Estimate */}
        <section
          id="expenses"
          style={{
            background: "var(--bg-secondary)",
            paddingTop: "clamp(3rem, 6vw, 5rem)",
            paddingBottom: "clamp(3rem, 6vw, 5rem)",
          }}
        >
          <div className="container">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)",
                gap: "clamp(2rem, 5vw, 5rem)",
                alignItems: "start",
              }}
            >
              <div>
                <p className="label">Tax Estimate</p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.025em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Expenses and Tax Estimate
                </h2>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--amber-400)",
                    fontWeight: 600,
                    marginBottom: "1.5rem",
                  }}
                >
                  Free on all plans
                </p>
              </div>

              <div>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  For most self-employed drivers using the HMRC mileage
                  allowance method, mileage is the largest deductible
                  business expense. The mileage allowance covers fuel, tyres,
                  servicing, insurance, and depreciation in a single rate,
                  which means you cannot claim those costs separately if you
                  use this method. MileClear tracks your cumulative mileage
                  deduction against your total business income to give you
                  an estimate of your taxable profit.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  Knowing your approximate taxable profit early in the year
                  means you can put aside the right amount for your tax bill
                  rather than being caught short in January. MileClear uses
                  current income tax and National Insurance rates to provide
                  an estimate. This is a guide rather than tax advice - for
                  complex situations, speak to an accountant.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1.5rem",
                  }}
                >
                  The tax dashboard also shows how your deduction is split
                  across different vehicles, which matters if you switch
                  between a car and a motorbike during the year. The 10,000
                  mile threshold for the higher 45p rate is tracked per
                  vehicle type so the transition to 25p is applied correctly.
                  Read more about HMRC rules in our{" "}
                  <a
                    href="/updates"
                    style={{ color: "var(--amber-400)", textDecoration: "underline" }}
                  >
                    driver guides
                  </a>
                  .
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  {[
                    "Mileage deduction tracking",
                    "Taxable profit estimate",
                    "Income tax estimate",
                    "National Insurance estimate",
                    "Per-vehicle breakdown",
                    "10,000 mile threshold tracking",
                    "Tax year summary",
                    "HMRC export (Pro)",
                  ].map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span style={{ color: "var(--emerald-400)", flexShrink: 0, marginTop: "1px" }}>
                        {CHECK_ICON}
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 7 — Gamification */}
        <section
          id="gamification"
          style={{
            paddingTop: "clamp(3rem, 6vw, 5rem)",
            paddingBottom: "clamp(3rem, 6vw, 5rem)",
          }}
        >
          <div className="container">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.5fr)",
                gap: "clamp(2rem, 5vw, 5rem)",
                alignItems: "start",
              }}
            >
              <div>
                <p className="label">Achievements</p>
                <h2
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(1.5rem, 3vw, 2rem)",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1.2,
                    letterSpacing: "-0.025em",
                    marginBottom: "0.5rem",
                  }}
                >
                  Gamification
                </h2>
                <p
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--amber-400)",
                    fontWeight: 600,
                    marginBottom: "1.5rem",
                  }}
                >
                  Free on all plans
                </p>
              </div>

              <div>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  Tracking mileage consistently over months and years is how
                  you build a strong case for your tax return. Gamification
                  helps you stay in the habit. MileClear awards achievements
                  for distance milestones, shift counts, streaks, earnings
                  targets, and more - giving you recognition for the work you
                  are actually putting in.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1rem",
                  }}
                >
                  Driving streaks track how many consecutive days you have
                  recorded at least one trip. Miss a day and the streak resets.
                  Personal records track your longest single trip, your biggest
                  earnings day, your furthest shift, and more. These are updated
                  automatically whenever you break one, and shown prominently
                  on the dashboard so you always know where you stand.
                </p>
                <p
                  style={{
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    lineHeight: 1.8,
                    marginBottom: "1.5rem",
                  }}
                >
                  At the end of each week and month, MileClear generates a
                  recap showing your totals, highlights, and how you compared
                  to the previous period. Recaps include a share card so you
                  can post your stats to Facebook groups and driver communities.
                  Milestone badges unlock at 100, 500, 1,000, 2,500, 5,000,
                  10,000, 25,000, and 50,000 miles.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.75rem",
                  }}
                >
                  {[
                    "43 achievement types",
                    "Driving streaks",
                    "Personal records",
                    "Distance milestones",
                    "Weekly recap",
                    "Monthly recap",
                    "Shareable stats card",
                    "Push reminders to keep streak",
                  ].map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        fontSize: "0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <span style={{ color: "var(--emerald-400)", flexShrink: 0, marginTop: "1px" }}>
                        {CHECK_ICON}
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="container">
          <div className="divider" />
        </div>

        {/* Section 8 — Free vs Pro comparison table */}
        <section
          id="free-vs-pro"
          style={{
            background: "var(--bg-secondary)",
            paddingTop: "clamp(3rem, 6vw, 5rem)",
            paddingBottom: "clamp(3rem, 6vw, 5rem)",
          }}
        >
          <div className="container">
            <div style={{ textAlign: "center", marginBottom: "clamp(2rem, 4vw, 3.5rem)" }}>
              <p className="label">Pricing</p>
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(1.5rem, 3vw, 2rem)",
                  fontWeight: 700,
                  color: "var(--text-white)",
                  lineHeight: 1.2,
                  letterSpacing: "-0.025em",
                  marginBottom: "1rem",
                }}
              >
                Free vs Pro
              </h2>
              <p
                style={{
                  fontSize: "0.9375rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.75,
                  maxWidth: "520px",
                  margin: "0 auto",
                }}
              >
                Most features are free. Pro adds the Self Assessment wizard,
                tax exports, the Accountant Portal, and receipt OCR for{" "}
                <a
                  href="/pricing"
                  style={{ color: "var(--amber-400)", textDecoration: "underline" }}
                >
                  £4.99 per month
                </a>
                .
              </p>
            </div>

            <div
              style={{
                maxWidth: "780px",
                margin: "0 auto",
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--r-lg)",
                overflow: "hidden",
              }}
            >
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 120px 120px",
                  borderBottom: "1px solid var(--border-default)",
                }}
              >
                <div
                  style={{
                    padding: "1rem 1.5rem",
                    fontFamily: "var(--font-display)",
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Feature
                </div>
                <div
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                    fontFamily: "var(--font-display)",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    borderLeft: "1px solid var(--border-default)",
                  }}
                >
                  Free
                </div>
                <div
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                    fontFamily: "var(--font-display)",
                    fontSize: "0.875rem",
                    fontWeight: 700,
                    color: "var(--amber-400)",
                    borderLeft: "1px solid var(--border-default)",
                    background: "var(--amber-glow)",
                  }}
                >
                  Pro
                </div>
              </div>

              {[
                { feature: "GPS trip recording", free: true, pro: true },
                { feature: "Manual trip entry", free: true, pro: true },
                { feature: "Tax Readiness card (live HMRC estimate)", free: true, pro: true },
                { feature: "Anonymous Benchmarking vs other UK drivers", free: true, pro: true },
                { feature: "HMRC Reconciliation (Digital Platform Reporting)", free: true, pro: true },
                { feature: "MOT and tax expiry reminders + DVSA history", free: true, pro: true },
                { feature: "Activity Heatmap (when you drive most)", free: true, pro: true },
                { feature: "Shift mode with scorecards", free: true, pro: true },
                { feature: "HMRC mileage deduction tracking", free: true, pro: true },
                { feature: "Platform tagging (Uber, Deliveroo etc)", free: true, pro: true },
                { feature: "Earnings entry (manual)", free: true, pro: true },
                { feature: "UK fuel prices (8,300+ stations)", free: true, pro: true },
                { feature: "Fuel fill-up logging", free: true, pro: true },
                { feature: "Pickup wait timer (personal)", free: true, pro: true },
                { feature: "Achievements, streaks, recaps", free: true, pro: true },
                { feature: "Vehicle CRUD with DVLA lookup", free: true, pro: true },
                { feature: "First-time Self Assessment guide", free: true, pro: true },
                { feature: "Web dashboard", free: true, pro: true },
                { feature: "Saved locations (home, work, depot)", free: "2 max", pro: "Unlimited" },
                { feature: "Self Assessment wizard (SA103 mapping)", free: false, pro: true },
                { feature: "PDF mileage log with HMRC attestation", free: false, pro: true },
                { feature: "CSV trip export", free: false, pro: true },
                { feature: "Accountant Portal (read-only sharing)", free: false, pro: true },
                { feature: "Receipt scanning (on-device OCR)", free: false, pro: true },
                { feature: "CSV earnings import (gig platforms)", free: false, pro: true },
                { feature: "Business insights (golden hours, P&L)", free: false, pro: true },
                { feature: "Pickup wait community insights", free: false, pro: true },
              ].map((row, i) => (
                <div
                  key={row.feature}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 120px 120px",
                    borderBottom: i < 17 ? "1px solid var(--border-subtle)" : "none",
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                  }}
                >
                  <div
                    style={{
                      padding: "0.875rem 1.5rem",
                      fontSize: "0.875rem",
                      color: "var(--text-secondary)",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {row.feature}
                  </div>
                  <div
                    style={{
                      padding: "0.875rem",
                      textAlign: "center",
                      borderLeft: "1px solid var(--border-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {row.free === true ? (
                      <span style={{ color: "var(--emerald-400)" }}>{CHECK_ICON}</span>
                    ) : row.free === false ? (
                      <span style={{ color: "var(--text-muted)" }}>{CROSS_ICON}</span>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontWeight: 600 }}>
                        {row.free}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      padding: "0.875rem",
                      textAlign: "center",
                      borderLeft: "1px solid var(--border-subtle)",
                      background: "rgba(234,179,8,0.02)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {row.pro === true ? (
                      <span style={{ color: "var(--amber-400)" }}>{CHECK_ICON}</span>
                    ) : row.pro === false ? (
                      <span style={{ color: "var(--text-muted)" }}>{CROSS_ICON}</span>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--amber-400)", fontWeight: 600 }}>
                        {row.pro}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <p
              style={{
                textAlign: "center",
                marginTop: "1.5rem",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
              }}
            >
              Pro is £4.99/month, billed monthly. Cancel any time. Available via the App Store
              on iOS or{" "}
              <a
                href="/pricing"
                style={{ color: "var(--amber-400)", textDecoration: "underline" }}
              >
                view full pricing details
              </a>
              .
            </p>
          </div>
        </section>

        {/* CTA — Download */}
        <section
          style={{
            paddingTop: "clamp(3rem, 6vw, 5rem)",
            paddingBottom: "clamp(3rem, 6vw, 5rem)",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Ambient glow */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: "-200px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "700px",
              height: "400px",
              background: "radial-gradient(ellipse, var(--amber-glow-md) 0%, transparent 60%)",
              pointerEvents: "none",
            }}
          />

          <div className="container" style={{ position: "relative", zIndex: 1 }}>
            <p className="label">Get Started</p>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                fontWeight: 700,
                color: "var(--text-white)",
                lineHeight: 1.15,
                letterSpacing: "-0.035em",
                marginBottom: "1rem",
                maxWidth: "600px",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Start tracking your mileage for free
            </h2>
            <p
              style={{
                fontSize: "clamp(1rem, 1.4vw, 1.0625rem)",
                color: "var(--text-secondary)",
                lineHeight: 1.75,
                maxWidth: "460px",
                margin: "0 auto 2.5rem",
              }}
            >
              Download MileClear on iPhone. No subscription required to get
              started - GPS tracking, HMRC calculations, and gamification
              are all free.
            </p>

            <a
              href="https://apps.apple.com/gb/app/mileclear/id6743601364"
              target="_blank"
              rel="noopener noreferrer"
              className="ea__appstore-link"
              aria-label="Download MileClear on the App Store"
            >
              <img
                src="/branding/app-store-badge.svg"
                alt="Download on the App Store"
                className="ea__appstore-badge"
              />
            </a>

            <p
              style={{
                marginTop: "1.25rem",
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
              }}
            >
              iOS only for now. Have questions?{" "}
              <a
                href="/support"
                style={{ color: "var(--amber-400)", textDecoration: "underline" }}
              >
                Visit support
              </a>{" "}
              or check the{" "}
              <a
                href="/updates"
                style={{ color: "var(--amber-400)", textDecoration: "underline" }}
              >
                latest updates
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
