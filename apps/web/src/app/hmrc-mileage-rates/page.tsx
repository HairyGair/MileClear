import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";

export const metadata: Metadata = {
  title: "HMRC Mileage Rates (2025-26 & 2026-27)",
  description:
    "The HMRC approved mileage rates for cars and vans, with a worked example based on a real gig worker driving ~18,800 business miles a year. Covers tax years 2025-26 and 2026-27.",
  alternates: {
    canonical: "https://mileclear.com/hmrc-mileage-rates",
  },
  openGraph: {
    title: "HMRC Mileage Rates | MileClear",
    description:
      "The HMRC approved mileage rates for cars and vans, with a worked example showing how a typical gig worker reaches a £6,700 deduction.",
    url: "https://mileclear.com/hmrc-mileage-rates",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HMRC Mileage Rates | MileClear",
    description:
      "The HMRC approved mileage rates for cars and vans, with a worked example for a driver on ~18,800 miles a year.",
    images: ["/branding/og-image.png"],
  },
};

const faqs = [
  {
    q: "What are the HMRC mileage rates for 2025-26 and 2026-27?",
    a: "For cars and vans, HMRC allows 45p per mile for the first 10,000 business miles in a tax year, then 25p per mile for every mile after that. These rates have applied since 2011 and carry through both the 2025-26 and 2026-27 tax years. The 10,000-mile counter resets on 6 April each year.",
  },
  {
    q: "Do the rates cover fuel as well?",
    a: "Yes. The HMRC rate is designed to cover fuel, insurance, servicing, road tax, tyres, and general wear and tear. If you claim the mileage rate, you cannot also claim any of those costs separately. This is the single most common mistake we see drivers make.",
  },
  {
    q: "Do I need to keep fuel receipts if I claim the mileage rate?",
    a: "No. HMRC does not expect fuel receipts when you are claiming the 45p/25p rate. What they do expect is a mileage log: date, start and end address, reason for the trip, and distance. If you drive for gig platforms, a platform tag (Uber, Deliveroo, etc.) counts as reason.",
  },
  {
    q: "What happens when I cross the 10,000 mile threshold?",
    a: "Only miles past 10,000 are paid at 25p. Miles up to and including the 10,000th are still at 45p. So if you drive 12,000 business miles, you get 10,000 × 45p + 2,000 × 25p = £5,000, not 12,000 × 25p.",
  },
  {
    q: "Can I claim actual costs instead of the mileage rate?",
    a: "Yes, but it is usually more work. You would need to keep records of every fuel purchase, service, insurance payment, MOT, and repair, then claim the business-use percentage of each. For most drivers the 45p/25p rate is both simpler and more generous. Once you pick a method for a vehicle, you have to stick with it for as long as you own it.",
  },
  {
    q: "What about tax years before 2025-26?",
    a: "The rates have been 45p/25p for cars and vans since April 2011. So the same figures apply if you are doing a late Self Assessment for an earlier year. Always check HMRC's own guidance for the exact tax year you are filing.",
  },
];

