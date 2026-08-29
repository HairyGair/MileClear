import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import StoreButtons from "@/components/StoreButtons";

export const metadata: Metadata = {
  title: "Electric Car Mileage Tracker UK - Claim 55p a Mile in Your EV",
  description:
    "Driving an EV for work? You claim the same 55p per mile from HMRC as a petrol car - while charging for pennies. That makes the mileage method especially generous for electric drivers. MileClear tracks it automatically and knows your car is electric.",
  keywords: [
    "electric car mileage tracker",
    "ev mileage tracker uk",
    "electric vehicle mileage claim hmrc",
    "ev business mileage tax",
    "electric car self employed tax uk",
  ],
  alternates: {
    canonical: "https://mileclear.com/ev-mileage-tracker",
  },
  openGraph: {
    title: "Electric Car Mileage Tracker UK - Claim 55p a Mile in Your EV",
    description:
      "HMRC's mileage rate is the same for electric cars as petrol - 55p per mile for the first 10,000 miles. Charge for pennies, claim like a petrol driver. MileClear tracks your EV miles and your real cost per mile automatically.",
    url: "https://mileclear.com/ev-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Electric Car Mileage Tracker UK - Claim 55p a Mile in Your EV",
    description:
      "HMRC's mileage rate is the same for electric cars as petrol - 55p per mile for the first 10,000 miles. Charge for pennies, claim like a petrol driver. MileClear tracks your EV miles automatically.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Electric Car Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/ev-mileage-tracker",
  description:
    "How MileClear helps UK electric vehicle drivers track business miles, claim the HMRC mileage allowance, and understand EV-specific tax relief.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Electric Car Mileage Tracker",
        item: "https://mileclear.com/ev-mileage-tracker",
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
      name: "Can electric car drivers claim mileage from HMRC?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. HMRC's Approved Mileage Allowance Payment (AMAP) rate is the same for electric cars as for petrol and diesel - it is not reduced for EVs. If you are self-employed you claim 55p per mile for the first 10,000 business miles in the tax year and 25p per mile after that (the first-tier rate rose from 45p to 55p on 6 April 2026). Because your actual running cost is far lower - charging an EV can cost a few pence per mile at home - the mileage method is often especially generous for electric drivers.",
      },
    },
    {
      "@type": "Question",
      name: "Do EVs get a lower mileage rate than petrol cars?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. For a personal car used for self-employment or business, the AMAP rate is fuel-agnostic - an electric car claims exactly the same 55p/25p as a petrol or diesel car. The separate, lower Advisory Electricity Rate (AER) only applies to company cars where the employer reimburses charging, not to a personal EV used for business.",
      },
    },
    {
      "@type": "Question",
      name: "What is the best way for a self-employed EV driver to claim - mileage or actual costs?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You have two options and you pick one per vehicle. The simplified mileage method gives you 55p/25p per mile and is usually the most favourable for EVs because your charging costs are so low. The actual-cost method lets you claim the business share of electricity, insurance and servicing, plus capital allowances - and a new, unused electric car qualifies for a 100% First Year Allowance, so you can write off the full purchase price against profit in year one. You cannot mix the two on the same vehicle. See our EV tax relief guide for the detail.",
      },
    },
    {
      "@type": "Question",
      name: "Does MileClear work for electric cars?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. When you add your vehicle you set it as electric and enter its efficiency in miles per kWh. MileClear then tracks your business miles the same way it does for any car, applies the HMRC rates automatically, and works out your real running cost per mile from your home electricity rate. You can also find nearby public chargers from within the app.",
      },
    },
    {
      "@type": "Question",
      name: "Do electric cars pay road tax (VED) in the UK?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, since April 2025. Electric cars registered on or after 1 April 2025 pay the standard rate of Vehicle Excise Duty, and many owners are caught out by the change. It does not affect your mileage claim, but it is a running cost worth budgeting for.",
      },
    },
  ],
};

