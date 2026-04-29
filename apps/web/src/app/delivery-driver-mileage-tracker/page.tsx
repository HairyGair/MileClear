import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: "Delivery Driver Mileage Tracker UK - HMRC-Ready Tax Records",
  description:
    "UK delivery drivers can claim 45p/mile in HMRC mileage relief. MileClear tracks every business mile across Uber Eats, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart and Gophr - one app, every platform, Self Assessment-ready PDF.",
  keywords: [
    "delivery driver mileage tracker",
    "delivery driver mileage tracker uk",
    "gig delivery driver mileage",
    "multi platform mileage tracker uk",
    "self employed delivery driver tax uk",
    "courier mileage tracker uk",
  ],
  alternates: {
    canonical: "https://mileclear.com/delivery-driver-mileage-tracker",
  },
  openGraph: {
    title: "Delivery Driver Mileage Tracker UK - HMRC-Ready Tax Records",
    description:
      "One mileage tracker for every UK delivery platform - Uber Eats, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr. HMRC rates built in, Self Assessment PDF export.",
    url: "https://mileclear.com/delivery-driver-mileage-tracker",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Delivery Driver Mileage Tracker UK - HMRC-Ready Tax Records",
    description:
      "One mileage tracker for every UK delivery platform - Uber Eats, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr. HMRC rates built in, Self Assessment PDF export.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Delivery Driver Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/delivery-driver-mileage-tracker",
  description:
    "How MileClear helps UK delivery drivers across all gig platforms track every business mile, claim HMRC AMAP relief, and export Self Assessment-ready records.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Delivery Driver Mileage Tracker",
        item: "https://mileclear.com/delivery-driver-mileage-tracker",
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
      name: "Do UK delivery drivers need to track mileage for tax?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. UK delivery drivers working through Uber Eats, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr or any other gig platform are self-employed and file Self Assessment. HMRC's Approved Mileage Allowance Payment (AMAP) lets you claim 45p per mile for the first 10,000 business miles per tax year, and 25p per mile after that. You need a contemporaneous mileage log to claim it - none of the gig platforms produce one for you.",
      },
    },
    {
      "@type": "Question",
      name: "Can one mileage tracker handle multiple delivery platforms?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. MileClear tags every trip with the platform you were working for - Uber Eats, Deliveroo, Just Eat, Amazon Flex, Stuart, Gophr, DPD, Evri or your own custom tag. If you stack platforms in a single shift (a Deliveroo run before an Amazon Flex block, for example), each segment is tracked separately. Your Self Assessment export then shows your business miles split by platform if your accountant needs it.",
      },
    },
    {
      "@type": "Question",
      name: "How much can a delivery driver save on tax with mileage tracking?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "A full-time UK delivery driver covering 25,000 business miles per year can claim £8,250 in HMRC mileage relief (10,000 at 45p plus 15,000 at 25p). At a 20% basic-rate tax band that is £1,650 back in your pocket. At 40% it is £3,300. The deduction is on top of any other expenses (fuel beyond the AMAP, insurance, phone bills) and is what most drivers under-claim by miles.",
      },
    },
    {
      "@type": "Question",
      name: "Does Uber Eats / Deliveroo / Just Eat / Amazon Flex track mileage for tax?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. None of the major UK delivery platforms produce a contemporaneous HMRC-acceptable mileage log. They record the orders you delivered and the earnings you took home, but not the actual miles driven in a format you can claim on Self Assessment. That gap is yours to fill - which is exactly why MileClear exists.",
      },
    },
    {
      "@type": "Question",
      name: "What about miles from home to the start of a delivery shift?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Generally the home-to-depot or home-to-pickup-zone commute is treated as ordinary commuting by HMRC and is not claimable. Once you accept your first job and start moving on the platform's behalf, the miles are business. MileClear lets you mark the commute segment as personal so your records accurately reflect what is and is not deductible.",
      },
    },
  ],
};

