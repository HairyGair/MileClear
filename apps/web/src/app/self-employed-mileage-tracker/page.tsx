import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: {
    absolute: "Self-Employed Mileage Tracker UK - Sole Trader HMRC App | MileClear",
  },
  description:
    "The mileage tracker built for UK sole traders. Auto-track every business mile, claim 45p/25p AMAP relief on Self Assessment, MTD ITSA ready for April 2026. Free.",
  keywords: [
    "self employed mileage tracker uk",
    "sole trader mileage tracker",
    "self employed mileage app",
    "mileage tracker for self assessment",
    "mtd itsa mileage tracker",
    "self employed mileage uk",
    "sole trader hmrc mileage app",
  ],
  alternates: {
    canonical: "https://mileclear.com/self-employed-mileage-tracker",
  },
  openGraph: {
    title: "Self-Employed Mileage Tracker UK | MileClear",
    description:
      "Built for UK sole traders. AMAP relief on autopilot. MTD ITSA ready. Free.",
    url: "https://mileclear.com/self-employed-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Self-Employed Mileage Tracker UK | MileClear",
    description:
      "Built for UK sole traders. AMAP relief on autopilot. MTD ITSA ready. Free.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Self-Employed Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/self-employed-mileage-tracker",
  description:
    "MileClear is the mileage tracker built for UK sole traders. Auto-tracks every business mile, applies HMRC AMAP rates, exports a Self Assessment-ready PDF, and is ready for MTD ITSA quarterly submissions.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Self-Employed Mileage Tracker",
        item: "https://mileclear.com/self-employed-mileage-tracker",
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
      name: "Do I need to track mileage if I'm self-employed in the UK?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "If you drive any miles for your self-employed work, yes. Mileage is the single largest deduction available to most UK sole traders - HMRC's AMAP relief lets you claim 45p per mile for the first 10,000 business miles in a tax year, then 25p per mile after that. To claim, HMRC requires a contemporaneous record of each business journey - made at or near the time of the trip - showing date, start, end, business purpose, and miles. MileClear builds that record automatically using background GPS.",
      },
    },
    {
      "@type": "Question",
      name: "How does a self-employed mileage tracker work for Self Assessment?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "It tracks every drive automatically using GPS, lets you classify each trip as business or personal, applies the HMRC 45p/25p rates in real time, and produces a Self Assessment-ready summary at tax-year end. The total goes onto your SA103 self-employed page; the per-trip detail backs it up if HMRC ever query. MileClear's Pro tier produces a printable PDF with HMRC attestation cover sheet you can attach to your return or hand to your accountant.",
      },
    },
    {
      "@type": "Question",
      name: "What about MTD ITSA - making tax digital for self-employed?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "From April 2026, UK sole traders with self-employed income above £50,000 must submit quarterly digital updates to HMRC instead of (and on top of) the annual Self Assessment - this is Making Tax Digital for Income Tax (MTD ITSA). The threshold drops to £30,000 in April 2027. MileClear's MTD ITSA module connects to HMRC directly using our developer-hub credentials, pulls your obligations, and lets you submit your quarterly mileage and earnings totals from inside the app. Built in, no extra software needed.",
      },
    },
    {
      "@type": "Question",
      name: "Can I claim home-to-work miles as a sole trader?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Generally no. HMRC treats home-to-regular-workplace as ordinary commuting, which is not claimable. There are exceptions: if you have no fixed workplace (a delivery driver visiting different sites every day, for example) or your home genuinely is your business base, the calculus changes. MileClear lets you classify each trip individually, so you can correctly mark commute segments as personal and business journeys as business. Our 'What Counts as Business Mileage' guide walks through the edge cases.",
      },
    },
    {
      "@type": "Question",
      name: "Is the simplified expenses method or actual cost method better for me?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "For most self-employed UK drivers, the simplified expenses method (AMAP at 45p/25p) is both easier and produces a similar or larger deduction than the actual cost method (where you claim a percentage of vehicle running costs including fuel, insurance, MOT, depreciation). AMAP wraps all of that into one rate. The actual cost method can win out for higher-running-cost vehicles or low-mileage business use - but it requires keeping every receipt and a proportional usage log. MileClear is built around AMAP because it's the right answer 90% of the time.",
      },
    },
    {
      "@type": "Question",
      name: "How much does the average self-employed driver save?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A self-employed driver doing 15,000 business miles per year claims £5,750 in AMAP relief (10,000 at 45p + 5,000 at 25p). At 20% basic rate that is £1,150 off your tax bill; at 40% higher rate it is £2,300. Full-time delivery drivers and tradespeople often clear 25,000+ business miles, which is £8,250 in relief - £1,650 at basic rate or £3,300 at higher rate. Most under-claim because their records don't survive HMRC's contemporaneous-record test.",
      },
    },
  ],
};

