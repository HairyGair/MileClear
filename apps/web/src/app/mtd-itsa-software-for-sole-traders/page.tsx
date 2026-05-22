import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";

export const metadata: Metadata = {
  title: "MTD ITSA Software for Sole Traders & Self-Employed Drivers (2026 Deadline)",
  description:
    "Making Tax Digital for Income Tax kicks in on 6 April 2026. The first quarterly submission is due 7 August 2026 for sole traders earning over £50,000. Here's what MTD ITSA actually requires, who has to comply, and how MileClear is preparing UK gig drivers for it.",
  alternates: {
    canonical: "https://mileclear.com/mtd-itsa-software-for-sole-traders",
  },
  openGraph: {
    title: "MTD ITSA Software for Sole Traders | MileClear",
    description:
      "First quarterly MTD ITSA submission is due 7 August 2026. Most mileage apps don't actually file with HMRC. MileClear is one of the few UK apps building this in.",
    url: "https://mileclear.com/mtd-itsa-software-for-sole-traders",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MTD ITSA Software for Sole Traders | MileClear",
    description:
      "MTD ITSA's first quarterly deadline is 7 August 2026. Most mileage apps don't actually submit. MileClear is preparing for it.",
    images: ["/branding/og-image.png"],
  },
};

const faqs = [
  {
    q: "What is MTD ITSA?",
    a: "Making Tax Digital for Income Tax Self Assessment (MTD ITSA, sometimes shortened to MTD for Income Tax or MTD IT) is HMRC's new way of receiving tax information from sole traders and landlords. Instead of one Self Assessment return at the end of the tax year, you submit a digital quarterly summary every three months from MTD-compliant software. There is also an end-of-year final declaration. The system has been delayed several times. It now launches on 6 April 2026.",
  },
  {
    q: "Who has to comply with MTD ITSA in 2026?",
    a: "From 6 April 2026, MTD ITSA applies to sole traders and landlords whose combined self-employment income plus property income exceeds £50,000 in the 2024-25 tax year. From 6 April 2027 the threshold drops to £30,000. From 6 April 2028 it drops to £20,000. If you are below the relevant threshold you stay on regular Self Assessment for now.",
  },
  {
    q: "When is the first MTD ITSA quarterly submission due?",
    a: "The first quarterly window of the new regime covers 6 April to 5 July 2026. The submission deadline for that quarter is 7 August 2026. Subsequent quarters end on 5 October, 5 January, and 5 April, with submission deadlines roughly one month later. The end-of-year final declaration for 2026-27 is due by 31 January 2028.",
  },
  {
    q: "What does MTD-compliant software actually have to do?",
    a: "Three things. First, integrate with HMRC's MTD APIs over OAuth — your software talks to HMRC on your behalf, you don't type figures into a portal. Second, transmit nine to fifteen mandatory fraud-prevention headers on every API call (device, location, software identification). Third, submit a digital quarterly summary that maps your business income and expenses to HMRC's schema. A spreadsheet, even a digital one, is not compliant on its own. You either need MTD-compliant accounting software or 'bridging software' that links your spreadsheet to HMRC.",
  },
  {
    q: "Why don't most mileage trackers do MTD ITSA submissions?",
    a: "Mileage tracking is a different problem from tax submission. Most apps in this category — including the well-known international ones — focus on producing a CSV or PDF of your business mileage and stopping there. Submitting that data to HMRC requires an entirely separate workstream: HMRC Developer Hub registration, OAuth implementation, fraud-prevention header generation, sandbox testing, and a 3-8 week production accreditation review. Few mileage trackers have built this infrastructure because their core product is the tracker, not the filer.",
  },
  {
    q: "Can I keep using my existing mileage tracker and submit elsewhere?",
    a: "Yes, but you will be juggling at least two pieces of software. Your tracker generates a mileage figure (or an export); a separate piece of MTD-compliant accounting software submits to HMRC. Most accountancy packages — Xero, FreeAgent, QuickBooks, Sage — support MTD ITSA submissions but do not track mileage natively. The disjointed workflow is exactly what UK gig drivers tell us they want to avoid. MileClear is being built so the mileage and the submission live in the same place.",
  },
  {
    q: "What if I miss the 7 August 2026 deadline?",
    a: "HMRC has confirmed a points-based late submission penalty. You accumulate one point per missed quarterly submission. At four points (sole trader on quarterly cadence) HMRC issues a £200 fine, with further £200 fines for each subsequent late submission until you reset by submitting on time for a defined period. There is also a separate late payment regime if you owe tax. The simpler answer is: file on time. The first deadline is the one most people will miss because the regime is brand new — set up your software early.",
  },
  {
    q: "Do I still need to do a Self Assessment return?",
    a: "Not in the same way. Under MTD ITSA the four quarterly submissions plus an end-of-year final declaration replace the annual Self Assessment return for affected sole traders. You won't be filing two things; you'll be filing the new MTD ITSA workflow only. If you have other income (salary, dividends, capital gains) the final declaration is where that goes.",
  },
  {
    q: "When will MileClear's MTD ITSA submission feature be available?",
    a: "MTD ITSA submission is in development now and targeted for the 1.2.0 release, on TestFlight by mid-July 2026, well ahead of the 7 August quarterly deadline. The OAuth flow, fraud-prevention headers, Obligations API and Self Employment Business read APIs are already live in production sandbox. The Create Period Summary submission flow and mobile UI are next. Production accreditation has been requested from HMRC and is in their review queue.",
  },
];

