import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import { HMRC_THRESHOLD_MILES, getHmrcRatesForTaxYear } from "@mileclear/shared";
import { PrintFormButton, CopyPlainTextButton } from "./ClaimFormActions";
import "./mileage-claim-form-template.css";

export const metadata: Metadata = {
  title: "Mileage Claim Form Template (Free, Printable, UK)",
  description:
    "A free UK mileage claim form template. Printable on this page, or copy a plain-text version straight into a spreadsheet. Built to what HMRC expects a mileage record to contain.",
  alternates: {
    canonical: "https://mileclear.com/mileage-claim-form-template",
  },
  openGraph: {
    title: "Mileage Claim Form Template | MileClear",
    description:
      "A free, printable UK mileage claim form, plus a plain-text version you can paste into a spreadsheet. Built to HMRC's record-keeping expectations.",
    url: "https://mileclear.com/mileage-claim-form-template",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mileage Claim Form Template | MileClear",
    description: "A free, printable UK mileage claim form template.",
    images: ["/branding/og-image.png"],
  },
};

const currentYear = "2026-27" as const;
const priorYear = "2025-26" as const;
const currentRates = getHmrcRatesForTaxYear(currentYear);
const priorRates = getHmrcRatesForTaxYear(priorYear);

const BLANK_ROWS = 12;

const plainTextTemplate = `MILEAGE CLAIM FORM

Company: ________________________
Employee name: ________________________
Employee ID / payroll number: ________________________
Vehicle and registration: ________________________
Period covered: from ________________ to ________________

HMRC approved rate (${currentYear}): ${currentRates.car.first10000}p per mile for the first ${HMRC_THRESHOLD_MILES.toLocaleString("en-GB")} business miles this tax year, then ${currentRates.car.after10000}p per mile after that. Motorbikes: ${currentRates.motorbike.flat}p flat. (${priorYear} and earlier: ${priorRates.car.first10000}p / ${priorRates.car.after10000}p for cars and vans.)

Date\tFrom\tTo\tPurpose\tBusiness miles\tRate\tAmount
\t\t\t\t\t\t
\t\t\t\t\t\t
\t\t\t\t\t\t
\t\t\t\t\t\t
\t\t\t\t\t\t

Total business miles: ________________
Total amount claimed: ________________

Employee signature: ________________________  Date: ____________
Approved by: ________________________  Date: ____________`;

const faqs = [
  {
    q: "What must a mileage claim form contain to satisfy HMRC?",
    a: "For each trip: the date, the start and end location, the reason for the journey, and the number of business miles. HMRC also expects the record to be contemporaneous, meaning kept at or near the time of the trip, not reconstructed from memory months later. This template covers all of that, plus the fields an employer's payroll normally wants (employee ID, vehicle, approval).",
  },
  {
    q: "Can I use a spreadsheet instead of this form?",
    a: "Yes. HMRC has no required format. A spreadsheet with the same columns (date, from, to, purpose, miles, rate, amount) is equally valid. The plain-text version on this page is formatted with tabs so it pastes straight into Excel, Google Sheets, or Numbers as separate columns.",
  },
  {
    q: "Does this form work for a Self Assessment mileage claim too?",
    a: "Yes. Self-employed drivers using HMRC's simplified expenses mileage method need the same information: date, journey, purpose, miles and rate. Leave the employer approval line blank and use your own running total for your Self Assessment self-employment pages.",
  },
  {
    q: "What rate should I put in the form?",
    a: `For journeys from 6 April 2026 onwards, use ${currentRates.car.first10000}p per mile for the first ${HMRC_THRESHOLD_MILES.toLocaleString("en-GB")} business miles in the tax year, then ${currentRates.car.after10000}p per mile after that (motorbikes ${currentRates.motorbike.flat}p flat). For journeys up to 5 April 2026, use ${priorRates.car.first10000}p and ${priorRates.car.after10000}p. See our HMRC mileage rates page for the full detail, including what happens if your employer pays a different rate.`,
  },
] as const;

