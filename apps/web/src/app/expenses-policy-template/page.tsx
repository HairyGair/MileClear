import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import { HMRC_THRESHOLD_MILES, getHmrcRatesForTaxYear } from "@mileclear/shared";
import CopyPolicyButton from "./CopyPolicyButton";

export const metadata: Metadata = {
  title: "Staff Mileage & Expenses Policy Template (Free, UK)",
  description:
    "A free UK staff mileage and expenses policy template you can adapt with your own placeholders. Covers scope, rate, claims, approval, deadlines and record keeping.",
  alternates: {
    canonical: "https://mileclear.com/expenses-policy-template",
  },
  openGraph: {
    title: "Staff Mileage & Expenses Policy Template | MileClear",
    description:
      "A free, adaptable UK staff mileage and expenses policy template, plus a copy-to-clipboard version to drop into your own document.",
    url: "https://mileclear.com/expenses-policy-template",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Staff Mileage & Expenses Policy Template | MileClear",
    description: "A free, adaptable UK staff mileage and expenses policy template.",
    images: ["/branding/og-image.png"],
  },
};

const currentYear = "2026-27" as const;
const rates = getHmrcRatesForTaxYear(currentYear);
const threshold = HMRC_THRESHOLD_MILES.toLocaleString("en-GB");

const sections: Array<{ n: number; title: string; body: string[] }> = [
  {
    n: 1,
    title: "Purpose and scope",
    body: [
      "This policy sets out how [Company name] reimburses staff who use their own vehicle for business travel, and what is expected of anyone submitting a mileage claim.",
      "It applies to [all employees / all employees and contractors] who drive their own car, van or motorbike on [Company name]'s business. It does not cover company vehicles, which are handled separately under [company car / fuel card policy, if applicable].",
    ],
  },
  {
    n: 2,
    title: "Who this policy applies to",
    body: [
      "This policy applies to [all permanent staff / permanent and casual staff / specify]. If [Company name] engages contractors or agency staff who drive for work, state clearly here whether the same rate and process apply to them or whether their terms are set separately in their contract.",
    ],
  },
  {
    n: 3,
    title: "What counts as business travel",
    body: [
      "Business travel is a journey made for work that is not your ordinary commute. This includes travel between company sites, visits to clients or suppliers, and journeys to a temporary place of work.",
      "It does not include your normal journey between home and your usual place of work. If you are unsure whether a specific trip counts as business travel, check with [approving manager / job title] before you travel, not after.",
    ],
  },
  {
    n: 4,
    title: "Mileage rate",
    body: [
      `[Company name] reimburses business mileage at [the HMRC approved rate of ${rates.car.first10000}p per mile for the first ${threshold} business miles in the tax year, then ${rates.car.after10000}p per mile after that / a company rate of [X]p per mile].`,
      "HMRC's approved rate is a tax-free ceiling, not a legal minimum, so a company is free to set its own rate above or below it. If [Company name] pays less than the HMRC approved rate, staff may be able to claim the difference directly from HMRC as Mileage Allowance Relief. If [Company name] pays more, the excess above HMRC's rate is taxable and will be processed through payroll accordingly.",
    ],
  },
  {
    n: 5,
    title: "Passenger payments",
    body: [
      "Where a colleague travels with you for the same business purpose, an additional [5p] per mile per passenger may be claimed on top of the standard rate, up to HMRC's tax-free passenger allowance. [Delete this section if it does not apply to your business.]",
    ],
  },
  {
    n: 6,
    title: "How to submit a claim",
    body: [
      "Claims are submitted [via Milesheet / by email to [finance contact] / using the attached mileage claim form] by the [Nth] of the month following the journey.",
      "Each claim must include the date, start and end location, the purpose of the journey, and the number of business miles for every trip claimed. Claims missing this information will be returned for completion before they are paid.",
    ],
  },
  {
    n: 7,
    title: "Approval process",
    body: [
      "Claims are reviewed and approved by [job title of approving manager]. Approval confirms that the mileage and purpose look reasonable and consistent with business need, not that every detail has been independently checked.",
      "[Company name] reserves the right to query or decline any claim that appears inconsistent with normal working patterns, and to ask for supporting information before approving it.",
    ],
  },
  {
    n: 8,
    title: "Payment and deadlines",
    body: [
      "Approved claims are paid with [monthly payroll / the next scheduled payment run], provided they are submitted by the [Nth] of the month. Claims received after the deadline are normally carried over to the following payment run.",
    ],
  },
  {
    n: 9,
    title: "What is not reimbursable",
    body: [
      "The following are not reimbursed under this policy:",
      "- Ordinary commuting between home and your usual place of work",
      "- Fuel, servicing, insurance or other vehicle running costs claimed separately from the mileage rate",
      "- Parking or driving fines, or costs arising from a driving offence",
      "- Personal detours added to a business journey",
      "- Any journey that has not been approved in line with this policy",
    ],
  },
  {
    n: 10,
    title: "Record keeping",
    body: [
      "[Company name] keeps mileage claim records for [6 years / as long as required by HMRC], in line with HMRC's requirement that business mileage be evidenced. Staff should keep their own copy of anything they submit.",
    ],
  },
  {
    n: 11,
    title: "Review of this policy",
    body: [
      "This policy is reviewed [annually / whenever HMRC's approved rates change] by [HR / Finance]. The version in force is dated [date] and supersedes any earlier version.",
    ],
  },
];