const PLATFORMS = [
  {
    name: "Uber Eats",
    href: "/uber-mileage-tracker",
    blurb:
      "Order-by-order pickup and drop. Background tracking captures the full route from each restaurant to each customer.",
  },
  {
    name: "Deliveroo",
    href: "/deliveroo-mileage-tracker",
    blurb:
      "Stack orders, batched routes, dead-mile gaps between drops. Every segment tagged automatically.",
  },
  {
    name: "Just Eat",
    href: "/just-eat-mileage-tracker",
    blurb:
      "Hourly-paid Just Eat blocks plus per-order work tracked as a single shift with full mileage.",
  },
  {
    name: "Amazon Flex",
    href: "/amazon-flex-mileage-tracker",
    blurb:
      "Block-based shifts mirror exactly. Depot to last drop, return-to-depot miles, multi-block days.",
  },
  {
    name: "DPD",
    href: "/dpd-mileage-tracker",
    blurb:
      "Owner-driver franchise routes with high daily mileage. End-of-day total ready for your accountant.",
  },
  {
    name: "Evri",
    href: "/evri-mileage-tracker",
    blurb:
      "Self-employed courier mileage logged across every parcel run, no manual entry needed.",
  },
  {
    name: "Stuart",
    href: null,
    blurb:
      "Same-day courier work tagged separately from food-delivery shifts. Multi-platform stacking supported.",
  },
  {
    name: "Gophr",
    href: null,
    blurb:
      "Same-day delivery routes recorded automatically. Records stay yours even if Gophr deactivates your account.",
  },
];

