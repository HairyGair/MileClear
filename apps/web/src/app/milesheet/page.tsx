import type { Metadata } from "next";
import Link from "next/link";
import MilesheetHeader from "../../components/milesheet/MilesheetHeader";

export const metadata: Metadata = {
  title: "Staff mileage claims, ready for payroll",
  description:
    "The company side of MileClear. Your staff drive, Milesheet records the miles automatically, you approve the month, and payroll gets one file at HMRC approved rates.",
  alternates: { canonical: "https://mileclear.com/milesheet" },
};

const steps = [
  {
    n: 1,
    title: "Your staff just drive",
    body: "Each person installs the MileClear app once and grants location access. Business journeys are recorded automatically in the background. Nobody has to remember to press start, and nobody has to keep a paper log.",
  },
  {
    n: 2,
    title: "You approve the month",
    body: "At the start of each month you see every driver, their business miles, and what it comes to. Approve someone in one click, or query a figure and the driver is notified on their phone to sort it out.",
  },
  {
    n: 3,
    title: "Payroll gets one file",
    body: "Download a single CSV or PDF covering everyone you have approved, at your company rate or the HMRC approved rate. One document, not fifteen spreadsheets.",
  },
];

const answers = [
  {
    q: "What rate does it use?",
    a: "HMRC approved mileage rates by default, currently 55p a mile for the first 10,000 business miles in the tax year and 25p after that. The 10,000 mile threshold is tracked across the whole tax year for each driver, not reset every month. You can set your own rate for the company, or a different rate for an individual.",
  },
  {
    q: "Can staff see each other's journeys?",
    a: "No. A driver sees only their own trips. You see your team's business mileage totals. Personal journeys stay private to the person who made them and never appear in your figures.",
  },
  {
    q: "What if a trip changes after I approve it?",
    a: "The figure you approved is recorded at the moment you approve it. If a trip is later edited, Milesheet shows you that the number has moved rather than quietly changing what you signed off.",
  },
  {
    q: "What does it cost?",
    a: "Per active driver, per month, billed to the company. Pilot customers pay nothing while we work together on getting it right.",
  },
];

export default function MilesheetPage() {
  return (
    <>
      <MilesheetHeader />
      <main className="ms-main">
        <div className="ms-container">
          <section>
            <span className="ms-eyebrow">Part of MileClear &middot; for employers</span>
            <h1 className="ms-hero__title">
              Your staff&rsquo;s mileage,
              <br />
              ready for payroll.
            </h1>
            <p className="ms-hero__sub">
              Milesheet is the company side of MileClear. It records your team&rsquo;s business
              journeys automatically, lets you approve the month in a couple of minutes, and
              hands payroll a single file at HMRC approved rates.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "2rem" }}>
              <Link href="/milesheet/portal" className="btn btn--lg btn--primary">
                Open the portal
              </Link>
              <a href="mailto:gair@mileclear.com?subject=Milesheet" className="btn btn--lg btn--secondary">
                Talk to us
              </a>
            </div>
          </section>

          <section className="ms-section">
            <h2 className="ms-section__title">How it works</h2>
            <p className="ms-lede">Three things happen, and only one of them is your job.</p>
            <div className="ms-steps">
              {steps.map((s) => (
                <div key={s.n} className="glass-card" style={{ padding: "1.5rem" }}>
                  <div className="ms-step__n">{s.n}</div>
                  <h3 style={{ fontSize: "1.0625rem", marginBottom: "0.5rem", color: "var(--text-white)" }}>
                    {s.title}
                  </h3>
                  <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "0.9375rem", margin: 0 }}>
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="ms-section">
            <h2 className="ms-section__title">Why bother</h2>
            <div className="ms-narrow" style={{ margin: 0 }}>
              <p className="ms-lede">
                Mileage claims are usually reconstructed from memory at the end of the month,
                on a spreadsheet, by someone who would rather be doing anything else. They are
                approximately right at best. Overclaims cost the company money and underclaims
                cost the employee money, and neither is defensible if HMRC asks how the figure
                was arrived at.
              </p>
              <p className="ms-lede">
                Milesheet replaces the memory and the spreadsheet with a recorded journey, an
                approval with a name and a date against it, and a rate calculation you can show
                anyone. It is quicker for the driver, quicker for you, and it stands up.
              </p>
            </div>
          </section>

          <section className="ms-section">
            <h2 className="ms-section__title">Questions people actually ask</h2>
            <div style={{ display: "grid", gap: "1rem" }}>
              {answers.map((a) => (
                <div key={a.q} className="glass-card" style={{ padding: "1.25rem 1.5rem" }}>
                  <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem", color: "var(--text-white)" }}>{a.q}</h3>
                  <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "0.9375rem", margin: 0 }}>
                    {a.a}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="ms-section" style={{ paddingBottom: "3rem" }}>
            <div className="glass-card" style={{ padding: "2rem", textAlign: "center" }}>
              <h2 className="ms-section__title" style={{ marginBottom: "0.5rem" }}>
                Set your company up
              </h2>
              <p className="ms-lede" style={{ maxWidth: 520, margin: "0 auto 1.5rem" }}>
                Create your company, invite your drivers by email, and approve your first month.
                It takes about five minutes.
              </p>
              <Link href="/milesheet/portal" className="btn btn--lg btn--primary">
                Get started
              </Link>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
