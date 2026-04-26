import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import "./design.css";

export const metadata: Metadata = {
  title: "Design System",
  description:
    "Midnight Utility - the MileClear design system. Colour, typography, spacing, components, voice and tone. The reference for anything we ship.",
  alternates: {
    canonical: "https://mileclear.com/design",
  },
  openGraph: {
    title: "Design System | MileClear",
    description:
      "Midnight Utility - the MileClear design system. Colour, typography, spacing, components, voice and tone.",
    url: "https://mileclear.com/design",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
};

const colourTokens = [
  { token: "--bg-deep", value: "#030712", use: "Primary app background." },
  { token: "--bg-primary", value: "#060a16", use: "Slightly elevated page bg." },
  { token: "--bg-secondary", value: "#0a1020", use: "Cards at rest on web." },
  { token: "--bg-card-solid", value: "#0a1120", use: "Solid mobile cards & form fields." },
  { token: "--amber-300", value: "#fcd34d", use: "Highlight text in dense UI." },
  { token: "--amber-400", value: "#fbbf24", use: "Web primary accent." },
  { token: "--amber-500", value: "#eab308", use: "Hover / pressed state." },
  { token: "--amber-600", value: "#ca8a04", use: "Deepest amber - rare." },
  { token: "amber (mobile)", value: "#f5a623", use: "Canonical brand amber. Mobile + brand assets." },
  { token: "--emerald-400", value: "#34d399", use: "Active shift highlight." },
  { token: "--emerald-500", value: "#10b981", use: "Success, positive deltas." },
  { token: "red", value: "#ef4444", use: "Destructive, errors, sync failures." },
  { token: "--text-white", value: "#f9fafb", use: "Hero type, primary headings." },
  { token: "--text-primary", value: "#e2e8f0", use: "Body copy." },
  { token: "--text-secondary", value: "#94a3b8", use: "Descriptions, muted labels." },
  { token: "--text-muted", value: "#64748b", use: "Metadata, footer links." },
  { token: "--text-faint", value: "#475569", use: "Disabled states, placeholders." },
];

const transparencies = [
  { token: "--border-subtle", value: "rgba(255,255,255,0.04)", use: "Barely-there dividers." },
  { token: "--border-default", value: "rgba(255,255,255,0.07)", use: "Card borders, table rows." },
  { token: "--border-strong", value: "rgba(255,255,255,0.12)", use: "Focused / hovered." },
  { token: "--amber-glow", value: "rgba(234,179,8,0.10)", use: "Soft amber wash behind hero." },
  { token: "--amber-glow-md", value: "rgba(234,179,8,0.18)", use: "Hero hover, Pro fill." },
  { token: "--amber-glow-strong", value: "rgba(234,179,8,0.30)", use: "Premium highlights." },
  { token: "--emerald-glow", value: "rgba(16,185,129,0.12)", use: "Active shift cards." },
];

const spacingScale = [
  { name: "xs", value: 4 },
  { name: "sm", value: 8 },
  { name: "md", value: 12 },
  { name: "lg", value: 16 },
  { name: "xl", value: 20 },
  { name: "xxl", value: 24 },
  { name: "xxxl", value: 32 },
];

const radiusScale = [
  { name: "sm", value: 10 },
  { name: "md", value: 14 },
  { name: "lg", value: 22 },
  { name: "xl", value: 32 },
  { name: "full", value: 9999, displayLabel: "9999 (pill)" },
];

const voicePairs = [
  {
    do: "You've claimed £1,234 this tax year.",
    dont: "Total deduction accrued in the 2025/26 fiscal year.",
  },
  {
    do: "Free - forever. No card needed.",
    dont: "Start your complimentary trial today!",
  },
  {
    do: "Start shift",
    dont: "Begin Tracking My Driving Session",
  },
  {
    do: "Pro (£4.99/mo) unlocks PDF and CSV exports.",
    dont: "Upgrade to unlock the full power of MileClear.",
  },
];

export default function DesignSystemPage() {
  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: "Design System", path: "/design" }]} />
      <Navbar />

      <main className="ds-main">
        <div className="container">
          {/* Hero */}
          <header className="ds-hero">
            <span className="ds-hero__eyebrow">Design System</span>
            <h1 className="ds-hero__title">
              <em>Midnight Utility</em>
              <br />
              the MileClear design system.
            </h1>
            <p className="ds-hero__lede">
              Dark, dense, confident. Built for drivers who want clarity over
              decoration. Anything that ships on mileclear.com, in the iOS app, or
              on the App Store traces back to here.
            </p>
          </header>

          {/* Colour */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">01 / Colour</span>
              <h2 className="ds-section__title">Canonical palette</h2>
              <p className="ds-section__desc">
                Amber is premium. Emerald is live. Red is destructive. Anything
                outside those three is structural - background, border, or text.
              </p>
            </header>

            <div className="ds-swatches">
              {colourTokens.map((c) => (
                <article key={c.token + c.value} className="ds-swatch">
                  <span
                    className="ds-swatch__chip"
                    style={{ background: c.value }}
                    aria-hidden
                  />
                  <div className="ds-swatch__meta">
                    <code className="ds-swatch__token">{c.token}</code>
                    <code className="ds-swatch__value">{c.value}</code>
                    <p className="ds-swatch__use">{c.use}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Transparencies */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">02 / Surfaces</span>
              <h2 className="ds-section__title">Borders and glows</h2>
              <p className="ds-section__desc">
                Translucent layers do the work that drop shadows do elsewhere.
                Backgrounds glow; cards never lift.
              </p>
            </header>

            <div className="ds-swatches">
              {transparencies.map((c) => (
                <article key={c.token} className="ds-swatch">
                  <span className="ds-swatch__chip ds-swatch__chip--checker" aria-hidden>
                    <span
                      style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        background: c.value,
                      }}
                    />
                  </span>
                  <div className="ds-swatch__meta">
                    <code className="ds-swatch__token">{c.token}</code>
                    <code className="ds-swatch__value">{c.value}</code>
                    <p className="ds-swatch__use">{c.use}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Typography */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">03 / Typography</span>
              <h2 className="ds-section__title">Sora &amp; Outfit on the web</h2>
              <p className="ds-section__desc">
                Sora is geometric and a touch sharp - good for headlines. Outfit
                is neutral and readable at body sizes. Mobile uses Plus Jakarta
                Sans because loading two on-device costs too much.
              </p>
            </header>

            <article className="ds-type">
              <div className="ds-type__label">Hero - Sora 700, clamp 2.5/4rem</div>
              <p className="ds-type__sample--hero">
                Track every mile. <em>Keep every penny.</em>
              </p>
            </article>

            <article className="ds-type">
              <div className="ds-type__label">Heading - Sora 700, clamp 2/3rem</div>
              <p className="ds-type__sample--heading">
                A strong technical foundation.
              </p>
            </article>

            <article className="ds-type">
              <div className="ds-type__label">H2 section - Sora 700, clamp 1.5/2rem</div>
              <p className="ds-type__sample--h2">
                How auto detection works
              </p>
            </article>

            <article className="ds-type">
              <div className="ds-type__label">Subtext - Outfit 400, clamp 1/1.125rem</div>
              <p className="ds-type__sample--sub">
                MileClear records your mileage in the background and groups trips
                into shifts so your HMRC deduction adds up by itself.
              </p>
            </article>

            <article className="ds-type">
              <div className="ds-type__label">Body - Outfit 400, 1rem / 1.65</div>
              <p className="ds-type__sample--body">
                The £4.99/month Pro plan unlocks PDF and CSV exports for your
                Self Assessment, plus earnings tracking by platform. Free covers
                unlimited tracking, classification, and the HMRC calculator.
              </p>
            </article>

            <article className="ds-type">
              <div className="ds-type__label">Label - 0.75rem 700, uppercase, amber</div>
              <span className="ds-label">Featured</span>
            </article>
          </section>

          {/* Spacing */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">04 / Spacing</span>
              <h2 className="ds-section__title">Base unit: 4px</h2>
              <p className="ds-section__desc">
                Everything is a multiple. If a value isn&apos;t in the scale,
                it&apos;s wrong - reach for the next token, don&apos;t invent
                a new one.
              </p>
            </header>

            <div className="ds-scale">
              {spacingScale.map((s) => (
                <div key={s.name} className="ds-scale__item">
                  <div
                    className="ds-scale__bar ds-scale__bar--spacing"
                    style={{ width: s.value }}
                  />
                  <span className="ds-scale__label">
                    <strong>{s.name}</strong> · {s.value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Radius */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">05 / Radius</span>
              <h2 className="ds-section__title">Soft corners, never circular by accident</h2>
              <p className="ds-section__desc">
                Use the named tokens. <code>border-radius: 50%</code> is reserved
                for things that are genuinely circular - everything else is a
                pill.
              </p>
            </header>

            <div className="ds-scale">
              {radiusScale.map((r) => (
                <div key={r.name} className="ds-scale__item">
                  <div
                    className="ds-scale__bar ds-scale__bar--radius"
                    style={{ borderRadius: r.value }}
                  />
                  <span className="ds-scale__label">
                    <strong>{r.name}</strong> · {r.displayLabel ?? r.value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Buttons */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">06 / Components</span>
              <h2 className="ds-section__title">Buttons</h2>
              <p className="ds-section__desc">
                One primary per visible viewport. Pair it with a ghost or text
                link for the secondary action - never two primaries side by side.
              </p>
            </header>

            <article className="ds-block">
              <h3 className="ds-block__title">Variants</h3>
              <p className="ds-block__desc">Primary, secondary, ghost, destructive.</p>
              <div className="ds-row">
                <button className="ds-btn ds-btn--primary" type="button">Download MileClear</button>
                <button className="ds-btn ds-btn--secondary" type="button">See features</button>
                <button className="ds-btn ds-btn--ghost" type="button">Maybe later</button>
                <button className="ds-btn ds-btn--destructive" type="button">Delete account</button>
              </div>
            </article>

            <article className="ds-block">
              <h3 className="ds-block__title">Sizes</h3>
              <p className="ds-block__desc">Small for inline actions, medium for forms, large for hero CTAs.</p>
              <div className="ds-row">
                <button className="ds-btn ds-btn--primary ds-btn--sm" type="button">Small</button>
                <button className="ds-btn ds-btn--primary" type="button">Medium</button>
                <button className="ds-btn ds-btn--primary ds-btn--lg" type="button">Large</button>
              </div>
            </article>
          </section>

          {/* Badges */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">07 / Components</span>
              <h2 className="ds-section__title">Badges</h2>
              <p className="ds-section__desc">
                Pro is amber-on-deep, status badges follow the semantic colour
                rules: emerald active, red failed, amber pending.
              </p>
            </header>

            <article className="ds-block">
              <div className="ds-row">
                <span className="ds-badge ds-badge--pro">Pro</span>
                <span className="ds-badge ds-badge--active">Active</span>
                <span className="ds-badge ds-badge--pending">Pending</span>
                <span className="ds-badge ds-badge--failed">Failed</span>
              </div>
            </article>
          </section>

          {/* Chips */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">08 / Components</span>
              <h2 className="ds-section__title">Filter chips</h2>
              <p className="ds-section__desc">
                Pill, surface fill at rest, amber fill when active. The colour
                swap is the only state change - no border tricks.
              </p>
            </header>

            <article className="ds-block">
              <div className="ds-row">
                <span className="ds-chip ds-chip--active">All</span>
                <span className="ds-chip">Work</span>
                <span className="ds-chip">Personal</span>
                <span className="ds-chip">Unclassified</span>
              </div>
            </article>
          </section>

          {/* Inputs */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">09 / Components</span>
              <h2 className="ds-section__title">Inputs</h2>
              <p className="ds-section__desc">
                48px minimum touch target. Surface fill, subtle border at rest,
                amber-glow border when focused. Errors are red borders only -
                never red fills.
              </p>
            </header>

            <article className="ds-block">
              <label className="ds-input-label" htmlFor="ds-demo-rest">At rest</label>
              <input
                id="ds-demo-rest"
                className="ds-input"
                type="text"
                placeholder="your@email.com"
                readOnly
              />
            </article>

            <article className="ds-block">
              <label className="ds-input-label" htmlFor="ds-demo-focus">Focused</label>
              <input
                id="ds-demo-focus"
                className="ds-input ds-input--focused"
                type="text"
                defaultValue="anthony@mileclear.com"
                readOnly
              />
            </article>
          </section>

          {/* Voice */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">10 / Voice</span>
              <h2 className="ds-section__title">Direct, plain, UK English</h2>
              <p className="ds-section__desc">
                No hype, no exclamation marks, no em dashes. Drivers can smell
                marketing copy from a mile off - sound like a person.
              </p>
            </header>

            {voicePairs.map((p) => (
              <div key={p.do} className="ds-voice" style={{ marginBottom: "1rem" }}>
                <article className="ds-voice__card ds-voice__card--do">
                  <div className="ds-voice__marker">Do</div>
                  <p className="ds-voice__quote">{p.do}</p>
                </article>
                <article className="ds-voice__card ds-voice__card--dont">
                  <div className="ds-voice__marker">Don&apos;t</div>
                  <p className="ds-voice__quote">{p.dont}</p>
                </article>
              </div>
            ))}
          </section>

          {/* Footer link */}
          <section className="ds-section">
            <header className="ds-section__head">
              <span className="ds-section__kicker">11 / Reference</span>
              <h2 className="ds-section__title">Full written spec</h2>
              <p className="ds-section__desc">
                The complete rules - including motion, accessibility, the
                anti-patterns list, and where every token lives - are in{" "}
                <a
                  className="ds-link"
                  href="https://github.com/HairyGair/MileClear/blob/main/docs/DESIGN_SYSTEM.md"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  DESIGN_SYSTEM.md
                </a>{" "}
                in the repo. If this page and that doc disagree, the page is
                a lie - update both.
              </p>
            </header>
          </section>
        </div>
      </main>

      <Footer />
    </>
  );
}
