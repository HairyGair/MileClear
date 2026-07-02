import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

export const metadata: Metadata = {
  title: {
    absolute:
      "Mileage Tracker UK - Free HMRC-Ready App for Self-Employed Drivers | MileClear",
  },
  description:
    "The UK mileage tracker built for HMRC Self Assessment. Auto-track every business mile, generate a tax-year PDF, claim 55p/25p per mile (raised from 45p on 6 April 2026). Free to use, designed for UK drivers.",
  keywords: [
    "mileage tracker uk",
    "mileage tracker",
    "uk mileage tracker app",
    "free mileage tracker uk",
    "best mileage tracker uk",
    "hmrc mileage tracker",
    "business mileage tracker uk",
    "mileage app uk",
  ],
  alternates: {
    canonical: "https://mileclear.com/mileage-tracker-uk",
  },
  openGraph: {
    title: "Mileage Tracker UK - Free HMRC-Ready App",
    description:
      "Auto-track every business mile. HMRC 55p/25p rates built in (raised from 45p on 6 April 2026). Self Assessment-ready PDF. Free.",
    url: "https://mileclear.com/mileage-tracker-uk",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mileage Tracker UK - Free HMRC-Ready App",
    description:
      "Auto-track every business mile. HMRC 55p/25p rates built in (raised from 45p on 6 April 2026). Self Assessment-ready PDF. Free.",
    images: ["/branding/og-image.png"],
  },
};

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Mileage Tracker UK - MileClear",
  url: "https://mileclear.com/mileage-tracker-uk",
  description:
    "MileClear is a UK mileage tracker built for HMRC Self Assessment. Auto-tracks every business mile, applies the AMAP rates, exports a tax-year-ready PDF.",
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Mileage Tracker UK",
        item: "https://mileclear.com/mileage-tracker-uk",
      },
    ],
  },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "MileClear",
  applicationCategory: "BusinessApplication",
  operatingSystem: "iOS",
  description:
    "Free UK mileage tracker app for self-employed drivers, gig workers, and anyone claiming business mileage on HMRC Self Assessment.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "GBP",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    ratingCount: "32",
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is the best mileage tracker UK app for self-employed drivers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The best UK mileage tracker is one built around HMRC's Approved Mileage Allowance Payment (AMAP) rates - 55p per mile for the first 10,000 business miles, 25p after that (the first-tier rate rose from 45p to 55p on 6 April 2026). MileClear automates GPS tracking in the background, applies the correct rate based on your vehicle, and produces a Self Assessment-ready PDF for each tax year (6 April to 5 April).",
      },
    },
    {
      "@type": "Question",
      name: "Is there a free mileage tracker for the UK?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. MileClear is free to download and free to use for the core tracking, classification, vehicle records, fuel logging and HMRC rate calculations - with no monthly drive cap. That last point is what separates MileClear from the US-built alternatives: MileIQ caps the free tier at 40 drives a month, Driversnote at 15. MileClear has no cap and never will. Pro (£4.99/month) unlocks the Self Assessment PDF export, CSV export, business insights, open-banking earnings sync, and a few quality-of-life extras. The deduction is yours either way - Pro just makes filing it painless.",
      },
    },
    {
      "@type": "Question",
      name: "Does HMRC require a mileage log for Self Assessment?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. To claim mileage relief on Self Assessment, HMRC requires a contemporaneous record - one made at or near the time of each journey. The record must show the date, start and end locations, business purpose, and miles driven. MileClear builds exactly this record automatically using background GPS, with the journey route preserved in case HMRC ever query a trip.",
      },
    },
    {
      "@type": "Question",
      name: "How much can I claim in mileage on Self Assessment?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "HMRC's AMAP rates are 55p per mile for the first 10,000 business miles in a tax year, then 25p per mile thereafter for cars and vans (the first-tier rate rose from 45p to 55p on 6 April 2026). Motorbikes are 24p flat. A driver covering 15,000 business miles claims £5,500 (10,000 x 55p) plus £1,250 (5,000 x 25p) = £6,750 off taxable profit. At 20% basic rate that is £1,350 back; at 40% higher rate it is £2,700.",
      },
    },
    {
      "@type": "Question",
      name: "Does MileClear work offline?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. MileClear is offline-first - GPS tracking continues in tunnels, lifts, basements and rural blackspots, with everything stored locally on your phone. Trips sync to the cloud when you have signal. Your records belong to you and remain on your device even if your account is closed.",
      },
    },
    {
      "@type": "Question",
      name: "Can I track multiple vehicles in one app?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Add as many vehicles as you need - HMRC's mileage rates differ by vehicle type (car/van 55p/25p as of 6 April 2026, motorbike 24p flat). MileClear pulls vehicle details direct from the DVLA registration database and applies the correct rate per trip. The free tier allows one vehicle; Pro is unlimited.",
      },
    },
    {
      "@type": "Question",
      name: "How does MileClear compare to MileIQ?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "MileIQ is built primarily for US tax rules and uses a swipe-to-classify UI. MileClear is built UK-first: HMRC AMAP rates, UK tax year (6 April to 5 April), Self Assessment PDF export, and integration with platforms UK drivers actually use (Uber Eats, Deliveroo, Just Eat, Amazon Flex, DPD, Evri). MileClear's free tier is more generous and the Pro tier is roughly half the price of MileIQ Pro.",
      },
    },
  ],
};

