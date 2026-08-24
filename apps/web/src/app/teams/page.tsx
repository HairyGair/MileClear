import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import TeamInterestForm from "@/components/landing/TeamInterestForm";
import TeamSelfServeGate from "@/components/team/TeamSelfServeGate";

export const metadata: Metadata = {
  title: "MileClear for Teams - Register Interest",
  description:
    "Managing a team's mileage claims? MileClear tracks every business mile automatically for each driver. Tell us what a manager view and approval workflow would need to do for you.",
  alternates: { canonical: "https://mileclear.com/teams" },
  openGraph: {
    title: "MileClear for Teams",
    description:
      "Automatic mileage tracking for every driver on your team. Help shape the manager view by telling us what you need.",
    url: "https://mileclear.com/teams",
    type: "website",
  },
  // A probe page with a form; not something we want ranking on its own yet.
  robots: { index: false, follow: true },
};

const h2: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#f9fafb",
  marginBottom: "1rem",
};
const p: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: "1rem",
  lineHeight: 1.75,
  marginBottom: "1rem",
};

export default function TeamsPage() {
  return (
    <>
      <Navbar />
      <main style={{ background: "#030712", paddingTop: "6rem", paddingBottom: "5rem" }}>
        <div className="container" style={{ maxWidth: 820 }}>
          <header style={{ marginBottom: "3rem" }}>
            <span className="label" style={{ display: "inline-block", marginBottom: "1rem" }}>
              For employers and managers
            </span>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(2rem, 5vw, 2.75rem)",
                fontWeight: 800,
                color: "#f9fafb",
                lineHeight: 1.1,
                marginBottom: "1.25rem",
              }}
            >
              MileClear for teams
            </h1>
            <p style={{ ...p, fontSize: "1.125rem", color: "#cbd5e1" }}>
              We have been asked, more than once now, for a way for a manager to see a whole team's mileage in one
              place and sign it off. This page is how we decide whether to build it, and what it should do.
            </p>
          </header>

          <section style={{ marginBottom: "3rem" }} aria-labelledby="today-heading">
            <h2 id="today-heading" style={h2}>
              What MileClear does today
            </h2>
            <p style={p}>
              MileClear is built around the individual driver. Each person installs the app, their business miles
              are recorded automatically, they mark anything personal, and they can export an HMRC-ready report (CSV
              or PDF) for any period. Employees can set their employer's rate so the claim comes out in pounds.
            </p>
            <p style={p}>
              On our Pro plan a driver can also give a named person a read-only link to a live dashboard of their
              mileage, with the export available from there. It was built for accountants and it works for a manager
              too. What it does not do is gather several drivers into one view, or give anyone an approve / reject
              step.
            </p>
          </section>

          <section style={{ marginBottom: "3rem" }} aria-labelledby="weighing-heading">
            <h2 id="weighing-heading" style={h2}>
              What we are weighing
            </h2>
            <p style={p}>
              A manager view: every driver on your team side by side, a monthly sign-off, and one combined export
              that lands where your figures need to go. Whether we build it, and in what order, depends on who is
              asking and how big their teams are. That is what the form below is for. It takes about a minute.
            </p>
          </section>

          <TeamSelfServeGate />

          <section
            aria-labelledby="form-heading"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              padding: "clamp(1.25rem, 4vw, 2.25rem)",
            }}
          >
            <h2 id="form-heading" style={{ ...h2, marginBottom: "1.5rem" }}>
              Tell us what you need
            </h2>
            <TeamInterestForm source="teams" />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
