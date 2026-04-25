import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Uber Mileage Tracker UK - Reclaim Your Dead Miles in Tax",
  description:
    "Uber only logs paid trips. HMRC lets you claim every on-shift mile - between jobs, repositioning, waiting. 20,000 miles/year = £7,250 off tax. MileClear captures the full shift. See how.",
  keywords: [
    "uber driver mileage tracker",
    "uber mileage log uk",
    "uber driver tax deduction",
    "uber driver hmrc expenses",
    "best mileage app uber uk",
  ],
  alternates: {
    canonical: "https://mileclear.com/uber-mileage-tracker",
  },
  openGraph: {
    title: "Uber Mileage Tracker UK - Reclaim Your Dead Miles in Tax",
    description:
      "Uber misses your dead miles - HMRC doesn't have to. MileClear records the full shift via GPS, applies 45p/25p rates, and exports a Self Assessment-ready PDF in one tap.",
    url: "https://mileclear.com/uber-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Uber Mileage Tracker UK - Reclaim Your Dead Miles in Tax",
    description:
      "Uber misses your dead miles - HMRC doesn't have to. MileClear records the full shift via GPS, applies 45p/25p rates, and exports a Self Assessment-ready PDF in one tap.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Uber Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/uber-mileage-tracker",
  description:
    "How MileClear helps UK Uber drivers track business miles, calculate HMRC deductions, and export Self Assessment reports.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Uber Mileage Tracker",
        item: "https://mileclear.com/uber-mileage-tracker",
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
      name: "Does Uber track mileage for tax purposes?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Not in a way that is useful for HMRC. Uber gives you a record of paid trips - the time on a fare and the distance carrying a passenger - but it does not include the unpaid miles you drive between jobs, repositioning to a busier zone, or while waiting for a request. HMRC lets you claim every business mile from shift start to shift end, paid or unpaid, so the Uber summary alone significantly underreports what you can deduct. MileClear tracks the full shift automatically and produces a Self Assessment-ready mileage log.",
      },
    },
    {
      "@type": "Question",
      name: "What mileage can Uber drivers claim on HMRC?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "UK Uber drivers can claim 45p per mile for the first 10,000 business miles in a tax year, and 25p per mile after that. Business miles include passenger trips, positioning miles (driving to a busier area), and trips between jobs. The commute from home to your first pickup is generally not claimable.",
      },
    },
    {
      "@type": "Question",
      name: "Do I need to log every mile I drive for Uber?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. HMRC requires a contemporaneous mileage log - a record of each journey with the date, start point, end point, purpose, and distance. MileClear records all of this automatically using GPS and stores it in a format suitable for self-assessment.",
      },
    },
    {
      "@type": "Question",
      name: "How much can an Uber driver save with mileage tracking?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "An Uber driver covering 20,000 business miles a year would receive a tax deduction of £7,250 (10,000 x 45p + 10,000 x 25p). At a 20% tax rate, that is a saving of £1,450 per year directly from mileage allowance alone.",
      },
    },
  ],
};

