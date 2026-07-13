import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/mileclear-mileage-tracker-uk/id6759671005";

export const metadata: Metadata = {
  title: "MileClear Case Study - Reliable Mileage Tracking Built for UK Drivers",
  description:
    "How MileClear became a mileage tracker UK drivers actually trust: offline-first capture, HMRC-ready exports, and a relentless focus on never losing a trip. 249 drivers have tracked 82,924 miles to date.",
  alternates: { canonical: "https://mileclear.com/case-study" },
  openGraph: {
    title: "MileClear Case Study | Reliable mileage tracking for UK drivers",
    description:
      "Built from what drivers said was broken. Offline-first trip capture, HMRC-ready tax exports, and a never-lose-a-trip guarantee - 249 drivers, 82,924 miles tracked.",
    url: "https://mileclear.com/case-study",
    type: "article",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MileClear Case Study | Reliable mileage tracking for UK drivers",
    description:
      "Built from what drivers said was broken: offline-first capture, HMRC-ready exports, never lose a trip. 249 drivers, 82,924 miles tracked.",
    images: ["/branding/og-image.png"],
  },
};

// Verified from production on 20 June 2026.
const STATS = [
  { value: "249", label: "drivers" },
  { value: "6,121", label: "trips logged" },
  { value: "82,924", label: "miles tracked" },
  { value: "462", label: "shifts recorded" },
];

// Presentational helpers - mirror the long-form guide pages (ev-tax-relief).
function Card({
  children,
  accent = "default",
}: {
  children: React.ReactNode;
  accent?: "default" | "amber" | "good";
}) {
  const bg =
    accent === "amber"
      ? "var(--amber-glow-md)"
      : accent === "good"
        ? "rgba(16, 185, 129, 0.07)"
        : "var(--bg-card-solid)";
  const border =
    accent === "amber"
      ? "1px solid rgba(234, 179, 8, 0.25)"
      : accent === "good"
        ? "1px solid rgba(16, 185, 129, 0.25)"
        : "1px solid var(--border-default)";
  return (
    <div style={{ background: bg, border, borderRadius: "var(--r-md)", padding: "1.25rem", marginBottom: "1rem" }}>
      {children}
    </div>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-white)", marginBottom: "0.6rem" }}>
      {children}
    </h3>
  );
}

function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "0.75rem", ...style }}>
      {children}
    </p>
  );
}

function SectionHead({ label, title, intro }: { label: string; title: string; intro?: string }) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <span className="label">{label}</span>
      <h2 className="heading" style={{ fontSize: "clamp(1.6rem, 3vw, 2.1rem)", marginBottom: intro ? "0.85rem" : 0 }}>
        {title}
      </h2>
      {intro && <p style={{ fontSize: "1rem", color: "var(--text-secondary)", lineHeight: 1.75 }}>{intro}</p>}
    </div>
  );
}