export default function SelfEmployedMileageTracker() {
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
              For UK Sole Traders
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
              The Self-Employed Mileage Tracker Built for UK Sole Traders
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              If you're self-employed in the UK and drive for work, you're entitled to claim 45p
              per mile (25p after 10,000 miles) under HMRC's AMAP relief. MileClear records every
              business mile automatically, applies the right rate per vehicle, and produces a
              Self Assessment-ready PDF when tax season comes. MTD ITSA quarterly submission is
              built in for the April 2026 deadline. Free to download.
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
                href="/mtd-itsa-software-for-sole-traders"
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
                Read the MTD ITSA guide
              </a>
            </div>
          </header>

          {/* The deduction */}
          <section
            aria-labelledby="deduction-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="deduction-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              The AMAP Deduction: Worth Claiming, Easy to Lose
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              For most self-employed drivers, mileage is the largest single expense on your Self Assessment.
              HMRC's Approved Mileage Allowance Payment (AMAP) wraps fuel, insurance, MOT, servicing,
              depreciation - everything - into a single per-mile rate:
            </p>
            <ul style={{ color: "#94a3b8", lineHeight: 1.9, paddingLeft: "1.25rem", marginBottom: "1rem" }}>
              <li><strong style={{ color: "#e2e8f0" }}>Cars and vans:</strong> 45p per mile for the first 10,000 business miles, 25p thereafter</li>
              <li><strong style={{ color: "#e2e8f0" }}>Motorbikes:</strong> 24p per mile (flat)</li>
              <li><strong style={{ color: "#e2e8f0" }}>Bicycles:</strong> 20p per mile (flat)</li>
            </ul>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              That's <strong>£5,750 off taxable profit</strong> for 15,000 business miles a year, or
              <strong> £8,250</strong> for 25,000 - worth £1,150-£3,300 in real tax back depending on your
              tax band.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              But HMRC requires a contemporaneous mileage log - one made at or near the time of each
              journey. Spreadsheets reconstructed from memory don't survive an enquiry. That's the gap
              MileClear closes.
            </p>
          </section>

          {/* Who it's for */}
          <section
            aria-labelledby="who-heading"
            style={{ marginBottom: "3.5rem" }}
          >
            <h2
              id="who-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.5rem",
              }}
            >
              Built for Every Kind of Self-Employed Driver
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
                  title: "Gig delivery drivers",
                  body: "Uber Eats, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr - every platform tagged per trip.",
                  href: "/delivery-driver-mileage-tracker",
                },
                {
                  title: "Private hire & taxi",
                  body: "PHV and taxi drivers needing a contemporaneous mileage log for Self Assessment. Job-by-job tagging supported.",
                  href: null,
                },
                {
                  title: "Tradespeople",
                  body: "Electricians, plumbers, builders, decorators, gardeners. Miles between jobs all count. AMAP applied automatically.",
                  href: null,
                },
                {
                  title: "Consultants & contractors",
                  body: "Client-site visits, supplier meetings, conferences. Set saved locations for each client to one-tap classify.",
                  href: null,
                },
                {
                  title: "Driving instructors",
                  body: "Lesson-by-lesson mileage tracking. Saved locations for regular meet-up points speed classification.",
                  href: null,
                },
                {
                  title: "Sales & field reps",
                  body: "Multi-stop days, territory routes, customer visits. Auto-track and the day's miles are ready before you get home.",
                  href: null,
                },
              ].map(({ title, body, href }) => (
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
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: href ? "0.75rem" : 0 }}>
                    {body}
                  </p>
                  {href && (
                    <a
                      href={href}
                      style={{
                        color: "#fbbf24",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        textDecoration: "underline",
                      }}
                    >
                      Read the gig delivery guide -&gt;
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* MTD ITSA */}
          <section
            aria-labelledby="mtd-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="mtd-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              MTD ITSA - Ready for the April 2026 Deadline
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              From <strong style={{ color: "#e2e8f0" }}>6 April 2026</strong>, sole traders with
              self-employed income above £50,000 must submit quarterly digital updates to HMRC
              alongside the annual Self Assessment. The threshold drops to £30,000 from April 2027.
              The first quarterly deadline is <strong style={{ color: "#e2e8f0" }}>7 August 2026</strong>.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              MileClear's MTD ITSA module connects directly to HMRC using our authorised
              developer-hub credentials. Your quarterly mileage and earnings totals submit straight from
              the app - no third-party bridging software needed, no spreadsheet uploads, no extra
              subscription. It's built in.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              See the <a href="/mtd-itsa-software-for-sole-traders" style={{ color: "#fbbf24", textDecoration: "underline" }}>full
              MTD ITSA guide</a> for sole traders.
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
              Self-Employed Mileage FAQ
            </h2>
            {[
              {
                q: "Do I need to track mileage if I'm self-employed in the UK?",
                a: "If you drive any miles for work, yes. AMAP relief at 45p/25p is the single biggest deduction for most UK sole traders. HMRC requires a contemporaneous record - built automatically by MileClear.",
              },
              {
                q: "How does this work for Self Assessment?",
                a: "Track all year, classify trips business or personal, MileClear applies HMRC rates and produces a tax-year summary. Total goes on your SA103; per-trip detail backs it up. Pro produces a printable PDF.",
              },
              {
                q: "What about MTD ITSA?",
                a: "From 6 April 2026, sole traders earning over £50k must submit quarterly digital updates to HMRC. MileClear's MTD ITSA module connects to HMRC directly and submits from inside the app.",
              },
              {
                q: "Can I claim home-to-work miles?",
                a: "Generally no - HMRC treats home-to-regular-workplace as ordinary commuting. Exceptions exist if you have no fixed workplace. Classify each trip individually for the right answer.",
              },
              {
                q: "AMAP or actual cost - which should I use?",
                a: "AMAP wins for most self-employed drivers. It wraps fuel, insurance, MOT, servicing and depreciation into one rate without keeping every receipt. Actual cost can win for low-mileage business use - but requires a much more detailed log.",
              },
              {
                q: "How much can I save?",
                a: "15,000 business miles a year = £5,750 in AMAP relief (worth £1,150-£2,300 in tax). 25,000 business miles = £8,250 (£1,650-£3,300 in tax). Most sole traders under-claim - good records change that.",
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
              More Self-Employed Mileage Resources
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/mileage-tracker-uk", label: "Mileage Tracker UK" },
                { href: "/free-mileage-tracker-uk", label: "Free Tier" },
                { href: "/mtd-itsa-software-for-sole-traders", label: "MTD ITSA" },
                { href: "/hmrc-mileage-rates", label: "HMRC Rates" },
                { href: "/business-mileage-guide", label: "Business Mileage Guide" },
                { href: "/what-counts-as-business-mileage", label: "What Counts" },
                { href: "/delivery-driver-mileage-tracker", label: "Gig Drivers" },
                { href: "/mileclear-vs-mileiq", label: "vs MileIQ" },
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
              Claim Every Mile You're Owed
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, marginBottom: "1.75rem", maxWidth: 520, margin: "0 auto 1.75rem" }}>
              Free to download. HMRC AMAP rates from your first trip. MTD ITSA built in.
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
