import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";

export const metadata: Metadata = {
  title: "What Counts as Business Mileage?",
  description:
    "The eight edge cases UK drivers ask about most: home to first job, trips between sites, training courses, networking events, supplier runs, client lunches, charity volunteering, and the school run detour.",
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
    a: "Business mileage, straightforward. Whether you are picking up parts from a wholesaler, timber from a builders merchant, or stock from a warehouse, the trip is for work and qualifies for the 45p/25p rate.",
  },
  {
    q: "Driving to a client lunch",
    verdict: "depends",
    a: "Business mileage if the purpose of the trip is a genuine business meeting, even if food is involved. Not business mileage if the meeting is an excuse to socialise with someone who happens to be a client. Keep notes of what was discussed - that is often the only difference between a legitimate claim and one HMRC disallows.",
  },
  {
    q: "Driving for a registered charity",
    verdict: "counts",
    a: "Volunteer drivers for a registered UK charity can claim the HMRC approved rate (45p/25p) against the mileage the charity reimburses them, as long as the charity is genuinely repaying mileage rather than paying for services. If the charity pays less than 45p, you can claim the shortfall as Mileage Allowance Relief. If they pay you more, the excess is taxable. Personal volunteering for a group that is not a registered charity does not qualify.",
  },
  {
    q: "School run, then on to a job site",
    verdict: "doesnt",
    a: "The school run is personal. Tacking a work trip onto the end does not convert the school run into business mileage. What does count is the leg from the school (or wherever you dropped the kids off) to the actual job site. So if you drop the kids at 8:30am and then drive 12 miles to a client, only the 12 miles from the school to the client is business. The miles from home to the school are personal, always.",
  },
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
    mainEntity: cases.map((c) => ({
      "@type": "Question",
      name: c.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: c.a.replace(/&ldquo;|&rdquo;/g, '"').replace(/<[^>]+>/g, ""),
      },
    })),
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
                Eight real-world situations UK drivers ask about, with plain
                answers on whether HMRC lets you claim. The rules are not as
                strict as people fear, but a few specific traps catch most
                drivers out.
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
                HMRC&apos;s entire framework for commuting vs business travel
                hinges on this phrase. A permanent workplace is somewhere you
                attend regularly, for a substantial period of your work. The
                travel between home and a permanent workplace is ordinary
                commuting - never claimable.
              </p>
              <p style={{ marginBottom: "1rem" }}>
                A temporary workplace is somewhere you attend to perform a
                task of limited duration, or for a temporary purpose. Trips
                to a temporary workplace are business mileage. HMRC generally
                considers 24 months the threshold: if you know from the start
                that you will be travelling to the same location for more
                than two years, it is no longer temporary.
              </p>
              <p>
                For mobile workers (gig drivers, trades contractors, mobile
                hairdressers, district nurses, field engineers), home is
                usually the base and every work destination is temporary.
                For office-based employees, the office is the permanent
                workplace and only occasional travel to clients or other
                sites counts. The grey area is hybrid workers who split time
                between home and an office - the HMRC guidance is that
                whichever location you attend more is the permanent one. If
                unsure, ask an accountant. A £50 conversation can save you
                hundreds in incorrectly claimed or missed mileage.
              </p>
            </div>
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
