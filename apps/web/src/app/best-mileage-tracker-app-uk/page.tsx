import { ANDROID_PLATFORMS_CELL, ANDROID_FAQ_ANSWER, ANDROID_OS_SCHEMA } from "@/data/android";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import StoreButtons from "@/components/StoreButtons";

// Competitor facts on this page were checked on each vendor's own site on
// CHECKED_ON. When you re-check, update CHECKED_ON, LAST_REVIEWED, the
// dateModified in pageSchema and the SOURCES list together.
const CHECKED_ON = "2 October 2026";
const LAST_REVIEWED = "October 2026";
const DATE_MODIFIED = "2026-10-02";
const PAGE_URL = "https://mileclear.com/best-mileage-tracker-app-uk";
const APP_LINK = "/app?from=seo-best";

const TITLE = "Best Mileage Tracker App UK (2026): Free Apps Compared";
const DESCRIPTION =
  "Five mileage tracker apps compared for UK drivers: free trip limits, prices, iPhone and Android, and 45p or 55p rates by tax year. Checked October 2026.";

export const metadata: Metadata = {
  // absolute: skip the "| MileClear" template so the tab title stays under 60 characters.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "best mileage tracker app uk",
    "best free mileage tracker app uk",
    "what is the best app for mileage tracking",
    "best free mileage tracker app for android",
    "apps to track mileage for business",
    "mileage tracker comparison uk",
  ],
  alternates: {
    canonical: PAGE_URL,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: PAGE_URL,
    type: "article",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/branding/og-image.png"],
  },
};

// ── Content ──────────────────────────────────────────────────────────

type AppKey = "mc" | "triplog" | "mileiq" | "driversnote" | "everlance";

const APPS: Array<{ key: AppKey; name: string; url: string }> = [
  { key: "mc", name: "MileClear", url: "https://mileclear.com" },
  { key: "triplog", name: "TripLog", url: "https://www.triplog.net" },
  { key: "mileiq", name: "MileIQ", url: "https://mileiq.com/en-gb" },
  { key: "driversnote", name: "Driversnote", url: "https://www.driversnote.co.uk" },
  { key: "everlance", name: "Everlance", url: "https://www.everlance.com" },
];

const ROWS: Array<{ feature: string } & Record<AppKey, string>> = [
  {
    feature: "Free plan limit",
    mc: "Unlimited trips",
    triplog: "Unlimited automatic tracking (Basic plan)",
    mileiq: "40 drives a month",
    driversnote: "15 trips a month",
    everlance: "30 automatic trips a month (manual trips unlimited)",
  },
  {
    feature: "Paid plan (as published)",
    mc: "Pro £4.99 a month; £44.99 a year in the iPhone app",
    triplog: "Premium $59.99 a year (US dollars on the pricing page)",
    mileiq: "£9.49 a month, or £7.91 a month billed yearly",
    driversnote: "Pro £8 a month (shown excluding VAT)",
    everlance: "Starter $8.99 a month or $69.99 a year (US dollars only)",
  },
  {
    feature: "Automatic tracking on the free plan",
    mc: "Yes",
    triplog: "Yes",
    mileiq: "Yes, up to the 40-drive limit",
    driversnote: "Listed on the free plan",
    everlance: "Yes, up to 30 trips",
  },
  {
    feature: "iPhone and Android",
    mc: `${ANDROID_PLATFORMS_CELL} (Android: UK Google Play)`,
    triplog: "iOS and Android",
    mileiq: "iOS and Android",
    driversnote: "iOS, Android and web",
    everlance: "iOS and Android",
  },
  {
    feature: "UK mileage rates",
    mc: "45p/25p for trips to 5 April 2026, 55p/25p from 6 April 2026, picked by tax year",
    triplog: "Says it applies new rates automatically; custom rates are a Premium feature",
    mileiq: "UK business rate can be edited in settings",
    driversnote: "\"Local and custom rates\" listed",
    everlance: "Not stated on its pricing page (prices shown in US dollars)",
  },
  {
    feature: "Reports and exports",
    mc: "Totals free in the app; CSV and PDF exports are Pro",
    triplog: "Unlimited reporting needs Premium or a 7-day pass",
    mileiq: "Auto-generated reports on both plans",
    driversnote: "Reports for up to 15 trips a month free",
    everlance: "Advanced reporting on paid plans",
  },
  {
    feature: "Self Assessment help",
    mc: "Free walkthrough mapping figures to SA103 boxes; the PDF is Pro",
    triplog: "None listed on pricing page",
    mileiq: "None listed on pricing page",
    driversnote: "None listed on pricing page",
    everlance: "US tax filing on paid plans (not UK)",
  },
];

