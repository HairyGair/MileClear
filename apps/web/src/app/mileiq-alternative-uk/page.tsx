import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6759671005";
const URL = "https://mileclear.com/mileiq-alternative-uk";

export const metadata: Metadata = {
  title: "The Best MileIQ Alternative for UK Drivers (Free) — MileClear",
  description:
    "Looking for a MileIQ alternative in the UK? MileClear tracks unlimited drives free, uses HMRC's 55p rate natively, tags Uber and Deliveroo trips, and works offline — no 40-drive cap, no price hike.",
  keywords: [
    "mileiq alternative uk",
    "mileiq alternative",
    "free mileiq alternative",
    "best mileage tracker uk",
    "hmrc mileage tracker",
  ],
  alternates: { canonical: URL },
  openGraph: {
    title: "The Best MileIQ Alternative for UK Drivers (Free)",
    description:
      "MileClear is the UK-native MileIQ alternative: unlimited free tracking, HMRC 55p rates, gig-platform tagging, offline-first.",
    url: URL,
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Best MileIQ Alternative for UK Drivers (Free)",
    description:
      "Unlimited free tracking, HMRC 55p rates, gig-platform tagging, offline-first. The UK-native MileIQ alternative.",
    images: ["/branding/og-image.png"],
  },
};

const faqs = [
  {
    q: "What is the best free alternative to MileIQ in the UK?",
    a: "MileClear is built specifically for UK drivers and tracks unlimited business drives for free — there is no 40-drive monthly cap like MileIQ's free tier. It applies HMRC's Approved Mileage Allowance Payment rates by default (55p per mile for the first 10,000 business miles from 6 April 2026, then 25p), tags gig platforms like Uber, Deliveroo and Amazon Flex, and records trips offline. Pro is £4.99/month only if you want HMRC-ready exports and Self Assessment tooling.",
  },
  {
    q: "Why are people switching from MileIQ?",
    a: "MileIQ raised its price in 2026 (its monthly plan moved to roughly $8.99), and its free tier stops at 40 drives a month. It is also US-first, so it does not natively understand HMRC's two-tier 10,000-mile split or UK gig platforms. UK drivers switch to get unlimited free tracking and HMRC-native calculations without paying a US-priced subscription.",
  },
  {
    q: "Does MileClear calculate HMRC mileage for me?",
    a: "Yes. MileClear applies the correct AMAP rate to every trip automatically by its date — 55p per mile for the first 10,000 business miles in 2026-27, 25p after that, and 24p flat for motorbikes. It keeps a running deduction total you can export for Self Assessment.",
  },
  {
    q: "Can I import my MileIQ history into MileClear?",
    a: "MileClear starts tracking automatically the moment you install it, and you can add past trips manually with their date, route and mileage. There is no automated MileIQ import yet, but most drivers simply start fresh and add any historic business trips by hand.",
  },
  {
    q: "Is MileClear available on Android?",
    a: "MileClear is on iPhone and iPad today, with Android on the roadmap. If you are on Android, you can register your interest so we can let you know when it launches.",
  },
];

const rows: [string, string, string][] = [
  ["Free tier", "Unlimited drives, forever", "40 drives / month, then paid"],
  ["Headline price", "Free · Pro £4.99/mo or £44.99/yr", "~$8.99/mo (raised in 2026)"],
  ["HMRC-native (55p, 10k split)", "Yes — built in, tax-year aware", "No — US flat-rate logic"],
  ["Gig-platform tagging", "Uber, Deliveroo, Just Eat, Amazon Flex, DPD, Evri…", "No"],
  ["Works offline", "Yes — offline-first", "Limited"],
  ["Self Assessment export", "PDF + CSV (SA103 wizard)", "Reports (US-oriented)"],
  ["Built for", "UK gig & self-employed drivers", "US market"],
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

export default function MileIqAlternativeUk() {
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
        { "@type": "ListItem", position: 2, name: "MileIQ alternative (UK)", item: URL },
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
            <span className="label" style={labelStyle}>MileIQ Alternative</span>
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
              The best MileIQ alternative for UK drivers — and it&rsquo;s free
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 680 }}>
              MileIQ is the name everyone knows, but it was built for the US — and in 2026 it raised its price
              while still capping the free tier at 40 drives a month. MileClear is the UK-native alternative:
              it tracks <strong style={{ color: "#e2e8f0" }}>unlimited drives for free</strong>, applies HMRC&rsquo;s
              new <strong style={{ color: "#e2e8f0" }}>55p</strong> rate automatically, tags your Uber and
              Deliveroo trips, and keeps recording offline. If you drive for work in the UK, those differences
              decide which app is actually usable.
            </p>
            <div style={{ marginTop: "1.75rem" }}>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  background: "var(--amber-400, #fbbf24)",
                  color: "#030712",
                  fontWeight: 700,
                  padding: "0.85rem 1.5rem",
                  borderRadius: 10,
                  textDecoration: "none",
                }}
              >
                Get MileClear free on the App Store
              </a>
            </div>
          </header>

          {/* Comparison table */}
          <section aria-labelledby="cmp" style={{ marginBottom: "4rem" }}>
            <h2 id="cmp" style={h2Style}>MileClear vs MileIQ at a glance</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.85rem 1rem", color: "#94a3b8", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.1)" }} />
                    <th style={{ textAlign: "left", padding: "0.85rem 1rem", color: "var(--amber-400, #fbbf24)", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>MileClear</th>
                    <th style={{ textAlign: "left", padding: "0.85rem 1rem", color: "#94a3b8", fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>MileIQ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(([label, mc, mq]) => (
                    <tr key={label}>
                      <td style={{ padding: "0.85rem 1rem", color: "#cbd5e1", borderBottom: "1px solid rgba(255,255,255,0.05)", fontWeight: 600 }}>{label}</td>
                      <td style={{ padding: "0.85rem 1rem", color: "#e2e8f0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{mc}</td>
                      <td style={{ padding: "0.85rem 1rem", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{mq}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.85rem" }}>
              MileIQ details based on its publicly listed pricing and free-tier limits as of 2026; check MileIQ&rsquo;s
              site for the latest. MileClear figures are our own.
            </p>
          </section>

          {/* Why switch */}
          <section style={{ marginBottom: "4rem", maxWidth: 720 }}>
            <h2 style={h2Style}>Why UK drivers switch from MileIQ to MileClear</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "1.25rem" }}>
              {[
                ["No 40-drive cap.", "Track every business drive, unlimited, on the free tier — you never hit a wall mid-month."],
                ["HMRC rates, done for you.", "The 55p first-10,000-mile rate, the 25p tier, the 24p motorbike rate — applied per trip by date, with a running deduction total for Self Assessment."],
                ["Knows your platforms.", "Tag trips to Uber, Deliveroo, Just Eat, Amazon Flex, DPD or Evri so your business mileage maps to how you actually earn."],
                ["Records offline.", "Trips save to your phone first, so a dead spot or a closed app never loses a journey — then they sync when you&rsquo;re back online."],
                ["UK-priced.", "Free to track. Pro is £4.99/month (or £44.99/year) only if you want HMRC-ready PDF exports and the Self Assessment wizard — not a US subscription to do the basics."],
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
            <h2 style={h2Style}>MileIQ alternative — FAQ</h2>
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
            <h2 style={{ ...h2Style, marginBottom: "0.75rem" }}>Make the switch in minutes</h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.7, marginBottom: "1.5rem" }}>
              Install MileClear, grant location access, and it starts tracking your business miles automatically —
              free, unlimited, HMRC-ready.
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