export default function CaseStudyPage() {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "MileClear Case Study - Reliable mileage tracking built for UK drivers",
    description:
      "How MileClear became a mileage tracker UK drivers trust: offline-first capture, HMRC-ready exports, and a never-lose-a-trip focus. 249 drivers have tracked 82,924 miles.",
    author: { "@type": "Person", name: "Anthony Gair" },
    publisher: {
      "@type": "Organization",
      name: "MileClear",
      logo: { "@type": "ImageObject", url: "https://mileclear.com/branding/logo-120x120.png" },
    },
    datePublished: "2026-06-20",
    dateModified: "2026-06-20",
    mainEntityOfPage: "https://mileclear.com/case-study",
    inLanguage: "en-GB",
  };

  const wrap = { maxWidth: 820, margin: "0 auto" } as const;

  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: "Case Study", path: "/case-study" }]} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <Navbar />

      <main style={{ paddingTop: "68px" }}>
        {/* Hero */}
        <section className="section">
          <div className="container" style={wrap}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <span className="label">Case Study</span>
              <h1 className="heading" style={{ marginBottom: "1rem" }}>
                Built from what drivers said was broken
              </h1>
              <p className="subtext" style={{ margin: "0 auto", maxWidth: 660 }}>
                MileClear is a mileage and earnings tracker for UK drivers, built around one
                stubborn goal: never lose a trip. Here is the problem it set out to fix, how it
                works, and where it is today.
              </p>
            </div>

            {/* Live proof metrics */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "0.75rem",
                marginTop: "0.5rem",
              }}
            >
              {STATS.map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: "var(--bg-card-solid)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--r-md)",
                    padding: "1.1rem 1rem",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "1.6rem", fontWeight: 700, color: "var(--text-white)" }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
              Figures taken from production, verified 20 June 2026.
            </p>
          </div>
        </section>

        {/* The problem */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead
              label="The problem"
              title="Drivers couldn't find a mileage tracker they trusted"
              intro="MileClear didn't start with a product idea. It started by reading complaints. Across the gig-driver communities - Uber, Deliveroo, Amazon Flex, Just Eat - the same frustration came up again and again."
            />
            <Card>
              <P>
                The apps people had tried <strong style={{ color: "var(--text-white)" }}>missed trips,
                drained the battery, lost data on a bad signal, or buried the one number HMRC actually
                wants</strong> behind a wall of charts.
              </P>
              <P style={{ marginBottom: 0 }}>
                For a self-employed driver that is not an annoyance - it is money. Every business mile you
                can&apos;t prove is tax relief you don&apos;t get back. At 45–55p per mile, the untracked
                drives add up to real cash by the time the January deadline arrives.
              </P>
            </Card>
          </div>
        </section>

        {/* The approach */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead
              label="The approach"
              title="Offline-first, and built to never lose a trip"
              intro="Reliability wasn't a feature to bolt on - it was the whole point. So the architecture started there."
            />
            <Card accent="amber">
              <H3>Every trip is saved before it's sent</H3>
              <P style={{ marginBottom: 0 }}>
                MileClear is offline-first: each trip is written to your phone first and synced to the
                server when there&apos;s signal. A tunnel, a dead spot or a dropped connection never
                costs you a mile. If a sync can&apos;t complete, the trip waits and retries rather than
                being thrown away.
              </P>
            </Card>
            <Card accent="good">
              <H3>It records while your phone is in your pocket</H3>
              <P style={{ marginBottom: 0 }}>
                Trip capture runs on a native location engine that keeps going when the screen is locked
                and the app is in the background - and re-attaches itself if iOS shuts the app down. A
                push-to-start Live Activity now makes the Dynamic Island appear on its own when a drive
                is detected, so you can see it&apos;s working without opening the app.
              </P>
            </Card>
          </div>
        </section>

        {/* What drivers get */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead
              label="What it does"
              title="A driver's whole tax year, in one app"
              intro="Tracking is free. A Pro tier unlocks the tax exports and deeper analytics, so the part that matters most - capturing your miles - stays open to everyone."
            />
            <Card>
              <ul style={{ color: "var(--text-secondary)", fontSize: "0.95rem", lineHeight: 1.85, paddingLeft: "1.2rem", margin: 0 }}>
                <li><strong style={{ color: "var(--text-white)" }}>Automatic GPS trip tracking</strong> - business or personal, tagged by platform.</li>
                <li><strong style={{ color: "var(--text-white)" }}>One-tap HMRC self-assessment export</strong> - a year of driving becomes a tax-ready figure.</li>
                <li><strong style={{ color: "var(--text-white)" }}>Shift tracking with A–F scorecards</strong> that factor in cost and wear.</li>
                <li><strong style={{ color: "var(--text-white)" }}>Earnings</strong> by CSV import or open banking, plus expense logging.</li>
                <li><strong style={{ color: "var(--text-white)" }}>Live fuel prices</strong> from 8,300+ UK forecourts.</li>
                <li><strong style={{ color: "var(--text-white)" }}>Clean Air Zone &amp; ULEZ</strong> charge detection along your actual route.</li>
              </ul>
            </Card>
          </div>
        </section>

        {/* Where it is now */}
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container" style={wrap}>
            <SectionHead
              label="Where it is now"
              title="Live, and tracking real miles every day"
            />
            <P>
              As of June 2026, <strong style={{ color: "var(--text-white)" }}>249 drivers have logged
              6,121 trips and 82,924 miles across 462 shifts</strong> - 46,673 of those miles tagged as
              business, the ones that turn into tax relief. The app is live on the App Store and keeps
              improving, with reliability fixes shipped straight from driver reports.
            </P>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.25rem", alignItems: "center" }}>
              <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="hero__cta">
                Download on the App Store
                <span className="hero__cta-arrow" aria-hidden="true">&rarr;</span>
              </a>
              <a
                href="/register"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontFamily: "var(--font-display)",
                  fontSize: "1.0625rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  padding: "0.9rem 1.75rem",
                  borderRadius: "var(--r-md)",
                  border: "1px solid var(--border-strong)",
                  textDecoration: "none",
                }}
              >
                Start tracking free
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
