import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";

export const metadata: Metadata = {
  title: {
    absolute: "What Counts as Business Mileage? Commuting vs Business Travel (UK) | MileClear",
  },
  description:
    "Which journeys count as business mileage in the UK: commuting vs business travel, the 24-month temporary workplace rule, depots and sales areas, with examples for gig drivers, employees and sales roles. Based on HMRC's manuals.",
  keywords: [
    "what counts as business mileage",
    "business mileage vs commuting",
    "is home to first job business mileage",
    "temporary workplace 24 month rule",
    "business mileage rules uk",
  ],
  alternates: {
    canonical: "https://mileclear.com/what-counts-as-business-mileage",
  },
  openGraph: {
    title: "What Counts as Business Mileage? | MileClear",
    description:
      "Home-to-first-job, trips between sites, training courses, supplier runs, client lunches. Plain answers on which trips HMRC lets you claim.",
    url: "https://mileclear.com/what-counts-as-business-mileage",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "What Counts as Business Mileage? | MileClear",
    description:
      "Plain answers on which trips HMRC lets you claim.",
    images: ["/branding/og-image.png"],
  },
};

type Verdict = "counts" | "doesnt" | "depends";

const cases: Array<{ q: string; verdict: Verdict; a: string }> = [
  {
    q: "Driving from home to your first job of the day",
    verdict: "depends",
    a: "This is the most asked question and the most nuanced answer. HMRC's rule turns on whether home is your &ldquo;permanent workplace&rdquo;. If you work from home most days and occasionally drive to a client, customer, or site, the trip from home to that site is business mileage. If your home is where you sleep and your real base of work is a fixed office or depot you attend regularly, the trip is ordinary commuting and does not count. Sole traders and mobile workers (plumbers, sparkies, gig drivers, mobile hairdressers) usually fall into the first camp. Employees commuting to the same office five days a week fall into the second. If the answer is unclear, a short conversation with an accountant is worth more than guessing.",
  },
  {
    q: "Trips between two job sites in one day",
    verdict: "counts",
    a: "Unambiguously business mileage. The drive from site A to site B is for work, regardless of where you started the day. This is true whether you are a trades contractor, a district nurse, a sales rep, or a gig driver moving between zones.",
  },
  {
    q: "Driving to a training course",
    verdict: "depends",
    a: "Business mileage if the training is work-related and required or expected by your employer or your trade. Think required CPD hours, a health-and-safety update your employer books, or a certification your self-employment depends on. Not business mileage if the training is for a new career, a hobby, or a general-interest qualification. The test is whether the training supports the work you already do.",
  },
  {
    q: "Driving to a networking event or business breakfast",
    verdict: "depends",
    a: "Technically yes if the event is genuinely for business - you are there to win work, meet suppliers, or represent your company. In practice, HMRC is sceptical of trips that look like socialising with a business hat on. If you are self-employed and regularly attend industry meetups, keep a note of who you spoke to or what came out of it. That turns it from looking like a lunch into a defensible business trip.",
  },
  {
    q: "Picking up materials from a supplier",
    verdict: "counts",
    a: "Business mileage, straightforward. Whether you are picking up parts from a wholesaler, timber from a builders merchant, or stock from a warehouse, the trip is for work and qualifies for the 55p/25p rate (raised from 45p/25p on 6 April 2026).",
  },
  {
    q: "Driving to a client lunch",
    verdict: "depends",
    a: "Business mileage if the purpose of the trip is a genuine business meeting, even if food is involved. Not business mileage if the meeting is an excuse to socialise with someone who happens to be a client. Keep notes of what was discussed - that is often the only difference between a legitimate claim and one HMRC disallows.",
  },
  {
    q: "Volunteer driving for a charity",
    verdict: "depends",
    a: "Volunteer driving is not business mileage in a trade or a job, but HMRC has its own rules for it. If the organisation pays you mileage, payments up to the approved rate (55p a mile for the first 10,000 miles in 2026-27, 45p before 6 April 2026) leave you with no tax to pay; above that you may have tax to pay. Mileage Allowance Relief is a relief for employees, so do not assume a volunteer can claim a shortfall. HMRC's volunteer drivers' guidance (EIM71150 onwards) sets out the detail.",
  },
  {
    q: "School run, then on to a job site",
    verdict: "doesnt",
    a: "The school run is personal. Tacking a work trip onto the end does not convert the school run into business mileage. What does count is the leg from the school (or wherever you dropped the kids off) to the actual job site. So if you drop the kids at 8:30am and then drive 12 miles to a client, only the 12 miles from the school to the client is business. The miles from home to the school are personal, always.",
  },
];

