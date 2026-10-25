import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import StoreButtons from "@/components/StoreButtons";

export const metadata: Metadata = {
  title: "MTD for Income Tax: What Sole Traders & Self-Employed Drivers Need (2026-27)",
  description:
    "Making Tax Digital for Income Tax started on 6 April 2026 for sole traders with qualifying income over £50,000. The next quarterly update deadlines are 7 November 2026 and 7 February 2027. Here's what it requires, who has to comply, and where MileClear's own build stands (tested with HMRC's test service only).",
  alternates: {
    canonical: "https://mileclear.com/mtd-itsa-software-for-sole-traders",
  },
  openGraph: {
    title: "MTD ITSA Software for Sole Traders | MileClear",
    description:
      "MTD for Income Tax is live for sole traders over £50,000. Next quarterly update deadlines: 7 November 2026 and 7 February 2027. What it means for self-employed drivers.",
    url: "https://mileclear.com/mtd-itsa-software-for-sole-traders",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MTD ITSA Software for Sole Traders | MileClear",
    description:
      "MTD for Income Tax is live. Next quarterly deadlines: 7 November 2026 and 7 February 2027. What self-employed drivers need to know.",
    images: ["/branding/og-image.png"],
  },
};

const faqs = [
  {
    q: "What is MTD ITSA?",
    a: "Making Tax Digital for Income Tax Self Assessment (MTD ITSA, sometimes shortened to MTD for Income Tax or MTD IT) is HMRC's new way of receiving tax information from sole traders and landlords. You keep digital records and send a quarterly update from compatible software, then make a final declaration after the tax year. It started on 6 April 2026 for people with qualifying income over £50,000.",
  },
  {
    q: "Who has to comply with MTD ITSA in 2026?",
    a: "MTD ITSA has applied since 6 April 2026 to sole traders and landlords whose combined self-employment income plus property income exceeds £50,000 in the 2024-25 tax year. From 6 April 2027 the threshold drops to £30,000. From 6 April 2028 it drops to £20,000. If you are below the relevant threshold you stay on regular Self Assessment for now.",
  },
  {
    q: "When is the first MTD ITSA quarterly submission due?",
    a: "The first update for 2026-27 was due on 7 August 2026. The remaining deadlines for 2026-27 are 7 November 2026, 7 February 2027 and 7 May 2027. The final declaration for 2026-27 is due by 31 January 2028 (source: HMRC's MTD timeline on GOV.UK).",
  },
  {
    q: "What does MTD-compliant software actually have to do?",
    a: "Three things. First, connect to HMRC's MTD APIs over OAuth so the software talks to HMRC on your behalf. Second, send HMRC's mandatory fraud-prevention headers on every API call (device, location, software identification). Third, send a digital quarterly update that maps your business income and expenses to HMRC's schema. A spreadsheet on its own does not do this. You need software that is compatible with MTD, or bridging software that links your spreadsheet to HMRC.",
  },
  {
    q: "Why don't most mileage trackers do MTD ITSA submissions?",
    a: "Mileage tracking is a different problem from tax submission. Most apps in this category focus on producing a CSV or PDF of your business mileage and stopping there. Sending data to HMRC needs a separate workstream: HMRC Developer Hub registration, OAuth, fraud-prevention headers, sandbox testing and a production review by HMRC. Few mileage trackers have built that, because their core product is the tracker.",
  },
  {
    q: "Can I keep using my existing mileage tracker and submit elsewhere?",
    a: "Yes, but you will use at least two pieces of software. Your tracker gives you a mileage figure or an export; separate MTD-compatible accounting software sends the quarterly update to HMRC. Most accountancy packages (Xero, FreeAgent, QuickBooks, Sage) support MTD for Income Tax but do not track mileage natively. MileClear tracks and totals your mileage and deduction. Nothing from MileClear is sent to HMRC yet, so use your accounting software or accountant for real quarterly updates.",
  },
  {
    q: "What if I miss a quarterly deadline?",
    a: "HMRC uses a points-based late submission penalty for MTD, plus a separate late payment regime if you owe tax. How the penalties apply in the first year is set out on GOV.UK, so check the current guidance or ask your accountant. The simple answer is to send each update on time, and to set up your software well before the deadline.",
  },
  {
    q: "Do I still need to do a Self Assessment return?",
    a: "For the 2025-26 tax year, yes: that Self Assessment return is still due by 31 January 2027. From 2026-27, if you are in MTD, the four quarterly updates plus a final declaration take the place of the annual return, and the final declaration is due by 31 January 2028. If you have other income (salary, dividends, capital gains) it goes in the final declaration. Either way, you file on GOV.UK or through your accountant, not through MileClear.",
  },
  {
    q: "Does MileClear send my quarterly update to HMRC?",
    a: "Not yet. The MTD journey is built into MileClear and labelled beta: connect your HMRC account, see your obligations, preview your figures and walk through an update. It is tested with HMRC's test service only, so nothing is sent to HMRC and your real tax record does not change. For real quarterly updates and your Self Assessment, use your accountant or MTD-compatible accounting software, or file on GOV.UK.",
  },
];