export default function EvMileageTracker() {
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
              For Electric Car Drivers
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
              The Mileage Tracker Built for UK Electric Car Drivers
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              Here is the part most EV drivers do not realise: HMRC pays the same mileage rate for an
              electric car as for a petrol one. You claim 55p per mile for the first 10,000 business miles
              while charging costs you a few pence per mile at home. That gap is exactly why the mileage
              method is so generous for electric drivers - and MileClear captures every business mile
              automatically, applies the HMRC rate, and knows your car is electric.
            </p>
          </header>

          {/* Why EV drivers should track */}
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
              Why the Mileage Allowance Is a Better Deal in an EV
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              The Approved Mileage Allowance Payment is designed to cover the whole cost of running a car for
              business - fuel, wear, servicing, insurance, depreciation - in a single per-mile figure. It is
              set at 55p per mile for the first 10,000 business miles in the tax year and 25p after that (the
              first-tier rate rose from 45p on 6 April 2026). Crucially, that rate does not change based on
              what your car burns. An electric car claims exactly the same as a diesel.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              But an EV does not have a fuel bill. Charging at home on a typical tariff might cost you around
              6p to 10p per mile - a fraction of what petrol costs. You are claiming a rate built around
              petrol-era running costs while paying electric-era energy costs. Over 20,000 business miles that
              is an £8,000 deduction from your taxable income, worth £1,600 to a basic-rate taxpayer and
              £3,200 at the higher rate - the same as any driver, but you spent far less to earn it.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              As with any claim, HMRC requires a contemporaneous mileage log: a dated record of each journey
              with start, end, purpose and distance. You cannot reconstruct it from memory at year end.
              MileClear creates that record automatically every time you drive.
            </p>
          </section>

          {/* How MileClear works for EV */}
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
              How MileClear Works for Electric Car Drivers
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
                  title: "Knows Your Car Is Electric",
                  body:
                    "When you add your vehicle, set it as electric and enter its efficiency in miles per kWh. MileClear treats it as an EV throughout - the same way it uses MPG for a petrol car.",
                },
                {
                  title: "Real Cost Per Mile",
                  body:
                    "Enter your home electricity rate (or use the live suggested rate) and MileClear works out your true running cost per mile from your miles per kWh. You see what each mile actually costs to drive, not a petrol estimate.",
                },
                {
                  title: "Same HMRC Deduction Engine",
                  body:
                    "Your business miles are tracked automatically by GPS and the 55p/25p AMAP rates are applied in real time - identical to a petrol car, because HMRC's rate is the same. Your running deduction total is always on the dashboard.",
                },
                {
                  title: "Find Nearby Chargers",
                  body:
                    "Need a top-up between jobs? MileClear shows public chargers near you, pulled from live charging-network data, right inside the app.",
                },
                {
                  title: "Automatic Drive Detection",
                  body:
                    "MileClear detects when you start driving and begins tracking automatically. No need to remember to open the app before every trip - you confirm or dismiss with one tap.",
                },
                {
                  title: "Self Assessment Export",
                  body:
                    "With Pro, export a PDF mileage log and HMRC self-assessment summary - every trip dated, classified, and with the deduction calculated. Ready for your tax return or your accountant.",
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

          {/* Two methods / HMRC section */}
          <section
            aria-labelledby="methods-heading"
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
              id="methods-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.375rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.125rem",
              }}
            >
              Two Ways to Claim in an EV - and Which Usually Wins
            </h2>

            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#34d399", marginBottom: "0.5rem" }}>
              1. Simplified mileage (usually best for EVs)
            </h3>
            <p
              style={{
                color: "#94a3b8",
                fontSize: "0.9375rem",
                lineHeight: 1.75,
                marginBottom: "1.25rem",
              }}
            >
              Claim 55p per mile for the first 10,000 business miles and 25p after that. It covers everything -
              energy, insurance, servicing, depreciation - in one figure. Because charging is so cheap, this
              is usually the more favourable option for electric drivers, and it is the simplest to keep
              records for. This is the method MileClear calculates for you automatically.
            </p>

            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#34d399", marginBottom: "0.5rem" }}>
              2. Actual costs plus capital allowances
            </h3>
            <p
              style={{
                color: "#94a3b8",
                fontSize: "0.9375rem",
                lineHeight: 1.75,
                marginBottom: "1.25rem",
              }}
            >
              Claim the business share of your electricity, insurance and servicing, plus capital allowances on
              the car itself. The EV-specific advantage here is the 100% First Year Allowance: a new, unused
              electric car can be written off in full against your profit in the year you buy it. This can win
              for a high-value car bought outright - but you cannot combine it with the mileage method on the
              same vehicle.
            </p>

            <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>
              Not sure which applies to you? Our{" "}
              <a href="/ev-tax-relief" style={{ color: "#fbbf24", textDecoration: "underline" }}>
                EV tax relief guide
              </a>{" "}
              walks through both methods, company-car benefit-in-kind, VAT, road tax and grants in plain
              English.
            </p>
          </section>

          {/* Savings example */}
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
              What the Mileage Claim Is Worth in an EV
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1.5rem" }}>
              Take a self-employed driver covering 20,000 business miles a year in an electric car. The
              mileage deduction is identical to a petrol driver - but look at the gap between what you claim
              and what your energy actually costs.
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
                Example: 20,000 Business Miles Per Year in an EV
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "1rem",
                }}
              >
                {[
                  { label: "First 10,000 miles", value: "£5,500", note: "at 55p/mile" },
                  { label: "Next 10,000 miles", value: "£2,500", note: "at 25p/mile" },
                  { label: "Total deduction", value: "£8,000", note: "from taxable income" },
                  { label: "Home charging cost", value: "~£1,600", note: "at ~8p/mile you actually paid" },
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
              You claim an £8,000 deduction - worth £1,600 in tax at the basic rate, £3,200 at the higher rate
              - while your home charging for those same miles might cost around £1,600 in energy. The mileage
              allowance was built for petrol running costs, and as an EV driver you get to keep the difference.
              The one condition is records: without a mileage log, HMRC can disallow the claim entirely.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear Pro is £4.99 per month or £44.99 per year. Against a saving of £1,600 or more, it pays
              for itself many times over - and the tracker that produces the log is free forever, with no
              monthly drive cap.
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
                q: "Can electric car drivers claim mileage from HMRC?",
                a: "Yes. HMRC's mileage rate is the same for electric cars as for petrol - 55p per mile for the first 10,000 business miles and 25p after (the first-tier rate rose from 45p on 6 April 2026). Because charging is so cheap, the mileage method is often especially generous for EV drivers.",
              },
              {
                q: "Do EVs get a lower mileage rate than petrol cars?",
                a: "No. For a personal car used for business, the AMAP rate is fuel-agnostic - an EV claims the same 55p/25p as a diesel. The separate lower Advisory Electricity Rate only applies to company cars where the employer reimburses charging.",
              },
              {
                q: "Should I claim mileage or actual costs on my electric car?",
                a: "You pick one per vehicle. Simplified mileage (55p/25p) is usually best for EVs because your charging costs are so low. The actual-cost method lets you claim electricity, insurance and servicing plus capital allowances - and a new EV qualifies for a 100% First Year Allowance, which can win for a high-value car bought outright. You cannot mix the two.",
              },
              {
                q: "Does MileClear work for electric cars?",
                a: "Yes. Set your vehicle as electric and enter its miles per kWh. MileClear tracks your business miles, applies the HMRC rates automatically, and works out your real cost per mile from your home electricity rate. You can also find nearby public chargers in the app.",
              },
              {
                q: "Do electric cars pay road tax now?",
                a: "Yes, since April 2025 electric cars pay standard Vehicle Excise Duty. It does not affect your mileage claim, but it is a running cost worth budgeting for. Our EV tax relief guide covers it in full.",
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
              More on EV and Driver Tax
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/ev-tax-relief", label: "EV Tax Relief Guide" },
                { href: "/self-employed-mileage-tracker", label: "Self-Employed Drivers" },
                { href: "/uber-mileage-tracker", label: "Uber Mileage Tracker" },
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
              Start Claiming Your EV Miles Today
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
              Download MileClear free on the App Store. Set your car as electric, and HMRC rates are applied
              automatically. No credit card required.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <StoreButtons align="center" />
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
