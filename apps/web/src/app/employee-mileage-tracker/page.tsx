import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Employee Mileage Tracker UK - Claim Every Work Mile from Your Employer",
  description:
    "Drive your own car for work? Claim every site-to-site mile from your employer, and the gap to HMRC's 45p rate via Mileage Allowance Relief. MileClear tracks every business mile automatically and exports a payroll-ready claim.",
  keywords: [
    "employee mileage tracker uk",
    "mileage tracker for work car",
    "claim mileage from employer uk",
    "mileage allowance relief tracker",
    "site to site mileage uk",
    "personal car for work mileage uk",
    "work mileage claim app",
  ],
  alternates: {
    canonical: "https://mileclear.com/employee-mileage-tracker",
  },
  openGraph: {
    title: "Employee Mileage Tracker UK - Claim Every Work Mile",
    description:
      "Drive your own car for work? MileClear tracks every business mile automatically, calculates what your employer owes you and the HMRC top-up via Mileage Allowance Relief.",
    url: "https://mileclear.com/employee-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Employee Mileage Tracker UK - Claim Every Work Mile",
    description:
      "Drive your own car for work? MileClear tracks every business mile automatically, calculates what your employer owes you and the HMRC top-up via Mileage Allowance Relief.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Employee Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/employee-mileage-tracker",
  description:
    "How MileClear helps UK employees who drive their personal car for work track every business mile, claim back from their employer, and recover the gap up to HMRC's AMAP rate via Mileage Allowance Relief.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Employee Mileage Tracker",
        item: "https://mileclear.com/employee-mileage-tracker",
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
      name: "I'm an employee who drives my own car for work - what can I claim?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Two things. First, you can claim mileage back from your employer at whatever rate they've agreed to pay (typically 25p-45p per mile). Second, if your employer pays less than HMRC's Approved Mileage Allowance Payment (AMAP) rate of 45p per mile (for the first 10,000 business miles in the tax year), you can claim the gap from HMRC directly via Mileage Allowance Relief on your Self Assessment or by writing to HMRC. MileClear records every business mile automatically and shows you both numbers.",
      },
    },
    {
      "@type": "Question",
      name: "What is Mileage Allowance Relief (MAR)?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Mileage Allowance Relief is the HMRC tax relief that lets UK employees recover the gap between what their employer pays per business mile and the official AMAP rate (45p for the first 10,000 miles, 25p above that). For example, if your employer pays 30p per mile and you drive 10,000 business miles, your employer pays you £3,000 - but the HMRC rate would be £4,500. The £1,500 difference is the MAR you can claim. At basic-rate tax (20%) that's £300 back; at higher rate (40%), £600.",
      },
    },
    {
      "@type": "Question",
      name: "Does the journey from home to my main office count?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Generally no. HMRC treats home-to-permanent-workplace as ordinary commuting, which is not claimable. But site-to-site mileage during the working day is. If you drive from home directly to a temporary workplace (a site you're visiting for a specific task lasting less than 24 months) the journey is usually claimable. The rules are nuanced - the full HMRC guidance is in EIM32000 - but MileClear's classification system lets you mark commutes as personal so your records reflect what is and is not deductible.",
      },
    },
    {
      "@type": "Question",
      name: "What records do I need for an employer mileage claim?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most employers want a date, start location, end location, miles, and reason for each business journey, plus the total miles per period (usually monthly). MileClear records all of this automatically using GPS. The Pro export produces a CSV and PDF mileage log per period that drops straight onto a payroll claim form. HMRC require the same data plus contemporaneous record-keeping for any MAR claim, so the same export works for both.",
      },
    },
    {
      "@type": "Question",
      name: "What if I forgot to track my miles for the last few months?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MileClear lets you add manual trips with dates, start and end addresses, and miles. The mileage is still calculated using the same UK road-data engine. The records are flagged as manual entries (so HMRC and your employer can see they're not GPS-tracked), but they are valid as a claim provided the underlying data is accurate. The best fix though is to start auto-tracking now - going forward, every business mile is captured automatically in the background.",
      },
    },
    {
      "@type": "Question",
      name: "Can I claim mileage if my employer provides a company car?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Different rules apply for company cars. The AMAP rates are for personal cars used for business. If you have a company car, you can claim Advisory Fuel Rates (AFR) for business miles where you've paid for the fuel personally. MileClear is built around the personal-car AMAP model and is best suited to employees and self-employed people who use their own vehicle for work.",
      },
    },
  ],
};