export default function HmrcRatesPage() {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "HMRC Mileage Rates 2025-26 and 2026-27",
    description:
      "The HMRC approved mileage rates for cars and vans, with a worked example based on a real gig worker covering ~18,800 business miles a year.",
    author: { "@type": "Person", name: "Anthony Gair" },
    publisher: {
      "@type": "Organization",
      name: "MileClear",
      logo: {
        "@type": "ImageObject",
        url: "https://mileclear.com/branding/logo-120x120.png",
      },
    },
    datePublished: "2026-04-21",
    dateModified: "2026-04-21",
    mainEntityOfPage: "https://mileclear.com/hmrc-mileage-rates",
    inLanguage: "en-GB",
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <BreadcrumbsJsonLd
        crumbs={[{ name: "HMRC Mileage Rates", path: "/hmrc-mileage-rates" }]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
      <Navbar />

      <main style={{ paddingTop: "68px" }}>
        {/* Hero */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <span className="label">HMRC Reference</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                HMRC Mileage Rates for Cars and Vans
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 620 }}>
                The approved rates that let you claim tax relief on every
                business mile you drive. Covers the 2025-26 and 2026-27 tax
                years. Rates have not changed since 2011.
              </p>
            </div>

            {/* Rates at a glance */}
            <div
              style={{
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--r-lg)",
                padding: "clamp(1.5rem, 3vw, 2rem)",
                marginTop: "2.5rem",
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "var(--text-white)",
                  marginBottom: "1.25rem",
                }}
              >
                The rates at a glance
              </h2>
              <div
                style={{
                  display: "grid",
                  gap: "1rem",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                }}
              >
                <div
                  style={{
                    background: "var(--amber-glow-md)",
                    border: "1px solid rgba(234, 179, 8, 0.25)",
                    borderRadius: "var(--r-md)",
                    padding: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--amber-300)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "0.4rem",
                    }}
                  >
                    First 10,000 miles
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "2.25rem",
                      fontWeight: 700,
                      color: "var(--text-white)",
                      lineHeight: 1,
                      marginBottom: "0.4rem",
                    }}
                  >
                    45p
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                    per business mile, per tax year
                  </div>
                </div>
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--r-md)",
                    padding: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--text-muted)",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "0.4rem",
                    }}
                  >
                    Every mile after 10,000
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "2.25rem",
                      fontWeight: 700,
                      color: "var(--text-white)",
                      lineHeight: 1,
                      marginBottom: "0.4rem",
                    }}
                  >
                    25p
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                    per business mile, same tax year
                  </div>
                </div>
              </div>
              <p
                style={{
                  fontSize: "0.9375rem",
                  color: "var(--text-secondary)",
                  marginTop: "1.25rem",
                  lineHeight: 1.65,
                }}
              >
                The mileage counter resets on 6 April every year. Your first
                10,000 miles of the new tax year are back at 45p from day one.
              </p>
            </div>
          </div>
        </section>

        {/* Worked example */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "2rem" }}>
              <span className="label">Worked Example</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                A real gig worker on 18,800 miles a year
              </h2>
              <p
                style={{
                  fontSize: "1rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.75,
                  marginBottom: "1.25rem",
                }}
              >
                One of our users, working gig platforms like Uber and Deliveroo,
                covered <strong style={{ color: "var(--text-white)" }}>723.8 miles over two weeks</strong>. Annualised,
                that is roughly 18,800 business miles a year. Here is what HMRC
                lets them claim.
              </p>
            </div>

            <div
              style={{
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--r-lg)",
                padding: "clamp(1.5rem, 3vw, 2rem)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.9375rem",
                  color: "var(--text-primary)",
                }}
              >
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.85rem 0", color: "var(--text-secondary)" }}>
                      First 10,000 miles at 45p
                    </td>
                    <td style={{ padding: "0.85rem 0", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--text-white)" }}>
                      £4,500
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.85rem 0", color: "var(--text-secondary)" }}>
                      Remaining 8,800 miles at 25p
                    </td>
                    <td style={{ padding: "0.85rem 0", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--text-white)" }}>
                      £2,200
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "1rem 0 0.35rem", color: "var(--amber-400)", fontWeight: 700, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.12em" }}>
                      Total HMRC deduction
                    </td>
                    <td style={{ padding: "1rem 0 0.35rem", textAlign: "right", fontFamily: "var(--font-display)", fontSize: "1.75rem", fontWeight: 700, color: "var(--amber-400)" }}>
                      £6,700
                    </td>
                  </tr>
                </tbody>
              </table>

              <div
                style={{
                  borderTop: "1px solid var(--border-subtle)",
                  marginTop: "1.5rem",
                  paddingTop: "1.25rem",
                  fontSize: "0.9375rem",
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                }}
              >
                <p style={{ marginBottom: "0.75rem" }}>
                  At a 20% basic rate of income tax, that deduction reduces
                  their tax bill by <strong style={{ color: "var(--text-white)" }}>£1,340</strong>. At
                  40% (higher rate), it is worth <strong style={{ color: "var(--text-white)" }}>£2,680</strong>.
                </p>
                <p>
                  This is money HMRC expects you to claim. You do not get it
                  unless you write the mileage down somewhere they trust.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Who can claim */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">Who Qualifies</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                Who can use the 45p/25p rate
              </h2>
              <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                The rate is for business mileage in a vehicle you own or lease
                personally. Three common situations:
              </p>
            </div>

            <div style={{ display: "grid", gap: "1rem" }}>
              <div
                style={{
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--r-md)",
                  padding: "1.5rem",
                }}
              >
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 600, color: "var(--text-white)", marginBottom: "0.5rem" }}>
                  Sole traders and self-employed drivers
                </h3>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  You claim the 45p/25p rate as an expense on your
                  Self Assessment (SA103 self-employment pages). It comes off
                  your taxable profit before tax and National Insurance are
                  calculated. This includes Uber, Deliveroo, Amazon Flex, Just
                  Eat, Stuart, DPD owner-drivers, mobile hairdressers, trade
                  plumbers, and anyone else working for themselves.
                </p>
              </div>

              <div
                style={{
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--r-md)",
                  padding: "1.5rem",
                }}
              >
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 600, color: "var(--text-white)", marginBottom: "0.5rem" }}>
                  Employees whose employer reimburses below the rate
                </h3>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  If your employer pays you, say, 25p a mile, you can claim the
                  20p gap (up to HMRC&apos;s 45p) as Mileage Allowance Relief
                  via a P87 form or through your Self Assessment if you do one.
                  This is the bit most employees miss. If you drive 5,000 miles
                  a year and your employer pays 25p instead of 45p, you are
                  leaving roughly £200-£400 of tax relief on the table.
                </p>
              </div>

              <div
                style={{
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--r-md)",
                  padding: "1.5rem",
                }}
              >
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 600, color: "var(--text-white)", marginBottom: "0.5rem" }}>
                  Limited company directors using their own car
                </h3>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  Your company pays you 45p/25p as a tax-free mileage expense
                  and records it as a deductible business cost. No benefit-in-kind
                  to worry about, and no P11D entry, as long as you stick to the
                  HMRC rates. If your company provides the car, this page
                  doesn&apos;t apply - you&apos;re into Advisory Fuel Rates territory,
                  which is a different conversation.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Record keeping */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">Record Keeping</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                What HMRC actually expects you to keep
              </h2>
              <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                A mileage log is not optional. HMRC can open an enquiry up to
                six years back, and if you cannot produce a contemporaneous
                record of your business miles, they will disallow the lot.
                Here is the minimum they want to see per trip:
              </p>
            </div>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "grid",
                gap: "0.75rem",
              }}
            >
              {[
                "Date of the journey",
                "Start address or postcode",
                "End address or postcode",
                "Reason for the trip (client name, job reference, platform tag)",
                "Distance in miles (odometer or GPS distance, not estimated)",
              ].map((item) => (
                <li
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--r-md)",
                    padding: "0.85rem 1.25rem",
                    fontSize: "0.9375rem",
                    color: "var(--text-primary)",
                    lineHeight: 1.6,
                  }}
                >
                  <span
                    style={{
                      color: "var(--amber-400)",
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      flexShrink: 0,
                      width: 16,
                    }}
                  >
                    →
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <p
              style={{
                fontSize: "0.9375rem",
                color: "var(--text-muted)",
                lineHeight: 1.7,
                marginTop: "1.25rem",
              }}
            >
              &quot;Contemporaneous&quot; means written down at the time, or
              close to it. A spreadsheet built from memory at the end of the
              tax year is risky. An automatic GPS log on your phone is fine.
            </p>
          </div>
        </section>

        {/* The fuel + mileage trap */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div
              style={{
                background: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "var(--r-lg)",
                padding: "clamp(1.5rem, 3vw, 2rem)",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "#fca5a5",
                  marginBottom: "0.85rem",
                }}
              >
                Watch out
              </div>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, color: "var(--text-white)", marginBottom: "0.85rem", lineHeight: 1.2 }}>
                You cannot claim fuel receipts and the mileage rate
              </h2>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-primary)", lineHeight: 1.7, marginBottom: "0.85rem" }}>
                The 45p/25p rate already includes fuel, insurance, servicing,
                tyres, road tax, and wear and tear. If you claim the mileage
                rate, you cannot also claim any of those costs as separate
                expenses. It feels wrong to throw away a petrol receipt, but
                that is exactly what the rate is designed to replace.
              </p>
              <p style={{ fontSize: "0.9375rem", color: "var(--text-primary)", lineHeight: 1.7 }}>
                Double-claiming fuel is the single most common error we see in
                user imports. If HMRC audits and spots it, they will disallow
                the whole claim, not just the fuel portion.
              </p>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ marginBottom: "2rem" }}>
              <span className="label">FAQ</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
                Common questions about the rates
              </h2>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {faqs.map((faq) => (
                <div key={faq.q}>
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.0625rem",
                      fontWeight: 700,
                      color: "var(--text-white)",
                      marginBottom: "0.625rem",
                      lineHeight: 1.35,
                    }}
                  >
                    {faq.q}
                  </h3>
                  <p
                    style={{
                      fontSize: "0.9375rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.75,
                    }}
                  >
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Related */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div className="divider" style={{ marginBottom: "2.5rem" }} />
            <h2 className="heading" style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", marginBottom: "1rem" }}>
              Next, work out which miles actually count
            </h2>
            <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.75, marginBottom: "1.5rem" }}>
              The rate only applies to business miles. The home-to-first-job
              trip, the school run that bleeds into a job site, the drive to
              a training course - each has its own rule.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
              <a
                href="/what-counts-as-business-mileage"
                style={{
                  background: "var(--amber-400)",
                  color: "var(--bg-deep)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "0.9375rem",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "var(--r-full)",
                  textDecoration: "none",
                }}
              >
                What counts as business mileage →
              </a>
              <a
                href="/business-mileage-guide"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "var(--r-full)",
                  border: "1px solid var(--border-default)",
                  textDecoration: "none",
                }}
              >
                The full business mileage guide
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