const SOURCES: Array<{ label: string; href: string }> = [
  { label: "MileIQ UK pricing", href: "https://mileiq.com/en-gb/pricing" },
  {
    label: "MileIQ help: How to edit the Business Rate and Distance Unit (UK)",
    href: "https://support.mileiq.com/hc/en-us/articles/217743323-How-to-edit-the-Business-Rate-and-Distance-Unit-UK",
  },
  { label: "Driversnote UK pricing", href: "https://www.driversnote.co.uk/pricing" },
  { label: "TripLog pricing", href: "https://www.triplog.net/pricing" },
  { label: "TripLog: 2026 UK mileage rate update explained", href: "https://www.triplog.net/uk/blog/uk-mileage-rate-update-explained" },
  { label: "Everlance pricing", href: "https://www.everlance.com/pricing" },
  { label: "Everlance help: Everlance for the UK", href: "https://help.everlance.com/hc/en-us/articles/45327097502491-Everlance-for-the-UK" },
];

// One list drives both the visible FAQ and the FAQPage schema, so they cannot drift.
const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is the best free mileage tracker app in the UK?",
    a: "If you want to track every trip without paying, MileClear and TripLog are the two apps here with no limit on free tracking. MileClear is built for the UK: it works out your mileage deduction at 45p or 55p a mile depending on the tax year, and its Self Assessment walkthrough is free. TripLog is a US company; its free Basic plan tracks unlimited miles, but unlimited reporting and custom mileage rates need Premium. MileIQ (40 drives a month), Everlance (30 automatic trips) and Driversnote (15 trips) cap their free plans. Plans checked on " + CHECKED_ON + ".",
  },
  {
    q: "What is the best app for tracking mileage?",
    a: "It depends on how much you drive. For a few business trips a month, any of MileIQ, Driversnote or Everlance will do on their free plans. For daily driving, such as delivery or private hire, you need unlimited free tracking or a paid plan: MileClear and TripLog track without a limit for free, and MileIQ Unlimited is £9.49 a month (or £7.91 a month billed yearly) on its UK pricing page.",
  },
  {
    q: "What is the best free mileage tracker app for Android?",
    a: "MileClear, TripLog, MileIQ, Driversnote and Everlance are all on Google Play. MileClear and TripLog are the two with unlimited free tracking. MileClear's Android app is on Google Play in the UK, uses the same account as the iPhone app, and is newer than the iPhone version, which launched first.",
  },
  {
    q: "Which mileage tracker is best for Uber, Deliveroo or Amazon Flex drivers?",
    a: "A delivery or private-hire driver can make 15 to 40 trips in a few days, so a capped free plan runs out quickly. Look for unlimited free tracking, UK rates by tax year, and a way to tag each trip to the platform it was for. MileClear does all three on the free plan and tags trips to Uber, Deliveroo, Amazon Flex, Just Eat, Evri, DPD, Stuart and other platforms.",
  },
  {
    q: "Which app is best if I claim mileage from my employer?",
    a: "If your employer already uses a team product such as Driversnote Teams, MileIQ or TripLog, use what they use so your claims land in their system. If you claim on your own, MileClear lets you enter the per-mile rate your employer pays and shows the gap up to the 55p AMAP rate, which you may be able to claim as Mileage Allowance Relief. The CSV and PDF claim exports are part of Pro.",
  },
  {
    q: "Do I need an app to claim mileage in the UK?",
    a: "No. HMRC does not require a particular app. You need a record of each business journey: the date, where you went, why, and the miles. A notebook or spreadsheet works if you fill it in every time. An app's advantage is that it records journeys you would otherwise forget to write down.",
  },
  {
    q: "How much does MileClear cost?",
    a: "Tracking is free with no trip limit. The deduction calculator, Tax Readiness card, Self Assessment walkthrough, expenses and receipt scanning are free too. The free plan covers one vehicle and two saved locations. Pro is £4.99 a month (the iPhone app also offers £44.99 a year) and adds CSV and PDF exports, the Self Assessment PDF, business insights, unlimited vehicles and other tools.",
  },
  {
    q: "Does MileClear work on Android?",
    a: ANDROID_FAQ_ANSWER,
  },
];