const roleExamples: Array<{ title: string; points: string[] }> = [
  {
    title: "Gig and delivery drivers (self-employed)",
    points: [
      "Driving from pickup to drop-off, between jobs, and back towards the busy area while you are logged in: business.",
      "Home to your first pickup, when the work is itinerant and home is your base: usually business (BIM37620). Keep the log, because this is the leg HMRC asks about.",
      "Home to the same depot or delivery station you load at every shift: often treated like travel to a fixed place of business, so the safer view is that the work miles start at the depot.",
      "Personal errands in the middle of a shift, and the drive home after you have logged off for a night out: personal.",
    ],
  },
  {
    title: "Employees using their own car",
    points: [
      "Home to the office, branch or depot you attend regularly: ordinary commuting, not claimable (EIM32055).",
      "Office to a client, between sites, or to a supplier during the day: business.",
      "Home straight to a temporary workplace, such as a client site for a six-month project: business (EIM32075), unless the 24-month rule makes it permanent.",
      "Home to a training course or another office you visit occasionally: usually business, because it is not your permanent workplace.",
    ],
  },
  {
    title: "Sales reps and area-based roles",
    points: [
      "If you have no single permanent workplace, attend an area regularly, and your job is defined by that area (a sales territory, a patch), the area can be your permanent workplace (EIM32190).",
      "Then the drive from home to the edge of the area is ordinary commuting, and business travel within the area is claimable (EIM32200).",
      "If your duties are not defined by an area, each customer you visit is usually a temporary workplace, so the trips to them count.",
    ],
  },
];

const extraFaqs: Array<{ q: string; a: string }> = [
  {
    q: "What is the difference between commuting and business travel?",
    a: "Commuting is travel between home and a permanent workplace, the place you go regularly to do your job. Business travel is travel you make in the course of the work itself: between sites, to clients and suppliers, or to a temporary workplace. Commuting is never claimable; business travel is. HMRC sets this out for employees in EIM32000 onwards and for the self-employed in BIM37600 onwards.",
  },
  {
    q: "What is the 24-month rule?",
    a: "A workplace stops being temporary if you spend 40% or more of your working time there over a period that lasts, or is likely to last, more than 24 months (EIM32080). Before that, journeys from home to it are business travel. It is judged on what was reasonable to expect at the time, so a posting that gets extended past 24 months becomes permanent from the point that was likely.",
  },
  {
    q: "Is driving home to my first job business mileage?",
    a: "For a self-employed driver or tradesperson whose work is itinerant and whose base is home, usually yes (BIM37620). For an employee driving to the office or depot they attend regularly, no, that is commuting. For an employee driving straight from home to a temporary workplace, yes.",
  },
  {
    q: "What rate do I claim for business miles?",
    a: "For a car or van, 55p a mile for the first 10,000 business miles in the tax year and 25p after that, from 6 April 2026. Trips before that date are at 45p for the first 10,000. Motorcycles are 24p a mile. Self-employed drivers can use the flat rate or claim actual costs; employees claim from their employer and can claim Mileage Allowance Relief on any shortfall.",
  },
];

const sources: Array<{ href: string; label: string }> = [
  { href: "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim32000", label: "EIM32000: travel expenses, the temporary workplace rules (employees)" },
  { href: "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim32080", label: "EIM32080: temporary workplace, the 24-month rule" },
  { href: "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim32160", label: "EIM32160: depots and similar bases" },
  { href: "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim32170", label: "EIM32170: employees who work at home" },
  { href: "https://www.gov.uk/hmrc-internal-manuals/employment-income-manual/eim32190", label: "EIM32190: duties defined by reference to an area" },
  { href: "https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37605", label: "BIM37605: travel costs, home to work (self-employed)" },
  { href: "https://www.gov.uk/hmrc-internal-manuals/business-income-manual/bim37620", label: "BIM37620: travel costs, to and between sites (self-employed)" },
  { href: "https://www.gov.uk/government/publications/490-employee-travel-a-tax-and-nics-guide", label: "HMRC 490: employee travel, a tax and NICs guide" },
  { href: "https://www.gov.uk/tax-relief-for-employees/vehicles-you-use-for-work", label: "GOV.UK: tax relief for vehicles you use for work" },
];