export default function MtdItsaSoftwarePage() {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "MTD ITSA Software for Sole Traders & Self-Employed Drivers",
    description:
      "Making Tax Digital for Income Tax launches 6 April 2026. The first quarterly submission deadline is 7 August 2026 for sole traders over £50,000. Here's what MTD ITSA actually requires and how MileClear is preparing UK gig drivers for it.",
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
    dateModified: "2026-05-09",
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
                Making Tax Digital for Income Tax launches on 6 April 2026. The
                first quarterly submission deadline is 7 August 2026 for
                anyone whose self-employment plus property income exceeded
                £50,000 in 2024-25. Most mileage-tracking apps are not
                MTD-compliant on their own. MileClear is being built so the
                tracking and the submission live in one place.
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
                First quarterly deadline
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
                7 August 2026
              </div>
              <p
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.9375rem",
                  margin: 0,
                }}
              >
                The submission window covers 6 April – 5 July 2026 (Q1 of the
                2026-27 tax year). If you are over the £50,000 threshold this
                is your first MTD ITSA filing.
              </p>
            </div>
          </div>
        </section>

        {/* Threshold timeline */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "1.25rem" }}>
              Who has to comply &mdash; and when
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
                  Phase 1 &mdash; 6 April 2026
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
                  Phase 2 &mdash; 6 April 2027
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
                  Phase 3 &mdash; 6 April 2028
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
                HMRC mandates 9–15 specific HTTP headers (device fingerprint,
                public IP, screen size, OS family, vendor identification, and
                more) on every MTD API call. The format is strict and is
                validated automatically. Get any of them wrong and the call
                is rejected.
              </li>
              <li style={{ marginBottom: "0.75rem" }}>
                <strong style={{ color: "var(--text-white)" }}>Quarterly submission against HMRC&apos;s schema.</strong>{" "}
                Your software has to map your real business data &mdash;
                turnover, expenses by category, mileage deduction &mdash; to
                the exact JSON shape HMRC&apos;s Self Employment Business API
                expects. Get the mapping wrong and you submit incorrect tax
                figures, with personal liability if HMRC investigates.
              </li>
              <li style={{ marginBottom: "0.75rem" }}>
                <strong style={{ color: "var(--text-white)" }}>HMRC production accreditation.</strong>{" "}
                Sandbox access is open to anyone. Production access requires
                a security review by HMRC that takes 3–8 weeks: terms of
                use, fraud-prevention header evidence, security policy,
                personal data handling, accessibility (WCAG 2.2 AA),
                penetration testing.
              </li>
            </ol>

            <p style={{ color: "var(--text-secondary)", marginBottom: 0 }}>
              That last one is why most mileage trackers don&apos;t bother.
              The accreditation review is a real piece of work, and the
              ongoing maintenance to keep up with HMRC schema changes is
              non-trivial.
            </p>
          </div>
        </section>

        {/* Why most mileage apps don't do this */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "1.25rem" }}>
              Why most mileage trackers won&apos;t file your MTD ITSA return
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              The well-known international mileage trackers &mdash; the
              ones that come up first when you search &quot;UK mileage
              tracker&quot; &mdash; were built around a simpler product
              shape: track miles, generate a CSV or PDF, hand it to your
              accountant. That&apos;s the entire workflow.
            </p>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              MTD ITSA changes the shape of the workflow. The submission
              <em> is</em> the product. A mileage figure on a CSV is no
              longer the end-state &mdash; it has to flow into a quarterly
              filing that lives inside MTD-compliant software.
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
                <strong style={{ color: "var(--text-white)" }}>Mileage-first apps with MTD bolted on</strong>{" "}
                &mdash; a small but growing category. MileClear is in this
                bucket, built UK-first with HMRC integration as a native
                workflow rather than an export.
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
              How MileClear is preparing for the 7 August 2026 deadline
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              MileClear is being built so the UK gig driver journey is
              one app: track every mile automatically, classify trips by
              platform (Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri,
              Stuart, Gophr, Yodel), capture earnings via Open Banking or
              CSV import, log allowable expenses, and submit the quarterly
              figures to HMRC without leaving the product.
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
                  <strong style={{ color: "var(--text-white)" }}>Phase 1 shipped:</strong>{" "}
                  HMRC OAuth connection, fraud-prevention header builder,
                  validated 0-error against HMRC&apos;s Test Fraud
                  Prevention Headers API.
                </li>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong style={{ color: "var(--text-white)" }}>Phase 2 in progress:</strong>{" "}
                  Obligations API, Business Details API, Self Employment
                  Period read APIs all live in production. Create Period
                  Summary submission flow is the next build.
                </li>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong style={{ color: "var(--text-white)" }}>Phase 3 starting:</strong>{" "}
                  Mobile UI for Connect HMRC, NINO entry, obligations
                  countdown, submission preview, submission confirmation.
                </li>
                <li style={{ marginBottom: "0.5rem" }}>
                  <strong style={{ color: "var(--text-white)" }}>Phase 4 in HMRC&apos;s queue:</strong>{" "}
                  Production accreditation request submitted 8 May 2026.
                  HMRC review is in their MTD IT backlog; expecting 4-8
                  week turnaround.
                </li>
                <li style={{ marginBottom: 0 }}>
                  <strong style={{ color: "var(--text-white)" }}>Target release:</strong>{" "}
                  MileClear 1.2.0 to TestFlight by mid-July 2026, App
                  Store-public ahead of the 7 August 2026 first
                  quarterly window.
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
              what state the software is actually in &mdash; not just
              what the marketing claims.
            </p>
          </div>
        </section>

        {/* What MileClear automates */}
        <section className="section">
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "1.75rem", marginBottom: "1.25rem" }}>
              What MileClear automates for your MTD ITSA filing
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              The whole point of MTD-compliant software is that you stop
              copying numbers between spreadsheets. Here&apos;s what runs
              automatically once your quarterly window opens:
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
                  body: "Every expense category (parking, tolls, phone, equipment, food/subsistence with HMRC SE57240 warning, accommodation, professional fees, etc.) is mapped to the right SA103S box (17 motor / 18 admin / 19 other). No manual reconciliation.",
                },
                {
                  title: "Obligations countdown",
                  body: "Live countdown to your next quarterly submission, sourced directly from HMRC's Obligations API. No surprise deadlines.",
                },
                {
                  title: "Preview before submitting",
                  body: "Every figure shown side-by-side with where it came from before you authorise the submission. If something looks wrong, you fix it in MileClear, not in a spreadsheet.",
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
              Get ahead of the 7 August deadline
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
              your first MTD ITSA submission is one tap, not one
              panicked weekend in late July. MileClear is free for
              tracking, classification, and tax-readiness tooling. The
              MTD ITSA quarterly submission lands in 1.2.0.
            </p>
            <a
              href="https://apps.apple.com/app/mileclear/id6759671005"
              style={{
                display: "inline-block",
                padding: "0.875rem 2rem",
                background: "var(--amber-400)",
                color: "var(--bg-deep)",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: "1rem",
                borderRadius: "var(--r-md)",
                textDecoration: "none",
                marginBottom: "0.75rem",
              }}
            >
              Install MileClear on iOS
            </a>
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
                {" "}&mdash; the AMAP figures MileClear uses to calculate
                your deduction.
              </li>
              <li>
                <Link
                  href="/business-mileage-guide"
                  style={{ color: "var(--amber-400)", textDecoration: "none" }}
                >
                  Business mileage guide
                </Link>
                {" "}&mdash; what counts as a business trip for tax purposes.
              </li>
              <li>
                <Link
                  href="/what-counts-as-business-mileage"
                  style={{ color: "var(--amber-400)", textDecoration: "none" }}
                >
                  What counts as business mileage
                </Link>
                {" "}&mdash; the trickier edge cases (commuting, mixed-use
                trips, charity volunteering).
              </li>
              <li>
                <Link
                  href="/mileclear-vs-mileiq"
                  style={{ color: "var(--amber-400)", textDecoration: "none" }}
                >
                  MileClear vs MileIQ
                </Link>
                {" "}&mdash; honest UK-tax-tooling comparison with the
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