// ── Structured data ──────────────────────────────────────────────────

const pageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: TITLE,
  url: PAGE_URL,
  description: DESCRIPTION,
  dateModified: DATE_MODIFIED,
  inLanguage: "en-GB",
  publisher: { "@type": "Organization", name: "MileClear", url: "https://mileclear.com" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mileclear.com" },
      { "@type": "ListItem", position: 2, name: "Best Mileage Tracker App UK", item: PAGE_URL },
    ],
  },
};

const itemListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Mileage tracker apps compared for UK drivers (2026)",
  itemListOrder: "https://schema.org/ItemListUnordered",
  numberOfItems: APPS.length,
  itemListElement: APPS.map((app, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: {
      "@type": "SoftwareApplication",
      name: app.name,
      url: app.url,
      applicationCategory: "FinanceApplication",
      operatingSystem: app.key === "mc" ? ANDROID_OS_SCHEMA : "iOS, Android",
    },
  })),
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

// ── Styles ───────────────────────────────────────────────────────────

const cardStyle = {
  background: "rgba(15,23,42,0.6)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: 14,
  padding: "1.5rem",
} as const;

const h2Style = {
  fontFamily: "var(--font-display)",
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#f9fafb",
  marginBottom: "1.25rem",
} as const;

const pStyle = { color: "#94a3b8", lineHeight: 1.8, marginBottom: "1rem" } as const;
const strong = { color: "#e2e8f0" } as const;
const linkStyle = { color: "#fbbf24", textDecoration: "underline" } as const;