function verdictMeta(v: Verdict) {
  if (v === "counts")
    return {
      label: "Counts",
      color: "var(--emerald-400)",
      bg: "rgba(16, 185, 129, 0.06)",
      border: "rgba(16, 185, 129, 0.3)",
    };
  if (v === "doesnt")
    return {
      label: "Does not count",
      color: "#fca5a5",
      bg: "rgba(239, 68, 68, 0.04)",
      border: "rgba(239, 68, 68, 0.3)",
    };
  return {
    label: "Depends",
    color: "var(--amber-300)",
    bg: "var(--amber-glow-md)",
    border: "rgba(234, 179, 8, 0.3)",
  };
}

export default function WhatCountsPage() {
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      ...cases.map((c) => ({
        "@type": "Question",
        name: c.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: c.a.replace(/&ldquo;|&rdquo;/g, '"').replace(/<[^>]+>/g, ""),
        },
      })),
      ...extraFaqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    ],
  };

  return (
    <>
      <BreadcrumbsJsonLd
        crumbs={[{ name: "What Counts as Business Mileage", path: "/what-counts-as-business-mileage" }]}
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
              <span className="label">Classification</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                What Counts as Business Mileage?
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 640 }}>
                Commuting vs business travel, explained with the situations UK
                drivers ask about most, for the self-employed, employees and
                sales roles. Based on HMRC&apos;s own manuals, with references
                so you can check them.
              </p>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.85rem" }}>
                Last updated: October 2026
              </p>
            </div>
          </div>
        </section>

        {/* 60-second answer */}
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
                The 60-second answer
              </div>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75, marginBottom: "0.85rem" }}>
                A trip counts as business mileage if its main purpose is work
                and you are not travelling to your permanent workplace. Sites,
                clients, suppliers, and temporary locations all qualify. A
                daily commute to the same office does not.
              </p>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75 }}>
                The awkward case is home-to-first-job. If you work from home
                most days, the trip to an occasional client counts. If your
                real base is a fixed office you attend most days, it does not.
                Everything else below is a variation on that rule.
              </p>
            </div>
          </div>
        </section>

        {/* Edge cases */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "2rem" }}>
              <span className="label">Edge Cases</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
                Eight situations, eight answers
              </h2>
            </div>

            <div style={{ display: "grid", gap: "1rem" }}>
              {cases.map((c) => {
                const m = verdictMeta(c.verdict);
                return (
                  <article
                    key={c.q}
                    style={{
                      background: "var(--bg-card-solid)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--r-md)",
                      padding: "clamp(1.25rem, 2.5vw, 1.75rem)",
                    }}
                  >
                    <header style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.85rem", marginBottom: "0.85rem" }}>
                      <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-white)", lineHeight: 1.35, flex: "1 1 auto" }}>
                        {c.q}
                      </h3>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.25rem 0.7rem",
                          borderRadius: "var(--r-full)",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          color: m.color,
                          background: m.bg,
                          border: `1px solid ${m.border}`,
                          flexShrink: 0,
                        }}
                      >
                        {m.label}
                      </span>
                    </header>
                    <p
                      style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.75 }}
                      dangerouslySetInnerHTML={{ __html: c.a }}
                    />
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Permanent workplace */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">The Rule Behind Most of These</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", marginBottom: "1rem" }}>
                What is a &ldquo;permanent workplace&rdquo;?
              </h2>
            </div>
            <div style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <p style={{ marginBottom: "1rem" }}>
                For employees, HMRC&apos;s framework for commuting vs business
                travel hinges on this phrase. A permanent workplace is somewhere
                you attend regularly to do your job (EIM32065, EIM32070).
                Travel between home and a permanent workplace is ordinary
                commuting (EIM32055) and is never claimable.
              </p>
              <p style={{ marginBottom: "1rem" }}>
                A temporary workplace is somewhere you go to do a task of
                limited duration or for a temporary purpose (EIM32075).
                Journeys to it are business travel. The 24-month rule
                (EIM32080) sets the limit: a workplace stops being temporary
                if you spend 40% or more of your working time there over a
                period that lasts, or is likely to last, more than 24 months.
                What counts is what was reasonable to expect at the time, so a
                12-month posting that is extended becomes permanent from the
                point it is likely to pass 24 months.
              </p>
              <p style={{ marginBottom: "1rem" }}>
                A depot you report to regularly, to collect a vehicle or be
                given your work, is a permanent workplace (EIM32160), so home to
                depot is commuting and the driving after that is business.
                Home only counts as a workplace for an employee in limited
                cases, where the job itself requires you to work there; working
                from home by choice does not turn the trip to the office into
                business travel (EIM32170).
              </p>
              <p>
                For the self-employed the test is different but lands in a
                similar place. Travel from home to a fixed place of business,
                such as a shop, unit or office, is not allowable (BIM37605).
                Where the trade is itinerant and home is the base of operations,
                travel from home to the places you work is allowable (BIM37620,
                following Horton v Young). If you are unsure which side you are
                on, a short conversation with an accountant is worth more than
                a guess.
              </p>
            </div>
          </div>
        </section>

        {/* Examples by role */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <span className="label">Examples</span>
              <h2 className="heading" style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}>
                Business mileage vs commuting, by type of driver
              </h2>
            </div>
            <div style={{ display: "grid", gap: "1rem" }}>
              {roleExamples.map((r) => (
                <article
                  key={r.title}
                  style={{
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--r-md)",
                    padding: "clamp(1.25rem, 2.5vw, 1.75rem)",
                  }}
                >
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-white)", marginBottom: "0.75rem" }}>
                    {r.title}
                  </h3>
                  <ul style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.75, paddingLeft: "1.25rem", display: "grid", gap: "0.4rem" }}>
                    {r.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Extra questions */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", marginBottom: "1.25rem" }}>
              More questions about business mileage
            </h2>
            <div style={{ display: "grid", gap: "1rem" }}>
              {extraFaqs.map((f) => (
                <article
                  key={f.q}
                  style={{
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--r-md)",
                    padding: "clamp(1.25rem, 2.5vw, 1.75rem)",
                  }}
                >
                  <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-white)", lineHeight: 1.35, marginBottom: "0.6rem" }}>
                    {f.q}
                  </h3>
                  <p style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>{f.a}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Sources */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <h2 className="heading" style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)", marginBottom: "1rem" }}>
              HMRC guidance this page is based on
            </h2>
            <ul style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", lineHeight: 1.8, paddingLeft: "1.25rem" }}>
              {sources.map((src) => (
                <li key={src.href}>
                  <a href={src.href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--amber-400)" }}>
                    {src.label}
                  </a>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", lineHeight: 1.7, marginTop: "1rem" }}>
              General information, not tax advice. The rules turn on your own
              circumstances; check GOV.UK or ask an accountant before you rely
              on them.
            </p>
          </div>
        </section>

        {/* Quick reference */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={{ maxWidth: 820, margin: "0 auto" }}>
            <div
              style={{
                background: "rgba(16, 185, 129, 0.04)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "var(--r-lg)",
                padding: "clamp(1.5rem, 3vw, 2rem)",
              }}
            >
              <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--emerald-400)", marginBottom: "0.85rem" }}>
                If in doubt
              </div>
              <p style={{ fontSize: "1rem", color: "var(--text-primary)", lineHeight: 1.75 }}>
                Log the trip and classify it as business. Note down the
                reason - client name, job reference, platform tag. At tax
                time, if you are still unsure whether to claim, that is when
                to check with an accountant. It is far easier to remove a
                claim than to reconstruct a trip six months after the fact.
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
              <a
                href="/hmrc-mileage-rates"
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
                HMRC rates in detail →
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
