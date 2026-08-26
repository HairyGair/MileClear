import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import { HMRC_THRESHOLD_MILES, getHmrcRatesForTaxYear } from "@mileclear/shared";

export const metadata: Metadata = {
  title: "Approved Mileage Allowance Payments (AMAP): Full UK Guide",
  description:
    "What AMAP is, the 55p/25p rates for 2026-27 (45p/25p for 2025-26), the 10,000-mile threshold, tax-free limits, passenger payments, and how to claim Mileage Allowance Relief if your employer pays less.",
  alternates: {
    canonical: "https://mileclear.com/approved-mileage-allowance-payments",
  },
  openGraph: {
    title: "Approved Mileage Allowance Payments (AMAP) | MileClear",
    description:
      "AMAP explained in full: current rates, the 10,000-mile threshold, tax-free limits, and Mileage Allowance Relief when your employer pays less than HMRC's rate.",
    url: "https://mileclear.com/approved-mileage-allowance-payments",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Approved Mileage Allowance Payments (AMAP) | MileClear",
    description:
      "AMAP explained in full: rates, thresholds, tax-free limits, and Mileage Allowance Relief.",
    images: ["/branding/og-image.png"],
  },
};

const currentYear = "2026-27" as const;
const priorYear = "2025-26" as const;
const currentRates = getHmrcRatesForTaxYear(currentYear);
const priorRates = getHmrcRatesForTaxYear(priorYear);

const card = {
  background: "var(--bg-card-solid)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--r-lg)",
  padding: "clamp(1.5rem, 3vw, 2rem)",
} as const;

const h2Style = {
  fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
  marginBottom: "1rem",
} as const;

const bodyText = {
  fontSize: "1rem",
  color: "var(--text-secondary)",
  lineHeight: 1.75,
} as const;

const faqs = [
  {
    q: "What does AMAP stand for?",
    a: "Approved Mileage Allowance Payments. It is HMRC's scheme for paying employees tax-free for using their own vehicle on business journeys, and it also sets the rate self-employed people use under the similar ‘simplified expenses’ mileage method.",
  },
  {
    q: "Is the approved mileage rate the same as fuel cost?",
    a: "No. The rate is designed to cover fuel plus insurance, servicing, road tax, tyres, depreciation and general wear and tear as one combined figure. It is not a fuel-only reimbursement, which is why it is higher than a pure fuel cost per mile.",
  },
  {
    q: "Does my employer have to pay 55p a mile?",
    a: "No. There is no legal requirement for an employer to pay any particular mileage rate, or to reimburse mileage at all, unless it is written into your contract or a company policy. AMAP only sets the amount that can be paid tax-free. Many employers pay less, in which case you can claim Mileage Allowance Relief on the shortfall.",
  },
  {
    q: "Does the 10,000-mile threshold reset every year?",
    a: "Yes. It runs for one UK tax year at a time, 6 April to 5 April, and resets on 6 April regardless of how many miles you drove the year before. If you have more than one employer paying you mileage in the same tax year, ask your accountant or HMRC how the threshold applies across both, since your circumstances there can vary.",
  },
  {
    q: "Can I claim AMAP if my employer provides the car?",
    a: "No. AMAP is only for a vehicle you own or lease personally. If your employer provides the car, fuel reimbursement is handled through HMRC's Advisory Fuel Rates instead, which is a separate scheme with its own figures.",
  },
] as const;