const thBase = {
  textAlign: "left" as const,
  padding: "0.875rem 1rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
};

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} style={linkStyle}>
      {children}
    </a>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} style={{ maxWidth: 760, marginBottom: "3.5rem" }}>
      <h2 id={id} style={h2Style}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function BestMileageTrackerAppUK() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      <Navbar />

      <main style={{ background: "#030712", paddingTop: "6rem", paddingBottom: "5rem" }}>
        <div className="container">
          {/* Hero */}
          <header style={{ maxWidth: 800, marginBottom: "2.5rem" }}>
            <span className="label" style={{ display: "inline-block", marginBottom: "1rem" }}>
              Comparison · Last reviewed: {LAST_REVIEWED}
            </span>
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
              Best Mileage Tracker App UK (2026)
            </h1>
            <p style={{ fontSize: "1.125rem", color: "#94a3b8", lineHeight: 1.75, maxWidth: 720 }}>
              Five mileage tracker apps UK drivers often compare, set side by side on the things that decide
              which one suits you: how many trips the free plan covers, what the paid plan costs, whether it
              runs on your phone, and whether it uses the right UK mileage rate for each tax year. Competitor
              plans were checked on their own websites on {CHECKED_ON}.
            </p>
          </header>

          {/* Quick answer */}
          <section
            aria-labelledby="quick-answer"
            style={{
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.15)",
              borderRadius: 14,
              padding: "1.75rem",
              marginBottom: "2rem",
              maxWidth: 800,
            }}
          >
            <h2 id="quick-answer" style={{ ...h2Style, fontSize: "1.125rem", marginBottom: "0.75rem", color: "#fbbf24" }}>
              Quick answer: the best free mileage tracker app in the UK
            </h2>
            <p style={{ color: "#cbd5e1", lineHeight: 1.8, marginBottom: "0.75rem" }}>
              If you drive for work most days, choose an app with <strong>no limit on free tracking</strong>:{" "}
              <strong>MileClear</strong> (our app, built for UK drivers, on iPhone and Android, works out your
              deduction at 45p or 55p a mile by tax year) or <strong>TripLog</strong> (US-based, unlimited free
              tracking, but unlimited reports and custom rates need Premium). If you only make a handful of
              business trips a month, the free plans of <strong>MileIQ</strong> (40 drives),{" "}
              <strong>Everlance</strong> (30 automatic trips) or <strong>Driversnote</strong> (15 trips) may be
              enough. If your employer already uses one of these for claims, use theirs.
            </p>
            <p style={{ color: "#94a3b8", lineHeight: 1.7, fontSize: "0.9rem" }}>
              Skip to: <A href="#best-free">best free</A> · <A href="#gig">gig and delivery drivers</A> ·{" "}
              <A href="#employees">employees</A> · <A href="#android">Android</A> · <A href="#faq">FAQs</A>
            </p>
          </section>

          {/* How we compared */}
          <section aria-labelledby="how-compared" style={{ ...cardStyle, maxWidth: 800, marginBottom: "3.5rem" }}>
            <h2 id="how-compared" style={{ ...h2Style, fontSize: "1.0625rem", marginBottom: "0.5rem" }}>
              How we compared
            </h2>
            <p style={{ color: "#94a3b8", lineHeight: 1.7, fontSize: "0.9375rem" }}>
              MileClear is our app, so read this with that in mind. Every competitor fact below comes from the
              vendor&apos;s own pricing or help pages (UK pages where they publish one), checked on {CHECKED_ON};
              the sources are listed at the bottom. Prices are shown in the currency the vendor publishes. Plans
              change, so check the vendor&apos;s site before you subscribe. Where we could not confirm something
              on a vendor&apos;s own site, we say so rather than guess.
            </p>
          </section>

          {/* Comparison table */}
          <section aria-labelledby="table-heading" style={{ marginBottom: "3.5rem" }}>
            <h2 id="table-heading" style={h2Style}>
              Mileage tracker apps compared
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  minWidth: 860,
                  borderCollapse: "collapse",
                  background: "rgba(15,23,42,0.6)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <th scope="col" style={{ ...thBase, color: "#64748b", width: "16%" }}>
                      Feature
                    </th>
                    {APPS.map((app) => (
                      <th
                        key={app.key}
                        scope="col"
                        style={{ ...thBase, color: app.key === "mc" ? "#fbbf24" : "#94a3b8", width: "16.8%" }}
                      >
                        {app.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r, i) => (
                    <tr
                      key={r.feature}
                      style={{ borderBottom: i < ROWS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : undefined }}
                    >
                      <th
                        scope="row"
                        style={{ padding: "0.875rem 1rem", color: "#e2e8f0", fontSize: "0.85rem", fontWeight: 600, textAlign: "left" }}
                      >
                        {r.feature}
                      </th>
                      {APPS.map((app) => (
                        <td
                          key={app.key}
                          style={{
                            padding: "0.875rem 1rem",
                            color: app.key === "mc" ? "#e2e8f0" : "#94a3b8",
                            fontSize: "0.825rem",
                            lineHeight: 1.5,
                            verticalAlign: "top",
                          }}
                        >
                          {r[app.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.75rem" }}>
              Competitor plans checked on {CHECKED_ON} on each vendor&apos;s own site. &quot;None listed&quot;
              means we did not find it on the vendor&apos;s pricing page, not that it can never exist.
            </p>
          </section>

          <Section id="best-free" title="Best free mileage tracker app">
            <p style={pStyle}>
              &quot;Free&quot; means different things on each app. On MileIQ, Everlance and Driversnote, the free
              plan stops at a monthly number of trips (40, 30 automatic, and 15). That suits someone who drives
              for work once or twice a week. A delivery driver, private-hire driver or field engineer will pass
              those limits within days, and a journey that is not recorded is a deduction you cannot easily prove.
            </p>
            <p style={pStyle}>
              <strong style={strong}>MileClear</strong> and <strong style={strong}>TripLog</strong> both track
              without a limit for free. The difference is what else comes free. On MileClear the running mileage
              deduction, the Tax Readiness estimate and the Self Assessment walkthrough are free; CSV and PDF
              exports are part of Pro (£4.99 a month). On TripLog, unlimited reporting needs Premium or one of
              its 7-day passes, and custom mileage rates are listed as a Premium feature.
            </p>
            <p style={pStyle}>
              The rate matters too. For cars and vans, the{" "}
              <A href="/hmrc-mileage-rates">HMRC mileage rate</A> is 55p a mile for the first 10,000 business
              miles from 6 April 2026 (it was 45p before), then 25p. A trip on 1 April 2026 belongs to the
              2025-26 tax year at 45p; a trip on 10 April 2026 is 2026-27 at 55p. MileClear picks the rate from
              each trip&apos;s date, so 8,000 business miles in 2026-27 comes to £4,400. For more on what the
              free plan includes, see our <A href="/free-mileage-tracker-uk">free mileage tracker</A> page.
            </p>
          </Section>

          <Section id="gig" title="Best mileage tracker for gig and delivery drivers">
            <p style={pStyle}>
              Gig work means many short trips, several platforms, and a Self Assessment return at the end of the
              year. Three things help: no cap on free tracking, UK rates by tax year, and a way to tag each trip
              to the platform it was for, so you can see which platform pays best once miles are counted.
            </p>
            <p style={pStyle}>
              MileClear tags trips to Uber, Deliveroo, Amazon Flex, Just Eat, Evri, DPD, Stuart and other
              platforms on the free plan, and groups trips into shifts. Earnings can be added by hand for free;
              bank and CSV earnings import are Pro. Guides for specific platforms:{" "}
              <A href="/amazon-flex-mileage-tracker">Amazon Flex</A>, <A href="/uber-mileage-tracker">Uber</A>,{" "}
              <A href="/just-eat-mileage-tracker">Just Eat</A>, <A href="/evri-mileage-tracker">Evri</A>,{" "}
              <A href="/dpd-mileage-tracker">DPD</A> and{" "}
              <A href="/delivery-driver-mileage-tracker">delivery drivers in general</A>.
            </p>
          </Section>

          <Section id="employees" title="Best for employees claiming mileage from an employer">
            <p style={pStyle}>
              If your employer already uses a team product (Driversnote Teams, MileIQ or TripLog all sell one),
              use the app they use: your claims go straight into their approval process, and that matters more
              than any feature difference.
            </p>
            <p style={pStyle}>
              If you claim on your own, MileClear lets you enter the per-mile rate your employer pays. When that
              is below the 55p AMAP rate, it shows the difference, which you may be able to claim back from HMRC
              as <A href="/mileage-allowance-relief">Mileage Allowance Relief</A>. The CSV and PDF exports you
              would attach to a claim are part of Pro. More detail on our{" "}
              <A href="/employee-mileage-tracker">mileage tracker for employees</A> page.
            </p>
          </Section>

          <Section id="android" title="Best free mileage tracker app for Android">
            <p style={pStyle}>
              All five apps here are on Google Play. MileClear and TripLog are the two with unlimited free
              tracking on Android. MileClear&apos;s Android app is on Google Play in the UK and uses the same
              account as the iPhone app, so your trips follow you if you switch phones. It is newer than the
              iPhone app, which launched first. Details and setup tips are on our <A href="/android">Android</A>{" "}
              page.
            </p>
          </Section>

          <Section id="no-app" title="Do you need an app at all?">
            <p style={pStyle}>
              No. HMRC does not require any particular app. You need a record of each business journey: the date,
              start and end points, the reason, and the miles. A notebook or spreadsheet does the job if you fill
              it in every time. Most people use an app because it records the journeys they would forget to write
              down, and adds up the deduction for them.
            </p>
          </Section>

          {/* Per-app notes */}
          <section aria-labelledby="verdicts-heading" style={{ marginBottom: "3.5rem" }}>
            <h2 id="verdicts-heading" style={h2Style}>
              Each app in brief
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 800 }}>
              {[
                {
                  name: "MileClear",
                  tag: "Suits UK drivers who drive for work most days",
                  body: "Our app. Unlimited free tracking on iPhone and Android, UK rates by tax year, gig-platform tagging, and a free Self Assessment walkthrough. Limits on the free plan: one vehicle, two saved locations, and no CSV or PDF exports. Pro is £4.99 a month. It is a young app from a small UK team, which is worth knowing next to longer-established names.",
                },
                {
                  name: "TripLog",
                  tag: "Unlimited free tracking from a US company",
                  body: "The Basic plan tracks unlimited miles for free. Unlimited reporting, the web app and custom mileage rates are Premium ($59.99 a year as published in US dollars). Its UK blog says it applies new mileage rates automatically.",
                },
                {
                  name: "MileIQ",
                  tag: "Long-established, 40 free drives a month",
                  body: "Free for 40 drives a month. MileIQ Unlimited is £9.49 a month, or £7.91 a month billed yearly, on its UK pricing page. UK users can edit the business rate in settings.",
                },
                {
                  name: "Driversnote",
                  tag: "Simple, UK pricing, 15 free trips a month",
                  body: "Free for up to 15 trips a month; Pro is £8 a month (shown excluding VAT) on its UK pricing page. Strong team features if your employer runs mileage claims through it.",
                },
                {
                  name: "Everlance",
                  tag: "US-focused, 30 free automatic trips a month",
                  body: "Free for 30 automatic trips a month with unlimited manual trips. Prices are published in US dollars only.",
                },
              ].map((v, i) => (
                <div
                  key={v.name}
                  style={{
                    ...cardStyle,
                    borderColor: i === 0 ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.07)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                    <h3 style={{ fontSize: "1.0625rem", fontWeight: 700, color: i === 0 ? "#fbbf24" : "#e2e8f0" }}>{v.name}</h3>
                    <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{v.tag}</span>
                  </div>
                  <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>{v.body}</p>
                </div>
              ))}
            </div>
            <p style={{ ...pStyle, marginTop: "1.25rem", maxWidth: 760 }}>
              Comparing two apps directly? See <A href="/mileclear-vs-mileiq">MileClear vs MileIQ</A>, the{" "}
              <A href="/mileiq-alternative-uk">MileIQ alternative</A> page and the{" "}
              <A href="/driversnote-alternative">Driversnote alternative</A> page.
            </p>
          </section>

          {/* FAQ */}
          <section aria-labelledby="faq" style={{ maxWidth: 760, marginBottom: "3.5rem" }}>
            <h2 id="faq" style={h2Style}>
              Frequently asked questions
            </h2>
            {FAQS.map(({ q, a }, i, arr) => (
              <div
                key={q}
                style={{
                  borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                  paddingBottom: "1.25rem",
                  marginBottom: "1.25rem",
                }}
              >
                <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "0.5rem" }}>{q}</h3>
                <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.7 }}>{a}</p>
              </div>
            ))}
          </section>

          {/* Sources */}
          <section aria-labelledby="sources" style={{ maxWidth: 760, marginBottom: "3.5rem" }}>
            <h2 id="sources" style={{ ...h2Style, fontSize: "1.125rem", marginBottom: "0.75rem" }}>
              Sources (checked {CHECKED_ON})
            </h2>
            <ul style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: 1.8, paddingLeft: "1.25rem", listStyle: "disc" }}>
              {SOURCES.map((s) => (
                <li key={s.href}>
                  <a href={s.href} rel="nofollow noopener noreferrer" target="_blank" style={{ color: "#94a3b8", textDecoration: "underline" }}>
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {/* Related links */}
          <section style={{ marginBottom: "3.5rem" }}>
            <h2 style={{ ...h2Style, fontSize: "1.125rem", marginBottom: "1rem" }}>More comparisons and guides</h2>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              {[
                { href: "/free-mileage-tracker-uk", label: "Free Mileage Tracker UK" },
                { href: "/mileclear-vs-mileiq", label: "MileClear vs MileIQ" },
                { href: "/mileiq-alternative-uk", label: "MileIQ Alternative UK" },
                { href: "/driversnote-alternative", label: "Driversnote Alternative" },
                { href: "/android", label: "MileClear on Android" },
                { href: "/hmrc-mileage-rates", label: "HMRC Mileage Rates" },
                { href: "/employee-mileage-tracker", label: "For Employees" },
                { href: "/self-employed-mileage-tracker", label: "For the Self-Employed" },
                { href: "/delivery-driver-mileage-tracker", label: "Delivery Drivers" },
              ].map(({ href, label }) => (
                <a
                  key={href}
                  href={href}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#94a3b8",
                    fontSize: "0.875rem",
                    padding: "0.5rem 1rem",
                    borderRadius: 9999,
                    display: "inline-block",
                  }}
                >
                  {label}
                </a>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section
            style={{
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.15)",
              borderRadius: 16,
              padding: "2.5rem 1.25rem",
              textAlign: "center",
            }}
          >
            <h2 style={{ ...h2Style, fontSize: "1.5rem", marginBottom: "0.75rem" }}>Try MileClear free</h2>
            <p style={{ color: "#94a3b8", fontSize: "1rem", lineHeight: 1.7, maxWidth: 540, margin: "0 auto 1.5rem" }}>
              Unlimited trip tracking on iPhone and Android, with your deduction worked out at the rate for each
              tax year. Pro is optional at £4.99 a month.
            </p>
            <a
              href={APP_LINK}
              style={{
                background: "#fbbf24",
                color: "#030712",
                fontWeight: 700,
                fontSize: "1rem",
                padding: "0.85rem 2rem",
                borderRadius: 9999,
                display: "inline-block",
                marginBottom: "1.25rem",
              }}
            >
              Get the app
            </a>
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
              <StoreButtons align="center" />
              <a
                href="/pricing"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "#e2e8f0",
                  fontWeight: 600,
                  fontSize: "0.9375rem",
                  padding: "0.75rem 1.75rem",
                  borderRadius: 9999,
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "inline-block",
                }}
              >
                See pricing
              </a>
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