export default function MtdItsaSoftwarePage() {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "MTD ITSA Software for Sole Traders & Self-Employed Drivers",
    description:
      "Making Tax Digital for Income Tax started on 6 April 2026 for sole traders over £50,000. The next quarterly update deadlines are 7 November 2026 and 7 February 2027. Here's what MTD ITSA requires and where MileClear's own build stands.",
    author: { "@type": "Person", name: "Anthony Gair" },
    publisher: {
      "@type": "Organization",
      name: "MileClear",
      logo: {
        "@type": "ImageObject",
        url: "https://mileclear.com/branding/logo-120x120.png",
      },
    },
    datePublished: "2026-05-09",
    dateModified: "2026-10-25",
    mainEntityOfPage: "https://mileclear.com/mtd-itsa-software-for-sole-traders",
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
        crumbs={[
          {
            name: "MTD ITSA Software for Sole Traders",
            path: "/mtd-itsa-software-for-sole-traders",
          },
        ]}
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
              <span className="label">Making Tax Digital for Income Tax</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                MTD ITSA software for sole traders &amp; self-employed UK drivers
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 660 }}>
                Making Tax Digital for Income Tax started on 6 April 2026 for
                anyone whose self-employment plus property income exceeded
                £50,000 in 2024-25. The next quarterly update deadlines are
                7 November 2026 and 7 February 2027. A mileage app does not
                replace MTD software on its own. MileClear tracks and totals
                your mileage and is testing quarterly updates with HMRC&apos;s
                test service; nothing is sent to HMRC yet.
              </p>
            </div>

            {/* Deadline banner */}
            <div
              style={{
                background: "var(--amber-glow-md)",
                border: "1px solid rgba(234, 179, 8, 0.35)",
                borderRadius: "var(--r-lg)",
                padding: "clamp(1.5rem, 3vw, 2rem)",
                marginTop: "2.5rem",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--amber-300)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "0.5rem",
                }}
              >
                Next quarterly deadline
              </div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(2rem, 5vw, 2.75rem)",
                  fontWeight: 700,
                  color: "var(--text-white)",
                  lineHeight: 1.1,
                  marginBottom: "0.5rem",
                }}
              >
                7 November 2026
              </div>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.9375rem",
                  margin: 0,
                }}
              >
                This update covers 6 July to 5 October 2026 (Q2 of the
                2026-27 tax year). The one after is due 7 February 2027, then
                7 May 2027. If you are over the £50,000 threshold, these are
                your MTD updates.
              </p>
            </div>
          </div>
        </section>

        {/* Threshold timeline */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "1.25rem" }}>
              Who has to comply, and when
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              MTD ITSA is being phased in by income threshold. The threshold
              counts your <em>self-employment income plus property income</em>
              {" "}from the prior-but-one tax year (so the April 2026 launch
              tests against your 2024-25 figures).
            </p>

            <div
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--r-md)",
                  padding: "1.25rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--amber-300)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.4rem",
                  }}
                >
                  Phase 1: 6 April 2026
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.75rem",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1,
                    marginBottom: "0.4rem",
                  }}
                >
                  &gt; £50,000
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                  Sole traders &amp; landlords above the threshold in 2024-25
                </div>
              </div>

              <div
                style={{
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--r-md)",
                  padding: "1.25rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.4rem",
                  }}
                >
                  Phase 2: 6 April 2027
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.75rem",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1,
                    marginBottom: "0.4rem",
                  }}
                >
                  &gt; £30,000
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                  Threshold drops; many full-time gig drivers are caught
                </div>
              </div>

              <div
                style={{
                  background: "var(--bg-card-solid)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--r-md)",
                  padding: "1.25rem",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "0.4rem",
                  }}
                >
                  Phase 3: 6 April 2028
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.75rem",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    lineHeight: 1,
                    marginBottom: "0.4rem",
                  }}
                >
                  &gt; £20,000
                </div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
                  Sweeps in part-time self-employed and side-hustle earners
                </div>
              </div>
            </div>

            <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
              Below £20,000? You stay on regular Self Assessment for the
              foreseeable future. HMRC has signalled the threshold may drop
              further in time, but no firm date below £20,000 has been
              published.
            </p>
          </div>
        </section>

        {/* What MTD-compliant software does */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "1.25rem" }}>
              What &quot;MTD-compliant software&quot; actually means
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              The phrase is everywhere right now. Most apps in the mileage
              and accountancy space are scrambling to claim it. Worth
              understanding what it concretely requires:
            </p>

            <ol
              style={{
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                paddingLeft: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <li style={{ marginBottom: "0.75rem" }}>
                <strong style={{ color: "var(--text-white)" }}>OAuth integration with HMRC&apos;s MTD APIs.</strong>{" "}
                Your software has to redirect users to HMRC&apos;s consent
                page, exchange an authorisation code for tokens, and then
                call HMRC&apos;s servers on your behalf. No screen-scraping,
                no manual figure entry into a portal.
              </li>
              <li style={{ marginBottom: "0.75rem" }}>
                <strong style={{ color: "var(--text-white)" }}>Fraud-prevention headers on every call.</strong>{" "}
                HMRC mandates a set of specific HTTP headers (device fingerprint,
                public IP, screen size, OS family, vendor identification, and
                more) on every MTD API call. The format is strict and is
                validated automatically. Get any of them wrong and the call
                is rejected.
              </li>
              <li style={{ marginBottom: "0.75rem" }}>
                <strong style={{ color: "var(--text-white)" }}>Quarterly submission against HMRC&apos;s schema.</strong>{" "}
                Your software has to map your real business data (turnover,
                expenses by category, mileage deduction) to
                the exact JSON shape HMRC&apos;s Self Employment Business API
                expects. Get the mapping wrong and you submit incorrect tax
                figures, with personal liability if HMRC investigates.
              </li>
              <li style={{ marginBottom: "0.75rem" }}>
                <strong style={{ color: "var(--text-white)" }}>HMRC production credentials.</strong>{" "}
                Sandbox access is open to anyone. Production access requires
                a security review by HMRC that is a lengthy process: terms of
                use, fraud-prevention header evidence, security policy,
                personal data handling, accessibility (WCAG 2.2 AA),
                penetration testing.
              </li>
            </ol>

            <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
              That last one is why most mileage trackers don&apos;t bother.
              HMRC&apos;s production review is a real piece of work, and the
              ongoing maintenance to keep up with HMRC schema changes is
              non-trivial.
            </p>
          </div>
        </section>

        {/* Why most mileage apps don't do this */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "1.25rem" }}>
              Why most mileage trackers don&apos;t send MTD updates
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              The well-known international mileage trackers, the ones
              that come up first when you search &quot;UK mileage
              tracker&quot;, were built around a simpler product
              shape: track miles, generate a CSV or PDF, hand it to your
              accountant. That&apos;s the entire workflow.
            </p>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              MTD ITSA changes the shape of the workflow. The quarterly
              update is a digital step. A mileage figure on a CSV is no
              longer the end of the road: it has to flow into a quarterly
              update made from MTD-compatible software.
            </p>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              The realistic UK options for sole traders right now look like:
            </p>

            <ul
              style={{
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                paddingLeft: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={{ color: "var(--text-white)" }}>Full accountancy suites</strong>{" "}
                (Xero, FreeAgent, QuickBooks, Sage). MTD-compliant for
                submission. No native UK gig-driver mileage tracking; you
                bolt on a separate tracker and import.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={{ color: "var(--text-white)" }}>Bridging software</strong>{" "}
                (123 Sheets, Vital Tax, etc.). Takes a spreadsheet and pushes
                it to HMRC. Fine if you trust your spreadsheet, less ideal
                if you want a coherent product.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong style={{ color: "var(--text-white)" }}>Mileage-first apps with MTD bolted on</strong>.
                A small but growing category. MileClear is building towards
                this, UK-first, and tests it with HMRC&apos;s test service. It is
                not live yet, so do not rely on it for a real update.
              </li>
            </ul>

            <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
              The two-app approach (tracker + accountancy suite) works but
              is the most common cause of frustrated UK gig drivers we
              hear from. The mileage data ends up in a spreadsheet,
              someone forgets to update the bridging software, and the
              quarterly deadline arrives with mismatched figures.
            </p>
          </div>
        </section>

        {/* MileClear approach */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "1.25rem" }}>
              Where MileClear&apos;s MTD build stands
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              MileClear is being built so the UK gig driver journey is
              one app: track every mile automatically, classify trips by
              platform (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri,
              Stuart, Gophr, Yodel), capture earnings via Open Banking or
              CSV import, log allowable expenses, and prepare the quarterly
              figures. The update journey is built and running against
              HMRC&apos;s test service while we wait on production credentials.
              Nothing is sent to HMRC yet.
            </p>

            <div
              style={{
                background: "var(--bg-card-solid)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--r-md)",
                padding: "1.5rem",
                marginBottom: "1.5rem",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "1.125rem",
                  fontWeight: 700,
                  color: "var(--text-white)",
                  marginBottom: "1rem",
                }}
              >
                Where MileClear&apos;s MTD ITSA build is today
              </h3>
              <ul
                style={{
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  paddingLeft: "1.25rem",
                  margin: 0,
                }}
              >
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong style={{ color: "var(--text-white)" }}>Built:</strong>{" "}
                  Connect your HMRC account, see your quarterly obligations, preview every figure and walk through an update. It is in the app now, labelled beta.
                </li>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong style={{ color: "var(--text-white)" }}>Running against HMRC&apos;s test service:</strong>{" "}
                  until HMRC grants production credentials, updates go to HMRC&apos;s test service only. Nothing is sent to HMRC and your real tax record does not change.
                </li>
                <li style={{ marginBottom: 0 }}>
                  <strong style={{ color: "var(--text-white)" }}>With HMRC now:</strong>{" "}
                  our request for production credentials is under HMRC&apos;s review.
                </li>
              </ul>
            </div>

            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              We&apos;re publishing live progress in our{" "}
              <Link
                href="/updates"
                style={{ color: "var(--amber-400)", textDecoration: "none" }}
              >
                release notes
              </Link>
              {" "}because the deadline is real and you deserve to know
              what state the software is actually in, not just
              what the marketing claims.
            </p>
          </div>
        </section>

        {/* What MileClear automates */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "1.25rem" }}>
              What MileClear prepares for your MTD ITSA figures
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Here&apos;s what the MTD ITSA feature (built, in beta on
              HMRC&apos;s test service until production credentials are
              granted) prepares from your records once your quarterly window
              opens. Nothing is sent to HMRC yet:
            </p>

            <div
              style={{
                display: "grid",
                gap: "1rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                marginBottom: "1rem",
              }}
            >
              {[
                {
                  title: "Mileage deduction",
                  body: "Every business-classified trip flows into your AMAP deduction at 55p/25p (cars/vans, rate rose from 45p on 6 April 2026) or 24p (motorbike). Employer mileage rates supported for employees using their own car. The figure goes straight into HMRC's expenses.carVanTravelExpenses field.",
                },
                {
                  title: "Earnings by platform",
                  body: "Open Banking auto-import (TrueLayer) or CSV upload. Each transaction is tagged to the platform that paid it (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri, Stuart, Gophr, Yodel, Freelance). Total turnover lands in HMRC's incomes.turnover.",
                },
                {
                  title: "Expense categorisation",
                  body: "Every expense category (parking, tolls, phone, equipment, food/subsistence with HMRC SE57240 warning, accommodation, professional fees, etc.) is mapped to the right SA103S box (12 car, van and travel / 16 professional fees / 18 phone and office costs / 19 other). No manual reconciliation.",
                },
                {
                  title: "Obligations countdown",
                  body: "Live countdown to your next quarterly update, sourced directly from HMRC's Obligations API. No surprise deadlines.",
                },
                {
                  title: "Preview before any update",
                  body: "Every figure shown side-by-side with where it came from, so you can check it before any update. If something looks wrong, you fix it in MileClear, not in a spreadsheet.",
                },
                {
                  title: "End-of-year final declaration",
                  body: "BSAS (Business Source Adjustable Summary) plus Individual Calculations APIs for the year-end reconciliation. The whole annual cycle in one product.",
                },
              ].map((feat) => (
                <div
                  key={feat.title}
                  style={{
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--r-md)",
                    padding: "1.25rem",
                  }}
                >
                  <h3
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "var(--text-white)",
                      marginBottom: "0.5rem",
                    }}
                  >
                    {feat.title}
                  </h3>
                  <p
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.6,
                      margin: 0,
                    }}
                  >
                    {feat.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "1.5rem" }}>
              MTD ITSA FAQs
            </h2>
            {faqs.map((f) => (
              <div
                key={f.q}
                style={{
                  borderBottom: "1px solid var(--border-default)",
                  padding: "1.25rem 0",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "1.0625rem",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    marginBottom: "0.5rem",
                  }}
                >
                  {f.q}
                </h3>
                <p
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "0.9375rem",
                    lineHeight: 1.7,
                    margin: 0,
                  }}
                >
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="section">
          <div
            className="container"
            style={{
              maxWidth: 720,
              margin: "0 auto",
              textAlign: "center",
              background: "var(--amber-glow-md)",
              border: "1px solid rgba(234, 179, 8, 0.35)",
              borderRadius: "var(--r-lg)",
              padding: "clamp(2rem, 4vw, 3rem)",
            }}
          >
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>
              Get your records in order before the next deadline
            </h2>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: "1rem",
                lineHeight: 1.6,
                marginBottom: "1.5rem",
                maxWidth: 540,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Start tracking your mileage and platform earnings now so
              your mileage and income figures are ready when a quarterly
              deadline arrives. MileClear is free for tracking,
              classification, and tax-readiness tooling. MTD ITSA quarterly
              updates are in the app in beta, tested with HMRC&apos;s test
              service only.
            </p>
            <StoreButtons align="center" page="tax" />
            <div style={{ marginTop: "0.5rem" }}>
              <Link
                href="/updates"
                style={{
                  color: "var(--amber-400)",
                  fontSize: "0.875rem",
                  textDecoration: "none",
                }}
              >
                Read the MTD ITSA build progress in the release notes →
              </Link>
            </div>
          </div>
        </section>

        {/* Related */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2
              className="heading"
              style={{ fontSize: "1.5rem", marginBottom: "1rem" }}
            >
              Related guides
            </h2>
            <ul
              style={{
                color: "var(--text-secondary)",
                lineHeight: 1.9,
                paddingLeft: "1.25rem",
                margin: 0,
              }}
            >
              <li>
                <Link
                  href="/hmrc-mileage-rates"
                  style={{ color: "var(--amber-400)", textDecoration: "none" }}
                >
                  HMRC mileage rates 2025-26 and 2026-27
                </Link>
                {" "}- the AMAP figures MileClear uses to calculate
                your deduction.
              </li>
              <li>
                <Link
                  href="/business-mileage-guide"
                  style={{ color: "var(--amber-400)", textDecoration: "none" }}
                >
                  Business mileage guide
                </Link>
                {" "}- what counts as a business trip for tax purposes.
              </li>
              <li>
                <Link
                  href="/what-counts-as-business-mileage"
                  style={{ color: "var(--amber-400)", textDecoration: "none" }}
                >
                  What counts as business mileage
                </Link>
                {" "}- the trickier edge cases (commuting, mixed-use
                trips, charity volunteering).
              </li>
              <li>
                <Link
                  href="/mileclear-vs-mileiq"
                  style={{ color: "var(--amber-400)", textDecoration: "none" }}
                >
                  MileClear vs MileIQ
                </Link>
                {" "}- honest UK-tax-tooling comparison with the
                most-known alternative.
              </li>
            </ul>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