export default function ApprovedMileageAllowancePaymentsPage() {
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
        crumbs={[
          {
            name: "Approved Mileage Allowance Payments",
            path: "/approved-mileage-allowance-payments",
          },
        ]}
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
              <span className="label">HMRC Scheme</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                Approved Mileage Allowance Payments (AMAP)
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 660 }}>
                AMAP is the HMRC scheme that lets employees be paid tax-free
                for driving their own car, van or motorbike on business
                journeys, up to a set rate per mile. This page covers what it
                is, the current rates, the 10,000-mile threshold, and what
                happens when your employer pays more or less than the
                approved amount.
              </p>
            </div>
          </div>
        </section>

        {/* What is AMAP */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={card}>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  color: "var(--amber-400)",
                  marginBottom: "0.85rem",
                }}
              >
                What it actually is
              </div>
              <p style={{ ...bodyText, marginBottom: "0.85rem", color: "var(--text-primary)" }}>
                AMAP is not a payment HMRC makes to you. It is a ceiling on
                how much your employer can pay you per business mile
                <strong style={{ color: "var(--text-white)" }}> without it counting as taxable income</strong>.
                Pay at or below the AMAP rate and the whole amount is free of
                income tax and National Insurance for both of you. Pay above
                it and the excess is treated as earnings.
              </p>
              <p style={{ ...bodyText, color: "var(--text-primary)" }}>
                Self-employed sole traders do not technically use AMAP (which
                is an employee scheme), but HMRC&apos;s &ldquo;simplified
                expenses&rdquo; mileage method for the self-employed uses the
                identical rates and the identical 10,000-mile threshold, so
                everything on this page applies to a self-employed driver
                claiming through Self Assessment too.
              </p>
            </div>
          </div>
        </section>

        {/* Rates */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">Current Rates</span>
              <h2 className="heading" style={h2Style}>
                The AMAP rates for {currentYear} and {priorYear}
              </h2>
              <p style={bodyText}>
                The cars-and-vans first-tier rate rose from 45p to 55p on 6
                April 2026. Motorbikes are unchanged. Bicycles stay at a flat
                20p per mile (not tracked by MileClear, but included here for
                completeness).
              </p>
            </div>

            <div style={{ ...card, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9375rem", minWidth: 480 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                    <th style={{ textAlign: "left", padding: "0.6rem 0.5rem", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.8125rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Vehicle
                    </th>
                    <th style={{ textAlign: "right", padding: "0.6rem 0.5rem", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.8125rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      First {HMRC_THRESHOLD_MILES.toLocaleString("en-GB")} miles
                    </th>
                    <th style={{ textAlign: "right", padding: "0.6rem 0.5rem", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.8125rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      After that
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-primary)" }}>
                      Cars and vans ({currentYear})
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--amber-400)" }}>
                      {currentRates.car.first10000}p
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--text-white)" }}>
                      {currentRates.car.after10000}p
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-secondary)" }}>
                      Cars and vans ({priorYear} and earlier, back to 2011)
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--text-secondary)" }}>
                      {priorRates.car.first10000}p
                    </td>
                    <td style={{ padding: "0.75rem 0.5rem", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--text-secondary)" }}>
                      {priorRates.car.after10000}p
                    </td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-primary)" }}>
                      Motorbikes (all years, flat rate)
                    </td>
                    <td colSpan={2} style={{ padding: "0.75rem 0.5rem", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--text-white)" }}>
                      {currentRates.motorbike.flat}p every mile
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: "0.75rem 0.5rem", color: "var(--text-primary)" }}>
                      Bicycles (all years, flat rate)
                    </td>
                    <td colSpan={2} style={{ padding: "0.75rem 0.5rem", textAlign: "right", fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--text-white)" }}>
                      20p every mile
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p style={{ ...bodyText, marginTop: "1rem", fontSize: "0.9375rem", color: "var(--text-muted)" }}>
              Want the full worked example and a calculator? See our{" "}
              <a href="/hmrc-mileage-rates" style={{ color: "var(--amber-400)" }}>
                HMRC mileage rates page
              </a>{" "}
              or use the{" "}
              <a href="/mileage-calculator" style={{ color: "var(--amber-400)" }}>
                mileage calculator
              </a>{" "}
              to work out your own deduction.
            </p>
          </div>
        </section>

        {/* Threshold */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">Threshold</span>
              <h2 className="heading" style={h2Style}>
                The {HMRC_THRESHOLD_MILES.toLocaleString("en-GB")}-mile
                threshold is per tax year
              </h2>
            </div>
            <div style={{ ...card }}>
              <p style={{ ...bodyText, marginBottom: "0.85rem" }}>
                The higher rate applies to your first{" "}
                {HMRC_THRESHOLD_MILES.toLocaleString("en-GB")} business miles
                in a UK tax year (6 April to 5 April), not a calendar year and
                not a rolling 12 months. Every mile after that in the same tax
                year drops to the lower rate. On 6 April, the counter goes
                back to zero, whatever your total was the year before.
              </p>
              <p style={bodyText}>
                For an employee with a single employer this is straightforward:
                your employer, or their payroll software, tracks the running
                total for you. If you have more than one employer paying
                mileage in the same tax year, or you are both employed and
                self-employed and driving for both, how the threshold applies
                can depend on your specific arrangement. That is a case worth
                checking with an accountant or HMRC directly rather than
                assuming.
              </p>
            </div>
          </div>
        </section>

        {/* Tax-free / taxable */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">Tax Treatment</span>
              <h2 className="heading" style={h2Style}>
                Tax-free up to the approved amount, taxable above it
              </h2>
            </div>
            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <div style={{
                background: "rgba(16, 185, 129, 0.04)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "var(--r-md)",
                padding: "1.5rem",
              }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-white)", marginBottom: "0.5rem" }}>
                  Pay at or below the rate
                </h3>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  No income tax, no National Insurance, on either side. It
                  does not need to go through payroll as a benefit and does
                  not need reporting on a P11D.
                </p>
              </div>
              <div style={{
                background: "rgba(239, 68, 68, 0.04)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: "var(--r-md)",
                padding: "1.5rem",
              }}>
                <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-white)", marginBottom: "0.5rem" }}>
                  Pay above the rate
                </h3>
                <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
                  The excess over the approved amount is treated as taxable
                  earnings. It should go through payroll (or be reported on a
                  P11D) and is subject to income tax and Class 1 National
                  Insurance in the normal way.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Employer pays less: MAR */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">If You Are Underpaid</span>
              <h2 className="heading" style={h2Style}>
                When your employer pays less: Mileage Allowance Relief
              </h2>
            </div>
            <div style={card}>
              <p style={{ ...bodyText, marginBottom: "0.85rem", color: "var(--text-primary)" }}>
                If your employer pays you less than the approved rate per
                mile, or nothing at all, you can claim tax relief on the
                shortfall. This is called Mileage Allowance Relief (MAR).
                Work out the gap between what you were actually paid and what
                AMAP would allow, and you get tax relief on that difference,
                not a pound-for-pound refund of it.
              </p>
              <p style={{ ...bodyText, marginBottom: "0.85rem" }}>
                Worked example: your employer pays 30p a mile and you drive
                10,000 business miles in {currentYear}. They pay you £3,000.
                AMAP would allow £5,500. The £2,500 gap is what MAR is
                calculated on. At basic-rate tax (20%) that is worth £500
                back to you; at higher rate (40%), £1,000.
              </p>
              <p style={bodyText}>
                You claim MAR through a P87 form, through your Self Assessment
                return if you already file one, or by writing to HMRC
                directly if neither applies. You will need your mileage
                records (see below) and a note of what your employer actually
                paid you, since the claim is the gap between the two figures,
                not your total mileage.
              </p>
            </div>
          </div>
        </section>

        {/* Passenger payments */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">Passenger Payments</span>
              <h2 className="heading" style={h2Style}>
                Carrying a colleague adds 5p a mile, tax-free
              </h2>
            </div>
            <div style={card}>
              <p style={{ ...bodyText, marginBottom: "0.85rem", color: "var(--text-primary)" }}>
                On top of the standard AMAP rate, an employer can pay a driver
                an extra 5p per mile for each passenger who is also making
                the same business journey for work, and that payment is
                tax-free too. It stacks with the main rate, so a driver on
                55p a mile with two colleagues in the car could be paid 65p
                a mile tax-free for that journey.
              </p>
              <p style={bodyText}>
                This allowance is for the driver only. A passenger who
                happens to also be an employee cannot separately claim
                anything for being driven, and the 5p rate is not affected by
                the driver crossing the {HMRC_THRESHOLD_MILES.toLocaleString("en-GB")}-mile threshold, since it runs
                on its own flat rate regardless of total mileage.
              </p>
            </div>
          </div>
        </section>

        {/* Record keeping */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">Record Keeping</span>
              <h2 className="heading" style={h2Style}>
                What HMRC expects you to keep
              </h2>
              <p style={bodyText}>
                Whether you are an employer paying AMAP, an employee claiming
                MAR, or a self-employed driver using simplified expenses,
                HMRC can ask to see a contemporaneous mileage log going back
                up to six years. For each business trip, the minimum is:
              </p>
            </div>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
              {[
                "Date of the journey",
                "Start and end address or postcode",
                "Purpose of the trip (client name, job reference, or similar)",
                "Distance in business miles",
                "Which vehicle was used, if you use more than one",
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
                  <span style={{ color: "var(--amber-400)", fontFamily: "var(--font-display)", fontWeight: 700, flexShrink: 0, width: 16 }}>
                    →
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <p style={{ ...bodyText, marginTop: "1.25rem", fontSize: "0.9375rem", color: "var(--text-muted)" }}>
              A blank form to fill in by hand is on our{" "}
              <a href="/mileage-claim-form-template" style={{ color: "var(--amber-400)" }}>
                mileage claim form template
              </a>{" "}
              page, printable or copy-pasteable into a spreadsheet.
            </p>
          </div>
        </section>

        {/* FAQs */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ marginBottom: "2rem" }}>
              <span className="label">FAQ</span>
              <h2 className="heading" style={h2Style}>
                Common questions about AMAP
              </h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              {faqs.map((faq) => (
                <div key={faq.q}>
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-white)", marginBottom: "0.625rem", lineHeight: 1.35 }}>
                    {faq.q}
                  </h3>
                  <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* This is general information, not tax advice */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.7 }}>
              This page is general information based on current HMRC
              guidance, not tax advice. Rates, thresholds and reliefs can
              change, and your own circumstances (multiple employers, company
              cars, mixed employed/self-employed work) can change how the
              rules apply to you. Check gov.uk or speak to an accountant for
              anything that depends on your specific situation.
            </p>
          </div>
        </section>

        {/* MileClear / Milesheet mention */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div
              style={{
                background: "var(--amber-glow)",
                border: "1px solid rgba(234, 179, 8, 0.25)",
                borderRadius: "var(--r-lg)",
                padding: "clamp(1.5rem, 3vw, 2rem)",
              }}
            >
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75, marginBottom: "0.85rem" }}>
                MileClear records every business journey automatically with
                GPS, tags the rate that applies for the tax year, and keeps
                the contemporaneous log HMRC expects, so none of this has to
                be reconstructed from memory at year end.
              </p>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75 }}>
                For employers, <strong style={{ color: "var(--text-white)" }}>Milesheet</strong> is
                the part of MileClear where a company approves its staff&apos;s
                mileage claims each month and exports one file at HMRC
                approved rates, ready for payroll.{" "}
                <a href="/milesheet" style={{ color: "var(--amber-400)" }}>
                  See how Milesheet works
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Related */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div className="divider" style={{ marginBottom: "2.5rem" }} />
            <h2 className="heading" style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", marginBottom: "1rem" }}>
              Keep reading
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1rem" }}>
              <a href="/hmrc-mileage-rates" style={{ background: "var(--amber-400)", color: "var(--bg-deep)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", textDecoration: "none" }}>
                HMRC rates in detail →
              </a>
              <a href="/mileage-claim-form-template" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                Mileage claim form template
              </a>
              <a href="/expenses-policy-template" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                Expenses policy template
              </a>
              <a href="/what-counts-as-business-mileage" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                What counts as business mileage
              </a>
              <a href="/business-mileage-guide" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                Full business mileage guide
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