const PERSONAS = [
  {
    title: "Site-to-site managers",
    body: "Bus depots, retail stores, branch offices, regional centres - if you're a manager moving between sites in your own car, every mile is a claim.",
  },
  {
    title: "Field sales reps",
    body: "Client visits, prospect meetings, conference travel. Most sales reps under-claim because they forget to log the dead miles between meetings.",
  },
  {
    title: "Visiting healthcare staff",
    body: "Community nurses, district care workers, mental health visiting teams, NHS bank staff travelling between patient homes.",
  },
  {
    title: "Field engineers and technicians",
    body: "Service callouts, equipment installs, repair visits. Multi-stop days where the car is your office.",
  },
  {
    title: "Trainers, assessors and inspectors",
    body: "If your job involves visiting other people's premises - schools, businesses, project sites - MileClear keeps the audit trail.",
  },
  {
    title: "Charity and third-sector workers",
    body: "Branch visits, beneficiary home calls, partner agency meetings. Often paid below AMAP, so MAR top-up matters.",
  },
];

export default function EmployeeMileageTracker() {
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
              For UK Employees
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
              Mileage Tracker for Employees - Claim Every Work Mile
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              If you drive your own car for work - between sites, to clients, to patient visits, to
              regional offices - MileClear tracks every business mile in the background and exports
              a payroll-ready claim. It also calculates the HMRC top-up (Mileage Allowance Relief)
              if your employer pays below 45p/mile. Free to download - Pro features unlock for £4.99
              per month.
            </p>
          </header>

          {/* Two scenarios */}
          <section
            aria-labelledby="two-scenarios-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="two-scenarios-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              The Two Things You Can Claim
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              UK employees who drive their personal vehicle for work have two separate claims, and
              most under-claim because they don&apos;t know about the second one.
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
                  borderRadius: 14,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.75rem" }}
                >
                  1. From your employer
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7 }}>
                  Your contract or expenses policy states a per-mile rate the employer pays. Common
                  rates are 25p, 30p, 40p, or 45p. You submit a claim - usually monthly - and they
                  reimburse you via payroll. MileClear logs every business mile so the claim is
                  defensible.
                </p>
              </div>
              <div
                style={{
                  background: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.15)",
                  borderRadius: 14,
                  padding: "1.5rem",
                }}
              >
                <h3
                  style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.75rem" }}
                >
                  2. From HMRC (the gap)
                </h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7 }}>
                  HMRC&apos;s official rate (AMAP) is 45p per mile for the first 10,000 business
                  miles. If your employer pays less, you can claim the difference - <strong>Mileage
                  Allowance Relief</strong> - back as tax relief. Most employees never claim this
                  because they don&apos;t track the underlying miles.
                </p>
              </div>
            </div>
          </section>

          {/* Worked example */}
          <section
            aria-labelledby="worked-example-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="worked-example-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Worked Example: Manager Driving Site to Site
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1.5rem" }}>
              A regional manager covers 12,000 business miles a year, visiting sites in their
              personal car. Their employer pays 30p per mile. They&apos;re a basic-rate (20%) taxpayer.
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
                12,000 business miles per year @ 30p employer rate
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "1rem",
                }}
              >
                {[
                  { label: "From employer", value: "£3,600", note: "12,000 × 30p" },
                  { label: "MAR (HMRC top-up)", value: "£300", note: "(45p - 30p) × 10,000 × 20%" },
                  { label: "Combined per year", value: "£3,900", note: "into your bank account" },
                  { label: "If higher-rate (40%)", value: "£4,200", note: "MAR doubles to £600" },
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
              The £300 MAR is what most employees miss. It&apos;s a small annual amount on its own,
              but compounds every year you claim it - and over a 10-year career it&apos;s £3,000+
              that would otherwise stay with HMRC.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear records the underlying miles automatically. Your employer claim and your MAR
              claim both run off the same dataset.
            </p>
          </section>

          {/* Personas */}
          <section
            aria-labelledby="personas-heading"
            style={{ marginBottom: "3.5rem" }}
          >
            <h2
              id="personas-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.5rem",
              }}
            >
              Who This Is For
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.25rem",
              }}
            >
              {PERSONAS.map(({ title, body }) => (
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

          {/* How MileClear handles it */}
          <section
            aria-labelledby="how-it-works-heading"
            style={{ marginBottom: "3.5rem" }}
          >
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
              How MileClear Fits Your Working Day
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
                  title: "Automatic GPS Tracking",
                  body:
                    "Drive starts, MileClear starts. No taps, no per-trip setup. Sit-to-site miles, client visits, regional travel - all captured in the background.",
                },
                {
                  title: "Mark Commutes as Personal",
                  body:
                    "Set your home and office as saved locations. The home-to-office leg auto-tags as personal so it stays out of your claim. Every other mile is fair game.",
                },
                {
                  title: "Set Your Employer Rate",
                  body:
                    "Profile > Work Settings > enter the per-mile rate your employer pays (25p / 30p / 45p, whatever it is). MileClear shows you both 'owed by employer' and 'MAR claimable' figures in real time.",
                },
                {
                  title: "Monthly Payroll Export",
                  body:
                    "Pro tier: CSV and PDF mileage log per claim period, with dates, start/end addresses, miles and totals. Drops straight onto your employer's mileage claim form or expenses portal.",
                },
                {
                  title: "Self Assessment for the MAR Claim",
                  body:
                    "If you do a Self Assessment return, MileClear's HMRC export shows the AMAP-equivalent total alongside what your employer paid - the gap is your MAR claim figure.",
                },
                {
                  title: "Site Tagging and Notes",
                  body:
                    "Tag trips with the site, client name, or work purpose. The audit trail makes a queried claim easy to defend, and lets you analyse where your time actually goes.",
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
                q: "I'm an employee who drives my own car for work - what can I claim?",
                a: "Two things. First, the per-mile rate your employer agreed to pay. Second, if that rate is below HMRC's 45p/mi (for the first 10,000 business miles), you can claim the gap from HMRC as Mileage Allowance Relief on your Self Assessment or via writing to HMRC.",
              },
              {
                q: "What is Mileage Allowance Relief (MAR)?",
                a: "The HMRC tax relief that recovers the gap between what your employer pays per business mile and the official AMAP rate. If you do 10,000 miles at 30p employer rate, your employer pays £3,000 - HMRC's rate would be £4,500. The £1,500 gap is MAR. At basic rate that's £300 back; at higher rate, £600.",
              },
              {
                q: "Does the journey from home to my main office count?",
                a: "Usually no - HMRC treats home-to-permanent-workplace as ordinary commuting. But site-to-site miles during the day, or home directly to a temporary site (one you visit for under 24 months), are typically claimable. MileClear lets you mark commutes as personal so your records reflect what is and isn't deductible.",
              },
              {
                q: "What records do I need for an employer mileage claim?",
                a: "Most employers want date, start location, end location, miles, and reason for each business journey, plus the total per period. MileClear records all of this automatically. The Pro export produces a CSV and PDF that drops straight onto a payroll claim form.",
              },
              {
                q: "What if I forgot to track my miles for the last few months?",
                a: "MileClear supports manual trip entry with dates, addresses, and miles. They're flagged as manual entries (so HMRC and employers can see they're not GPS-tracked) but valid as a claim if the underlying data is accurate. Going forward, auto-tracking captures every business mile without you doing anything.",
              },
              {
                q: "Can I claim mileage if my employer provides a company car?",
                a: "Different rules. Company cars use Advisory Fuel Rates (AFR), not AMAP. MileClear is built around the personal-car-for-business model and is best suited to employees and self-employed people using their own vehicle for work miles.",
              },
              {
                q: "What does Pro cost and what do I actually need it for?",
                a: "Pro is £4.99/month. You need it for the export side - CSV and PDF claim files for your employer or HMRC. Daily mileage tracking, classification, employer-rate calculations and the dashboard summaries are all free. Most users only need Pro at month-end (for employer claims) or once a year (for the MAR / Self Assessment claim).",
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
              More Mileage Guides
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/hmrc-mileage-rates", label: "HMRC Mileage Rates" },
                { href: "/what-counts-as-business-mileage", label: "What Counts as Business Mileage" },
                { href: "/mileclear-vs-mileiq", label: "MileClear vs MileIQ" },
                { href: "/delivery-driver-mileage-tracker", label: "For Delivery Drivers" },
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
              Stop Under-Claiming Work Mileage
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
              Free to download. Automatic GPS tracking, employer-rate calculator, and HMRC-ready
              records built in.
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