const policyPlainText = `STAFF MILEAGE AND EXPENSES POLICY

${sections
  .map((s) => `${s.n}. ${s.title}\n${s.body.join("\n")}`)
  .join("\n\n")}
`;

const faqs = [
  {
    q: "Do we have to pay the HMRC approved rate?",
    a: "No. There is no legal requirement for a private-sector employer to pay any specific mileage rate, or to reimburse mileage at all, beyond what is agreed in a contract or company policy. HMRC's approved rate only sets the amount that can be paid tax-free. You can set your own company rate above or below it.",
  },
  {
    q: "What happens if we pay more than the HMRC rate?",
    a: "The amount above HMRC's approved rate is taxable. It should be processed through payroll (or reported on a P11D) and is subject to income tax and National Insurance in the usual way, rather than paid as a tax-free mileage reimbursement.",
  },
  {
    q: "What happens if we pay less than the HMRC rate?",
    a: "Nothing needs to change on your side. Staff who are paid less than HMRC's approved rate can claim the shortfall as tax relief directly from HMRC, known as Mileage Allowance Relief, without any extra cost or paperwork for the employer.",
  },
  {
    q: "Does this policy need to cover casual or part-time staff?",
    a: "Only if you want it to. Decide explicitly in section 2 whether casual staff, contractors or agency workers are covered by this policy or by separate terms, rather than leaving it ambiguous. An unclear scope is one of the most common reasons a mileage policy causes disputes.",
  },
] as const;

export default function ExpensesPolicyTemplatePage() {
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
        crumbs={[{ name: "Expenses Policy Template", path: "/expenses-policy-template" }]}
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
                Staff Mileage and Expenses Policy Template
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 660 }}>
                An 11-section staff mileage policy you can adapt with your
                own placeholders. Covers scope, rate, how to claim, approval,
                deadlines, and what is not reimbursable. Copy it straight
                into your own document.
              </p>
            </div>
          </div>
        </section>

        {/* How to adapt */}
        <section className="section" style={{ paddingTop: 0 }}>
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
                How to adapt this
              </div>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75, marginBottom: "0.85rem" }}>
                Every square-bracket placeholder, like{" "}
                <code style={{ background: "rgba(255,255,255,0.06)", padding: "0.1rem 0.4rem", borderRadius: 6, fontSize: "0.875em" }}>
                  [Company name]
                </code>
                , is a decision for you to make: fill it in, pick one of the
                slash-separated options, or delete the line if it does not
                apply to your business. Sections 4 and 9 are the two worth
                the most care, since they are where a real dispute usually
                starts.
              </p>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75 }}>
                This is a starting template, not legal advice. Have your HR
                team, an employment solicitor, or your accountant check the
                final version before you publish it, particularly if your
                business has contractors, casual staff, or staff on
                non-standard contracts.
              </p>
            </div>
          </div>
        </section>

        {/* Policy body */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <span className="label">The Policy</span>
                <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
                  Staff mileage and expenses policy
                </h2>
              </div>
              <CopyPolicyButton text={policyPlainText} />
            </div>

            <div style={{ display: "grid", gap: "1rem" }}>
              {sections.map((s) => (
                <article
                  key={s.n}
                  style={{
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--r-md)",
                    padding: "clamp(1.25rem, 2.5vw, 1.75rem)",
                  }}
                >
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1.0625rem",
                      fontWeight: 700,
                      color: "var(--text-white)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {s.n}. {s.title}
                  </h3>
                  <div style={{ display: "grid", gap: "0.6rem" }}>
                    {s.body.map((p, i) => (
                      <p key={i} style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.75, whiteSpace: "pre-line" }}>
                        {p}
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 760, margin: "0 auto" }}>
            <div style={{ marginBottom: "2rem" }}>
              <span className="label">FAQ</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
                Questions about setting your rate
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
                A written policy sets the rules. MileClear is what makes
                staff actually follow them without extra effort: journeys are
                recorded automatically with GPS, so nobody is filling in a
                claim form from memory at the end of the month.
              </p>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75 }}>
                <strong style={{ color: "var(--text-white)" }}>Milesheet</strong> is
                the part of MileClear built for exactly this policy: it
                lets a company review each driver&apos;s business mileage for
                the month, approve it in line with sections 6 and 7 above,
                and export one file for payroll at your chosen rate.{" "}
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
              <a href="/approved-mileage-allowance-payments" style={{ background: "var(--amber-400)", color: "var(--bg-deep)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", textDecoration: "none" }}>
                Approved mileage allowance payments →
              </a>
              <a href="/mileage-claim-form-template" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                Mileage claim form template
              </a>
              <a href="/hmrc-mileage-rates" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                HMRC mileage rates
              </a>
              <a href="/employee-mileage-tracker" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "0.9375rem", padding: "0.75rem 1.5rem", borderRadius: "var(--r-full)", border: "1px solid var(--border-default)", textDecoration: "none" }}>
                Employee mileage tracking
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
