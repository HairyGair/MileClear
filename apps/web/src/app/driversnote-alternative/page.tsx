import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6759671005";
const URL = "https://mileclear.com/driversnote-alternative";

export const metadata: Metadata = {
  title: "A Free Driversnote Alternative for UK Drivers — MileClear",
  description:
    "Looking for a Driversnote alternative? MileClear tracks unlimited business drives free with no beacon or hardware, applies HMRC's 55p rate, and tags gig-platform trips — built for UK gig and self-employed drivers.",
  keywords: [
    "driversnote alternative",
    "driversnote alternative uk",
    "free mileage tracker uk",
    "mileage tracker no beacon",
    "hmrc mileage tracker app",
  ],
  alternates: { canonical: URL },
  openGraph: {
    title: "A Free Driversnote Alternative for UK Drivers",
    description:
      "MileClear: unlimited free tracking, HMRC 55p rates, gig-platform tagging, and no beacon hardware to buy.",
    url: URL,
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "A Free Driversnote Alternative for UK Drivers",
    description:
      "Unlimited free tracking, HMRC 55p rates, gig-platform tagging, no beacon. The simpler Driversnote alternative.",
    images: ["/branding/og-image.png"],
  },
};

const faqs = [
  {
    q: "What is the best Driversnote alternative in the UK?",
    a: "MileClear is a strong Driversnote alternative for gig and self-employed drivers who want unlimited tracking without paying. Both apps are UK-native and apply HMRC's AMAP rates, but MileClear tracks unlimited drives on its free tier and needs no beacon or hardware — it uses your phone's GPS and motion sensor (ClearTrack) to detect drives automatically. Pro is £4.99/month only for HMRC-ready exports and Self Assessment tooling.",
  },
  {
    q: "Is MileClear cheaper than Driversnote?",
    a: "For most drivers, yes. Driversnote is a paid-tier-focused product with a limited free allowance, while MileClear keeps unlimited automatic tracking and HMRC calculations on the free tier. You only pay MileClear's £4.99/month (or £44.99/year) if you want PDF/CSV exports, the Self Assessment wizard, or business analytics.",
  },
  {
    q: "Do I need a beacon or any hardware with MileClear?",
    a: "No. MileClear's ClearTrack engine detects your drives automatically using your iPhone's GPS and motion coprocessor — there's no iBeacon or dongle to buy, fit or keep charged. You just drive, and trips appear on their own.",
  },
  {
    q: "Does MileClear handle HMRC mileage like Driversnote?",
    a: "Yes. MileClear applies the correct AMAP rate to every trip by its date — 55p per mile for the first 10,000 business miles from 6 April 2026, then 25p, and 24p flat for motorbikes — and keeps a running deduction total you can export for Self Assessment.",
  },
  {
    q: "Is MileClear available on Android?",
    a: "MileClear is on iPhone and iPad today, with Android on the roadmap. If you're on Android you can register your interest and we'll let you know when it launches.",
  },
];

const rows: [string, string, string][] = [
  ["Free tier", "Unlimited automatic tracking", "Limited free allowance"],
  ["Headline price", "Free · Pro £4.99/mo or £44.99/yr", "Paid-tier focused (among the priciest)"],
  ["Hardware needed", "None — phone GPS + motion", "Optional iBeacon to buy/fit"],
  ["HMRC-native (55p, 10k split)", "Yes", "Yes"],
  ["Gig-platform tagging", "Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri…", "Less gig-verticalised"],
  ["Best fit", "Gig & self-employed drivers", "Employees, teams & fleets"],
];

const labelStyle: React.CSSProperties = { display: "inline-block", marginBottom: "1rem" };
const h2Style: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(1.5rem, 3vw, 2rem)",
  fontWeight: 700,
  color: "#f9fafb",
  marginBottom: "1.25rem",
  letterSpacing: "-0.02em",
};