export default function MileageClaimFormTemplatePage() {
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const blankRows = Array.from({ length: BLANK_ROWS });

  return (
    <>
      <BreadcrumbsJsonLd
        crumbs={[{ name: "Mileage Claim Form Template", path: "/mileage-claim-form-template" }]}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
      <Navbar />

      <main style={{ paddingTop: "68px" }}>
        {/* Hero */}
        <section className="section">
          <div className="container" style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <span className="label">Free Template</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                Mileage Claim Form Template
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 660 }}>
                A printable UK mileage claim form built to what HMRC expects
                a mileage record to contain, with the current approved rate
                already filled in. Print it, or copy a plain-text version
                into a spreadsheet. No download, no sign-up.
              </p>
            </div>
          </div>
        </section>

        {/* What it needs to contain */}
        <section className="section no-print" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div
              style={{
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--r-lg)",
                padding: "clamp(1.5rem, 3vw, 2rem)",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--amber-400)", marginBottom: "0.85rem" }}>
                What a claim form needs to hold up
              </div>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75, marginBottom: "0.85rem" }}>
                HMRC does not prescribe a specific form or template, but they
                do expect the record behind a mileage claim to contain, for
                every trip: the date, the start and end address or postcode,
                the reason for the journey, and the distance in business
                miles. The record should be contemporaneous, kept close to
                the time of travel rather than rebuilt from memory at tax
                time.
              </p>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75 }}>
                This template adds the fields most employers&apos; payroll or
                finance teams want on top of that: employee ID, vehicle and
                registration, the rate applied, the amount, and a signature
                and approval line. For the full detail on rates and
                thresholds, see our{" "}
                <a href="/approved-mileage-allowance-payments" style={{ color: "var(--amber-400)" }}>
                  AMAP guide
                </a>.
              </p>
            </div>
          </div>
        </section>

        {/* Printable form */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 1000, margin: "0 auto" }}>
            <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <span className="label">The Form</span>
                <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
                  Print this claim form
                </h2>
              </div>
              <PrintFormButton />
            </div>

            <div className="mcf-print-form">
              <div style={{ padding: "1.5rem 1.5rem 0.5rem" }}>
                <h3 style={{ fontFamily: "var(--font-display, inherit)", fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem" }}>
                  Mileage claim form
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "0.75rem 1.5rem",
                    marginBottom: "1.25rem",
                    fontSize: "0.8125rem",
                  }}
                >
                  {[
                    "Company",
                    "Employee name",
                    "Employee ID / payroll no.",
                    "Vehicle and registration",
                    "Period covered (from)",
                    "Period covered (to)",
                  ].map((label) => (
                    <div key={label}>
                      <div style={{ color: "#64748b", marginBottom: "0.3rem", fontWeight: 600 }}>{label}</div>
                      <div style={{ borderBottom: "1px solid #94a3b8", height: "1.4rem" }} />
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    padding: "0.75rem 1rem",
                    fontSize: "0.75rem",
                    color: "#334155",
                    marginBottom: "1.25rem",
                  }}
                >
                  HMRC approved rate ({currentYear}): {currentRates.car.first10000}p per mile for the
                  first {HMRC_THRESHOLD_MILES.toLocaleString("en-GB")} business miles this tax year, then{" "}
                  {currentRates.car.after10000}p per mile after that (motorbikes {currentRates.motorbike.flat}p
                  flat). For journeys before 6 April 2026, use {priorRates.car.first10000}p / {priorRates.car.after10000}p.
                </div>
              </div>

              <div style={{ overflowX: "auto", padding: "0 1.5rem" }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "10%" }}>Date</th>
                      <th style={{ width: "18%" }}>From</th>
                      <th style={{ width: "18%" }}>To</th>
                      <th style={{ width: "22%" }}>Purpose</th>
                      <th style={{ width: "12%" }}>Business miles</th>
                      <th style={{ width: "10%" }}>Rate</th>
                      <th style={{ width: "10%" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blankRows.map((_, i) => (
                      <tr className="mcf-blank-row" key={i}>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                        <td>&nbsp;</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} style={{ textAlign: "right", fontWeight: 700 }}>
                        Totals
                      </td>
                      <td style={{ fontWeight: 700 }}>&nbsp;</td>
                      <td>&nbsp;</td>
                      <td style={{ fontWeight: 700 }}>&nbsp;</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div
                style={{
                  padding: "1.5rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "1.5rem",
                  fontSize: "0.8125rem",
                }}
              >
                <div>
                  <div style={{ color: "#64748b", marginBottom: "1.5rem", fontWeight: 600 }}>Employee signature</div>
                  <div style={{ borderBottom: "1px solid #94a3b8", height: "1.2rem", marginBottom: "0.4rem" }} />
                  <div style={{ color: "#94a3b8" }}>Date: ________________</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", marginBottom: "1.5rem", fontWeight: 600 }}>Approved by</div>
                  <div style={{ borderBottom: "1px solid #94a3b8", height: "1.2rem", marginBottom: "0.4rem" }} />
                  <div style={{ color: "#94a3b8" }}>Date: ________________</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Plain text version */}
        <section className="section no-print" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <span className="label">Spreadsheet Version</span>
                <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
                  Or copy a plain-text version
                </h2>
              </div>
              <CopyPlainTextButton text={plainTextTemplate} />
            </div>
            <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "1rem" }}>
              Tab-separated, so pasting into a spreadsheet drops each field
              into its own column.
            </p>
            <div
              style={{
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--r-lg)",
                padding: "1.25rem",
                overflowX: "auto",
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: "0.8125rem",
                  color: "var(--text-primary)",
                  lineHeight: 1.7,
                  whiteSpace: "pre",
                }}
              >
                {plainTextTemplate}
              </pre>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="section no-print" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ marginBottom: "2rem" }}>
              <span className="label">FAQ</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
                Questions about this form
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

        {/* MileClear / Milesheet mention */}
        <section className="section no-print" style={{ paddingTop: 0 }}>
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
                Filling this in by hand works, but it is also exactly the job
                MileClear automates. The app records date, start, end,
                purpose and distance for every business trip with GPS, at the
                correct rate for the tax year, so there is no form left to
                fill in.
              </p>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75 }}>
                For employers, <strong style={{ color: "var(--text-white)" }}>Milesheet</strong> is
                the part of MileClear where a company approves each driver&apos;s
                claim for the month and exports one file for payroll, instead
                of collecting a form like this one from every member of staff.{" "}
                <a href="/milesheet" style={{ color: "var(--amber-400)" }}>
                  See how Milesheet works
                </a>
                .
              </p>
            </div>
          </div>
        </section>

        {/* Related */}
        <section className="section no-print" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div className="divider" style={{ marginBottom: "2.5rem" }} />
            <h2 className="heading" style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", marginBottom: "1rem" }}>
              Keep reading
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "1rem" }}>
              <a href="/approved-mileage-allowance-payments" style={{ background: "var(--amber-400)", color: "var(--bg-deep)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", textDecoration: "none" }}>
                Approved mileage allowance payments →
              </a>
              <a href="/expenses-policy-template" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                Expenses policy template
              </a>
              <a href="/hmrc-mileage-rates" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                HMRC mileage rates
              </a>
              <a href="/mileage-calculator" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                Mileage calculator
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