export default function UberMileageTracker() {
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
              For Uber Drivers
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
              The Mileage Tracker Built for UK Uber Drivers
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              Every mile you drive for Uber is a tax deduction waiting to happen. MileClear tracks your
              trips automatically, calculates your HMRC deduction in real time, and gives you an
              export-ready mileage log whenever you need it for self-assessment. Free to download and
              use - no subscription required for the core features.
            </p>
          </header>

          {/* Why Uber drivers need mileage tracking */}
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
              Why Every Uber Driver in the UK Needs a Mileage Log
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              As a self-employed Uber driver, you are responsible for your own tax. Uber does not deduct
              income tax or National Insurance contributions from your earnings - those are your problem to
              calculate and pay via self-assessment. But the good news is that your business mileage is one
              of the biggest deductions available to you, and most drivers significantly under-claim simply
              because they do not have an accurate record.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              HMRC allows you to claim the Approved Mileage Allowance Payment (AMAP) rate for every
              business mile you drive. For a car or van, that is 45p per mile for the first 10,000 business
              miles in the tax year, and 25p per mile for every mile after that. If you drive 20,000
              business miles a year - which is entirely realistic for a full-time Uber driver - that is a
              £7,250 deduction from your taxable income. At 20% income tax, you save £1,450 per year.
              At 40%, you save £2,900.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              But HMRC requires a contemporaneous mileage log. You cannot estimate or reconstruct your
              trips from memory months later. You need a dated, detailed record of each journey - where you
              started, where you ended, the purpose, and the distance. MileClear creates that record
              automatically every time you drive.
            </p>
          </section>

          {/* How MileClear works for Uber */}
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
              How MileClear Works for Uber Drivers
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.25rem",
                marginBottom: "2rem",
              }}
            >
              {[
                {
                  title: "Automatic Drive Detection",
                  body:
                    "MileClear detects when you start driving and begins tracking automatically. You get a notification with the option to confirm the trip or dismiss it. No need to remember to start the app before every pickup.",
                },
                {
                  title: "Shift Mode for Uber Sessions",
                  body:
                    "Start a shift when you go online on Uber. Every trip within that shift is logged automatically. When you go offline, end the shift and get a scorecard: total miles, total earnings, earnings per mile, and earnings per hour.",
                },
                {
                  title: "Uber Platform Tagging",
                  body:
                    "Tag every trip with Uber as the platform. MileClear then separates your Uber miles from any personal driving, and from miles driven for other platforms if you multi-app. Your records stay accurate and separate.",
                },
                {
                  title: "Offline-First Tracking",
                  body:
                    "Trips are saved to your phone first and synced when you have signal. You never lose a trip because you went through a tunnel or drove somewhere with poor coverage.",
                },
                {
                  title: "HMRC Deduction Calculator",
                  body:
                    "Your running deduction total is always visible on the dashboard. MileClear tracks where you are relative to the 10,000-mile threshold and shows exactly how much tax relief you have accumulated.",
                },
                {
                  title: "Self Assessment Export",
                  body:
                    "With Pro, export a PDF mileage log and HMRC self-assessment summary - every trip dated, timestamped, classified, and with the deduction calculated. Ready to attach to your tax return or share with your accountant.",
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

          {/* HMRC Section */}
          <section
            aria-labelledby="hmrc-uber-heading"
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
              id="hmrc-uber-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.125rem",
              }}
            >
              What Uber Drivers Can Claim - and What They Cannot
            </h2>

            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#34d399", marginBottom: "0.5rem" }}>
              Business miles you CAN claim
            </h3>
            <ul
              style={{
                color: "#94a3b8",
                fontSize: "0.9375rem",
                lineHeight: 1.75,
                paddingLeft: "1.25rem",
                marginBottom: "1.25rem",
              }}
            >
              <li>Every passenger trip from pickup to drop-off</li>
              <li>Positioning miles - driving to a busier area to improve your chances of a booking</li>
              <li>Driving between jobs (you accepted a booking and are on your way to collect)</li>
              <li>Returning to your base area after a long-distance fare</li>
            </ul>

            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#ef4444", marginBottom: "0.5rem" }}>
              Miles you CANNOT claim
            </h3>
            <ul
              style={{
                color: "#94a3b8",
                fontSize: "0.9375rem",
                lineHeight: 1.75,
                paddingLeft: "1.25rem",
                marginBottom: "1.25rem",
              }}
            >
              <li>
                The commute from your home to the location where you go online for your first pickup - HMRC
                considers this ordinary commuting, not a business journey
              </li>
              <li>Personal errands completed while the Uber app is offline</li>
              <li>Any trip that is not connected to your self-employment activity</li>
            </ul>

            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              MileClear lets you classify every trip as business or personal, and tag it with Uber as the
              platform. When it comes to self-assessment time, your business mileage is already separated and
              calculated - you are not trying to reconstruct it from a year of memory.
            </p>
          </section>

          {/* Savings calculator */}
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
              How Much Can You Save? A Real Example
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1.5rem" }}>
              Consider a full-time Uber driver working 40 hours a week in a city like Manchester or
              Birmingham. That driver might realistically cover 400 to 500 business miles per week.
              Let&apos;s use a conservative 400 miles per week.
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
                Example: 20,000 Business Miles Per Year
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1rem",
                }}
              >
                {[
                  { label: "First 10,000 miles", value: "£4,500", note: "at 45p/mile" },
                  { label: "Next 10,000 miles", value: "£2,500", note: "at 25p/mile" },
                  { label: "Total deduction", value: "£7,000", note: "from taxable income" },
                  { label: "Tax saved (20% rate)", value: "£1,400", note: "straight back in your pocket" },
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
              That £1,400 is what the mileage deduction is worth to a basic-rate taxpayer driving 20,000
              business miles. Higher-rate taxpayers save £2,800 from the same mileage. This is money that
              belongs to you - but only if you have the records to back up the claim. Without a mileage log,
              HMRC can disallow the entire deduction.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear Pro costs £4.99 per month - £59.88 per year. Against a potential saving of £1,400 or
              more, that is a very straightforward return on investment.
            </p>
          </section>

          {/* Multi-app section */}
          <section
            aria-labelledby="multiapp-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="multiapp-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Multi-App Drivers: Uber, Deliveroo, and More
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Many UK gig drivers do not stick to one platform. Running Uber alongside Deliveroo or Bolt is
              common, especially during quiet periods when one platform is slow. MileClear handles this
              cleanly - you tag each trip or shift with the platform you were working for, and your mileage
              records are separated by platform automatically.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The business insights screen then shows you a side-by-side comparison: earnings per mile, earnings
              per hour, and shift grades for each platform. Most multi-app drivers are surprised to find that
              the platform they spend the most time on is not necessarily the most profitable one per hour.
              Knowing your numbers lets you make smarter decisions about where to spend your time.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              If you also drive for Deliveroo, see the dedicated{" "}
              <a href="/deliveroo-mileage-tracker" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                Deliveroo mileage tracker guide
              </a>
              . For Amazon Flex, see the{" "}
              <a
                href="/amazon-flex-mileage-tracker"
                style={{ color: "#fbbf24", textDecoration: "underline" }}
              >
                Amazon Flex mileage tracker guide
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
                q: "Does Uber track mileage for tax purposes?",
                a: "Not in a way that is useful for HMRC. Uber gives you a record of paid trips - the time on a fare and the distance carrying a passenger - but it does not include the unpaid miles you drive between jobs, repositioning to a busier zone, or while waiting for a request. HMRC lets you claim every business mile from shift start to shift end, paid or unpaid, so the Uber summary alone significantly underreports what you can deduct. MileClear tracks the full shift automatically.",
              },
              {
                q: "What mileage can Uber drivers claim on HMRC?",
                a: "UK Uber drivers can claim 45p per mile for the first 10,000 business miles in a tax year, and 25p per mile after that. Business miles include passenger trips, positioning miles, and driving between jobs. The commute from home to your first pickup is generally not claimable.",
              },
              {
                q: "Do I need to log every mile I drive for Uber?",
                a: "Yes. HMRC requires a contemporaneous mileage log with the date, start and end point, purpose, and distance for each journey. MileClear records all of this automatically using GPS.",
              },
              {
                q: "How much can an Uber driver save with mileage tracking?",
                a: "An Uber driver covering 20,000 business miles a year gets a deduction of £7,000 (10,000 x 45p + 10,000 x 25p). At a 20% tax rate, that is a saving of £1,400 per year from mileage allowance alone.",
              },
              {
                q: "Does Uber report my earnings to HMRC?",
                a: "Uber is required to report driver earnings to HMRC under UK tax rules. That makes accurate expense records - including mileage - even more important. If your mileage deductions are not logged properly, you could end up paying tax on more income than you need to.",
              },
              {
                q: "Can I use MileClear for my Uber accountant?",
                a: "Yes. The Pro export produces a PDF mileage log with every trip dated, timed, and distance-verified, plus a self-assessment summary with your deduction total. Most accountants accept this format directly.",
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
                { href: "/deliveroo-mileage-tracker", label: "Deliveroo Mileage Tracker" },
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
              Start Tracking Your Uber Miles Today
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
              Download MileClear free on the App Store. HMRC rates applied automatically. No
              credit card required.
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