export default function DriversnoteAlternative() {
  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: metadata.title,
    url: URL,
    description: metadata.description,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
        { "@type": "ListItem", position: 2, name: "Driversnote alternative", item: URL },
      ],
    },
  };
  const faqSchema = {
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Navbar />

      <main style={{ background: "#030712", paddingTop: "6rem", paddingBottom: "5rem" }}>
        <div className="container">
          {/* Hero */}
          <header style={{ maxWidth: 780, marginBottom: "3.5rem" }}>
            <span className="label" style={labelStyle}>Driversnote Alternative</span>
            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(1.875rem, 4vw, 2.75rem)",
                fontWeight: 700,
                lineHeight: 1.12,
                letterSpacing: "-0.03em",
                color: "#f9fafb",
                marginBottom: "1.25rem",
              }}
            >
              A free, no-hardware Driversnote alternative for UK drivers
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              Driversnote is a solid, UK-native mileage tracker — but it&rsquo;s built around a paid subscription
              and an optional iBeacon you have to buy and fit. MileClear gives gig and self-employed drivers the
              same HMRC-native calculations with <strong style={{ color: "#e2e8f0" }}>unlimited free tracking</strong>,
              <strong style={{ color: "#e2e8f0" }}> no hardware</strong>, and tagging built around how you actually
              earn — Uber, Deliveroo, Amazon Flex and the rest. You just drive; trips appear on their own.
            </p>
            <div style={{ marginTop: "1.75rem" }}>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-block", background: "var(--amber-400, #fbbf24)", color: "#030712", fontWeight: 700, padding: "0.85rem 1.5rem", borderRadius: 10, textDecoration: "none" }}
              >
                Get MileClear free on the App Store
              </a>
            </div>
          </header>

          {/* Comparison table */}
          <section aria-labelledby="cmp" style={{ marginBottom: "4rem" }}>
            <h2 id="cmp" style={h2Style}>MileClear vs Driversnote at a glance</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.85rem 1rem", color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.1)" }} />
                    <th style={{ textAlign: "left", padding: "0.85rem 1rem", color: "var(--amber-400, #fbbf24)", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>MileClear</th>
                    <th style={{ textAlign: "left", padding: "0.85rem 1rem", color: "#94a3b8", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>Driversnote</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, mc, dn]) => (
                    <tr key={label}>
                      <td style={{ padding: "0.85rem 1rem", color: "#cbd5e1", borderBottom: "1px solid rgba(255,255,255,0.05)", fontWeight: 600 }}>{label}</td>
                      <td style={{ padding: "0.85rem 1rem", color: "#e2e8f0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{mc}</td>
                      <td style={{ padding: "0.85rem 1rem", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{dn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.85rem" }}>
              Driversnote is a genuine UK-native competitor; details reflect its publicly described pricing and
              features as of 2026 — check Driversnote&rsquo;s site for the latest. MileClear figures are our own.
            </p>
          </section>

          {/* Why choose MileClear */}
          <section style={{ marginBottom: "4rem", maxWidth: 720 }}>
            <h2 style={h2Style}>Where MileClear fits better</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1.25rem" }}>
              {[
                ["Free, unlimited tracking.", "Every business drive, automatically, on the free tier — no monthly allowance to run out of."],
                ["No beacon to buy or charge.", "ClearTrack uses your iPhone's GPS and motion coprocessor to detect drives — there's nothing to fit to your car."],
                ["Built for gig work.", "Tag trips to Uber, Deliveroo, Just Eat, Amazon Flex, DPD or Evri, with per-platform earnings — not just a generic business/personal toggle."],
                ["Same HMRC compliance.", "55p first-10,000-mile rate, 25p after, 24p motorbikes — applied per trip by date, ready for Self Assessment."],
                ["Pay only for exports.", "Tracking and HMRC totals are free. Pro (£4.99/mo) adds PDF/CSV exports, the Self Assessment wizard and analytics — if and when you need them."],
              ].map(([t, d]) => (
                <li key={t}>
                  <span style={{ color: "#f9fafb", fontWeight: 700, fontFamily: "var(--font-display)" }}>{t}</span>{" "}
                  <span style={{ color: "#94a3b8", lineHeight: 1.7 }}>{d}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* FAQ */}
          <section style={{ marginBottom: "3.5rem", maxWidth: 720 }}>
            <h2 style={h2Style}>Driversnote alternative — FAQ</h2>
            <div style={{ display: "grid", gap: "1.5rem" }}>
              {faqs.map((f) => (
                <div key={f.q}>
                  <h3 style={{ color: "#f9fafb", fontFamily: "var(--font-display)", fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.5rem" }}>{f.q}</h3>
                  <p style={{ color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section style={{ textAlign: "center", padding: "2.5rem 1.5rem", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, maxWidth: 720, margin: "0 auto" }}>
            <h2 style={{ ...h2Style, marginBottom: "0.75rem" }}>Try the free alternative</h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.7, marginBottom: "1.5rem" }}>
              Install MileClear, grant location access, and it tracks your business miles automatically — free,
              unlimited, no hardware, HMRC-ready.
            </p>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", background: "var(--amber-400, #fbbf24)", color: "#030712", fontWeight: 700, padding: "0.85rem 1.75rem", borderRadius: 10, textDecoration: "none" }}
            >
              Download free on the App Store
            </a>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