export default function MileageTrackerUk() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
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
              Mileage Tracker UK
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
              The Free Mileage Tracker UK Drivers Trust for HMRC Self Assessment
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              MileClear is a UK-built mileage tracker designed around HMRC's AMAP rates and the
              UK tax year. Background GPS captures every business mile, the 55p/25p calculation
              runs in real time (rate rose from 45p to 55p on 6 April 2026), and your Self
              Assessment PDF is ready when you are. Tracking is unlimited and free forever - no
              monthly drive cap like MileIQ's 40-drive limit or Driversnote's 15-trip limit.
              No card needed.
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
                See pricing
              </a>
            </div>
          </header>

          {/* Why UK drivers need this */}
          <section
            aria-labelledby="why-uk-heading"
            style={{ maxWidth: 760, marginBottom: "3.5rem" }}
          >
            <h2
              id="why-uk-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Why UK Drivers Need a UK-Built Mileage Tracker
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              Most mileage trackers on the App Store are American. They use cents per mile, the IRS
              tax year, the Internal Revenue Service's standard mileage rate, and IRS-formatted exports.
              None of that helps you file an HMRC Self Assessment.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" }}>
              MileClear is built UK-first. The Approved Mileage Allowance Payment rates - 55p per mile
              for the first 10,000 business miles (raised from 45p on 6 April 2026), then 25p for
              every mile after - are applied automatically as you drive. Your tax year runs 6 April to 5 April, not 1 January.
              Your export is the SA103 mileage box, with the per-trip detail HMRC asks for in case
              of an enquiry.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>
              Built in the UK, by a self-employed driver, for self-employed drivers, gig workers,
              delivery riders, and anyone in PAYE who does business mileage their employer doesn't reimburse.
            </p>
          </section>

          {/* Features grid */}
          <section
            aria-labelledby="features-heading"
            style={{ marginBottom: "3.5rem" }}
          >
            <h2
              id="features-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.5rem",
              }}
            >
              What a UK Mileage Tracker Should Do
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
                  title: "HMRC AMAP rates built in",
                  body:
                    "55p/25p for cars and vans (raised from 45p on 6 April 2026), 24p flat for motorbikes. The 10,000-mile threshold is applied automatically across the UK tax year.",
                },
                {
                  title: "Automatic GPS tracking",
                  body:
                    "Background tracking starts when you start driving and ends when you stop. No taps per trip. Works whether you remember to open the app or not.",
                },
                {
                  title: "Self Assessment PDF export",
                  body:
                    "One tax year, one PDF. Per-trip detail, totals, HMRC attestation cover sheet. Drop straight onto your SA103 or hand to your accountant.",
                },
                {
                  title: "Business or personal classification",
                  body:
                    "Tap once to classify a trip, set saved locations for one-trip auto-classification, or use Auto-Classify Rules (Pro) to never tap again.",
                },
                {
                  title: "DVLA vehicle lookup",
                  body:
                    "Type your registration, we pull the make, model, fuel type and CO2 from the official DVLA database. Mileage rate auto-applied per vehicle.",
                },
                {
                  title: "UK fuel prices live",
                  body:
                    "8,300+ stations from the government-mandated fuel price database. Find cheaper fuel before your shift, free for every user.",
                },
                {
                  title: "Offline-first",
                  body:
                    "GPS keeps working in tunnels, basements, rural blackspots. Trips stored locally, synced when you have signal. Your data is yours.",
                },
                {
                  title: "MTD ITSA ready",
                  body:
                    "Quarterly submission to HMRC built in for the April 2026 Making Tax Digital deadline. Mileage rolls straight into your quarterly update.",
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

          {/* Who it's for */}
          <section
            aria-labelledby="who-heading"
            style={{ marginBottom: "3.5rem", maxWidth: 760 }}
          >
            <h2
              id="who-heading"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              Who MileClear Is For
            </h2>
            <ul style={{ color: "#94a3b8", lineHeight: 1.8, paddingLeft: "1.25rem" }}>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={{ color: "#e2e8f0" }}>Self-employed sole traders</strong> filing Self
                Assessment who drive for work and want the AMAP deduction without spreadsheets.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={{ color: "#e2e8f0" }}>UK delivery drivers</strong> on Uber Eats, Deliveroo,
                Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr - every platform tagged per trip.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={{ color: "#e2e8f0" }}>Private-hire and taxi drivers</strong> needing a
                contemporaneous mileage log for Self Assessment.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={{ color: "#e2e8f0" }}>Tradespeople</strong> - electricians, plumbers,
                builders, carpenters - claiming AMAP on miles between jobs.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={{ color: "#e2e8f0" }}>PAYE employees</strong> who drive for work and want
                to claim the difference between their employer's mileage rate and HMRC's AMAP (Mileage Allowance Relief).
              </li>
              <li>
                <strong style={{ color: "#e2e8f0" }}>Anyone</strong> who wants a clean mileage record
                without the faff of swipe-cards or manual entry.
              </li>
            </ul>
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
                q: "What is the best mileage tracker UK app for self-employed drivers?",
                a: "The best UK mileage tracker is built around HMRC's AMAP rates and the UK tax year. MileClear automates GPS tracking, applies the 55p/25p calculation in real time (rate rose from 45p to 55p on 6 April 2026), and produces a Self Assessment-ready PDF.",
              },
              {
                q: "Is there a free mileage tracker for the UK?",
                a: "Yes. MileClear is free to download and free for the core tracking, classification, vehicle records, and HMRC rate calculations. Pro (£4.99/mo) unlocks the Self Assessment PDF + CSV export, business insights, and open banking.",
              },
              {
                q: "Does HMRC require a mileage log for Self Assessment?",
                a: "Yes. HMRC requires a contemporaneous record showing date, start, end, business purpose and miles for each trip. MileClear builds this automatically using background GPS.",
              },
              {
                q: "How much can I claim in mileage on Self Assessment?",
                a: "55p per mile for the first 10,000 business miles in a tax year, 25p after that for cars/vans (24p flat for motorbikes); the first-tier rate rose from 45p to 55p on 6 April 2026. 15,000 business miles = £6,750 off taxable profit. Worth £1,350 at basic rate, £2,700 at higher rate.",
              },
              {
                q: "Does MileClear work offline?",
                a: "Yes. Offline-first - GPS tracking continues in tunnels and rural blackspots, stored locally on your phone, synced to the cloud when you have signal.",
              },
              {
                q: "Can I track multiple vehicles?",
                a: "Yes. Free tier allows one vehicle. Pro is unlimited. DVLA lookup auto-fills make/model/fuel/CO2 from your registration plate.",
              },
              {
                q: "How does MileClear compare to MileIQ?",
                a: "MileClear is built UK-first: AMAP rates, 6 April tax year, SA103 export, platform-tagging for UK gig apps. The Pro tier is roughly half the price of MileIQ Pro. See the full comparison.",
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
              More UK Mileage Tracker Resources
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/free-mileage-tracker-uk", label: "Free Mileage Tracker UK" },
                { href: "/self-employed-mileage-tracker", label: "Self-Employed Mileage Tracker" },
                { href: "/hmrc-mileage-rates", label: "HMRC Mileage Rates" },
                { href: "/business-mileage-guide", label: "Business Mileage Guide" },
                { href: "/what-counts-as-business-mileage", label: "What Counts as Business Mileage" },
                { href: "/mileclear-vs-mileiq", label: "vs MileIQ" },
                { href: "/delivery-driver-mileage-tracker", label: "Delivery Drivers" },
                { href: "/employee-mileage-tracker", label: "Employees / PAYE" },
                { href: "/mtd-itsa-software-for-sole-traders", label: "MTD ITSA Software" },
                { href: "/updates", label: "Blog + Guides" },
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
              Start Tracking UK Mileage in Under a Minute
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
              Free on the App Store. No card. HMRC-ready records from your first trip.
            </p>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
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