export default function DeliveryDriverMileageTracker() {
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
              For UK Delivery Drivers
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
              Delivery Driver Mileage Tracker - One App, Every UK Platform
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              UK delivery drivers cover serious mileage - and almost all of it is claimable as a Self Assessment expense.
              MileClear tracks every business mile automatically across every UK gig platform, applies the
              HMRC 45p / 25p / 24p rates in real time, and exports a Self Assessment-ready PDF when tax season comes.
              Free to download - Pro features unlock for £4.99 per month.
            </p>
          </header>

          {/* Why it matters */}
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
              Why Every UK Delivery Driver Needs to Track Mileage
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Whether you drive for Uber Eats, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr or
              any combination, you are self-employed in HMRC&apos;s view. That means you file a Self Assessment
              tax return every January, and you are responsible for recording your own business expenses.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Mileage is the single biggest deduction available to you. HMRC&apos;s Approved Mileage Allowance
              Payment (AMAP) lets you claim <strong>45p per mile for the first 10,000 business miles</strong> in
              a tax year, and <strong>25p per mile after that</strong>. Motorbikes claim 24p flat. Bicycles claim
              20p flat. None of the gig platforms calculate or produce this for you.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              For a full-time UK delivery driver doing 25,000 business miles a year, that is <strong>£8,250</strong> off
              your taxable profit. At basic rate (20%) that is £1,650 back. At higher rate (40%) it is £3,300. Most
              drivers under-claim every year because their records do not survive HMRC&apos;s &ldquo;contemporaneous
              record&rdquo; test - or because they do not have records at all.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              MileClear records every drive automatically using GPS in the background. Every time you accept a
              Deliveroo order, complete an Amazon Flex block, or drop off an Evri parcel, the miles are captured,
              tagged to the platform, and ready for your tax return.
            </p>
          </section>

          {/* Platforms grid */}
          <section
            aria-labelledby="platforms-heading"
            style={{ marginBottom: "3.5rem" }}
          >
            <h2
              id="platforms-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.5rem",
              }}
            >
              Every UK Delivery Platform, One Tracker
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.25rem",
              }}
            >
              {PLATFORMS.map(({ name, href, blurb }) => (
                <div
                  key={name}
                  style={{
                    background: "rgba(15,23,42,0.6)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 14,
                    padding: "1.5rem",
                  }}
                >
                  <h3
                    style={{
                      fontSize: "1.0625rem",
                      fontWeight: 700,
                      color: "#fbbf24",
                      marginBottom: "0.625rem",
                    }}
                  >
                    {name}
                  </h3>
                  <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.7, marginBottom: href ? "0.75rem" : 0 }}>
                    {blurb}
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
                      Read the {name} guide -&gt;
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Multi-platform driving */}
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
              Stacking Platforms? MileClear Has You Covered
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Most full-time UK delivery drivers run more than one app. A Deliveroo lunch shift, an Amazon Flex
              afternoon block, a Just Eat evening run. From HMRC&apos;s perspective every business mile is the same -
              they all count toward your AMAP deduction. But your accountant (and you) want to know which platform
              is actually paying best per mile.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              MileClear tags every trip with the platform you were working for at the time. Switch apps mid-day
              and the next trip auto-tags to the new platform. The Business Insights screen then shows you
              earnings per mile and earnings per hour by platform from your own real numbers - not industry averages.
              Over a few weeks you will see exactly which apps are worth your fuel.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              The Self Assessment export rolls everything into one mileage figure for the SA103 form, with a
              per-platform breakdown attached as supporting detail if HMRC ever ask.
            </p>
          </section>

          {/* What gets tracked */}
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
              How MileClear Works for Delivery Drivers
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
                    "Background location detection starts a trip when you start driving and ends it when you stop. No taps, no setup per shift. Works whether you remember to open the app or not.",
                },
                {
                  title: "Platform Tagging",
                  body:
                    "Tag each shift with the app you were working for. Stacking platforms in one day? Each trip auto-tags from your last selection so multi-platform days take seconds to record.",
                },
                {
                  title: "HMRC AMAP Calculation",
                  body:
                    "45p / 25p / 24p rates applied automatically based on your vehicle type, with the 10,000-mile threshold built in. The number on screen is the number for your Self Assessment.",
                },
                {
                  title: "Saved Locations + Geofences",
                  body:
                    "Mark your home, depot, regular pickup zones. MileClear stops auto-detecting trips when you are parked at a saved location, killing the false positives most trackers spam you with.",
                },
                {
                  title: "Live UK Fuel Prices",
                  body:
                    "8,300+ stations from the government-mandated price database. Find cheaper fuel before your shift and save 5p per litre across a working week - free, even on the basic tier.",
                },
                {
                  title: "Self Assessment Exports",
                  body:
                    "Pro tier exports a CSV and PDF mileage log per tax year, plus the HMRC attestation cover sheet that satisfies the contemporaneous-record requirement. Drop it straight onto your SA103.",
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

          {/* Savings */}
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
              Typical Tax Savings for UK Delivery Drivers
            </h2>

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
                Example: 25,000 Business Miles Per Year (Full-Time)
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
              Even a part-time delivery driver doing 12,000 business miles per year has a deduction of £4,900 -
              worth £980 in tax at the basic rate or £1,960 at the higher rate. The question is not whether the
              deduction is worth claiming. It is whether you have the records to claim it. MileClear builds those
              records automatically, every time you drive.
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
                q: "Do UK delivery drivers need to track mileage for tax?",
                a: "Yes. UK delivery drivers working through any gig platform are self-employed and file Self Assessment. HMRC's AMAP relief (45p/25p) is the single largest deduction available - but you need a contemporaneous mileage log to claim it.",
              },
              {
                q: "Can one mileage tracker handle multiple delivery platforms?",
                a: "Yes. MileClear tags every trip with the platform you were working for. Stack a Deliveroo lunch, an Amazon Flex block and a Just Eat evening shift in the same day - each segment is tracked separately and shown by platform in your Self Assessment export.",
              },
              {
                q: "Does Uber Eats / Deliveroo / Just Eat / Amazon Flex track mileage for tax?",
                a: "No. None of the major UK delivery platforms produce a contemporaneous HMRC-acceptable mileage log. They record orders and earnings, not actual miles in tax-friendly format. That gap is yours to fill.",
              },
              {
                q: "What about the commute from home to my first pickup?",
                a: "Generally HMRC treats home-to-first-pickup as ordinary commuting and not claimable. Once you are working on the platform's behalf, the miles are business. MileClear lets you mark commute segments as personal so your records reflect what is actually deductible.",
              },
              {
                q: "How much can a delivery driver save?",
                a: "A driver covering 25,000 business miles per year can claim £8,250 in HMRC mileage relief - £1,650 back at basic rate, £3,300 at higher rate. Even a part-time driver at 12,000 miles claims £4,900.",
              },
              {
                q: "What format does the export use?",
                a: "Pro tier produces a CSV and PDF mileage log per tax year (6 April to 5 April), with the HMRC attestation cover sheet. Drop it straight onto your SA103 or hand it to your accountant.",
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
              Platform-Specific Guides
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/uber-mileage-tracker", label: "Uber" },
                { href: "/deliveroo-mileage-tracker", label: "Deliveroo" },
                { href: "/just-eat-mileage-tracker", label: "Just Eat" },
                { href: "/amazon-flex-mileage-tracker", label: "Amazon Flex" },
                { href: "/dpd-mileage-tracker", label: "DPD" },
                { href: "/evri-mileage-tracker", label: "Evri" },
                { href: "/mileclear-vs-mileiq", label: "vs MileIQ" },
                { href: "/hmrc-mileage-rates", label: "HMRC Rates" },
                { href: "/#features", label: "All Features" },
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
              Start Tracking Every Delivery Mile Today
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
              One mileage tracker, every UK gig platform, HMRC-ready records. Free to download.
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
