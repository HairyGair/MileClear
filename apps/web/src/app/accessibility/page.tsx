import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import "../legal.css";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description:
    "How MileClear approaches accessibility. We aim to meet WCAG 2.1 AA on the web and follow Apple's accessibility APIs on iOS. Report issues to support@mileclear.com - we fix within 14 days.",
  alternates: {
    canonical: "https://mileclear.com/accessibility",
  },
  openGraph: {
    title: "Accessibility Statement | MileClear",
    description: "How MileClear approaches accessibility. WCAG 2.1 AA on the web, VoiceOver-friendly on iOS, 14-day fix promise.",
    url: "https://mileclear.com/accessibility",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Accessibility Statement | MileClear",
    description: "WCAG 2.1 AA on the web, VoiceOver-friendly on iOS, 14-day fix promise.",
    images: ["/branding/og-image.png"],
  },
};

export default function AccessibilityStatement() {
  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: "Accessibility Statement", path: "/accessibility" }]} />
      <Navbar />

      <main className="legal">
        <div className="container">

          {/* Header */}
          <div className="legal__header">
            <h1 className="heading">Accessibility Statement</h1>
            <p className="legal__date">Last updated: 26 May 2026</p>
          </div>

          {/* Table of Contents */}
          <nav className="legal__toc" aria-label="On this page">
            <h2 className="legal__toc-title">Quick Navigation</h2>
            <ul className="legal__toc-list">
              <li><a href="#commitment" className="legal__toc-link">Our Commitment</a></li>
              <li><a href="#standard" className="legal__toc-link">The Standard We Aim For</a></li>
              <li><a href="#web" className="legal__toc-link">Web (mileclear.com)</a></li>
              <li><a href="#ios" className="legal__toc-link">iOS App</a></li>
              <li><a href="#known-issues" className="legal__toc-link">Known Limitations</a></li>
              <li><a href="#report" className="legal__toc-link">Report an Accessibility Issue</a></li>
              <li><a href="#enforcement" className="legal__toc-link">Enforcement</a></li>
            </ul>
          </nav>

          {/* Main Content */}
          <div className="legal__content">

            <section id="commitment" className="legal__section">
              <h2 className="legal__section-title">1. Our Commitment</h2>
              <p className="legal__text">
                MileClear is built so UK drivers can claim every tax-deductible mile they're owed. That commitment only means something if the app works for everyone, regardless of how they use their phone or computer.
              </p>
              <p className="legal__text">
                We aim to meet the international standard for accessible digital products on the web, and to follow Apple's accessibility APIs on iOS so the mobile app works with VoiceOver, Dynamic Type, Reduce Motion, increased contrast, and Switch Control.
              </p>
              <p className="legal__text">
                We are not a large company with a dedicated accessibility team. We are one developer (Anthony) building MileClear for the UK gig and self-employed driving community. Where we fall short, we want to know - and we commit to fixing it.
              </p>
            </section>

            <section id="standard" className="legal__section">
              <h2 className="legal__section-title">2. The Standard We Aim For</h2>
              <p className="legal__text">
                <strong>Web:</strong> Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. This is the standard the UK Public Sector Bodies Accessibility Regulations 2018 require of public-sector websites, and it's the same bar we hold ourselves to.
              </p>
              <p className="legal__text">
                <strong>iOS:</strong> Apple's Human Interface Guidelines for Accessibility, which align with WCAG 2.1 AA at the platform level. Every interactive element in the app exposes a label and role to VoiceOver, and the UI adapts to system-level Dynamic Type, Reduce Motion, and Increase Contrast settings.
              </p>
              <p className="legal__text">
                We have not yet commissioned a formal third-party accessibility audit. We do test against the standards above ourselves, and we treat every accessibility issue reported by users as a high-priority bug.
              </p>
            </section>

            <section id="web" className="legal__section">
              <h2 className="legal__section-title">3. Web (mileclear.com)</h2>
              <p className="legal__text">
                The mileclear.com site and the web dashboard at mileclear.com/dashboard are designed to be usable with:
              </p>
              <ul className="legal__list">
                <li className="legal__list-item">Screen readers (VoiceOver, NVDA, JAWS, TalkBack via Chrome).</li>
                <li className="legal__list-item">Keyboard-only navigation. Every interactive element is reachable by Tab, and the visible focus ring is preserved across all components.</li>
                <li className="legal__list-item">Browser zoom up to 200% without horizontal scrolling or content loss.</li>
                <li className="legal__list-item">High-contrast mode and forced-colors mode in supported browsers.</li>
              </ul>
              <p className="legal__text">
                We use semantic HTML throughout (headings in proper hierarchy, form fields with associated labels, lists for list content, ARIA only where native semantics aren't enough). Our colour palette - amber accent on dark navy - is checked against WCAG 4.5:1 contrast for body text and 3:1 for large text.
              </p>
              <p className="legal__text">
                Decorative images carry empty alt attributes; informative images carry descriptive alt text. Embedded media is captioned where present (currently none).
              </p>
            </section>

            <section id="ios" className="legal__section">
              <h2 className="legal__section-title">4. iOS App</h2>
              <p className="legal__text">
                The MileClear iOS app supports:
              </p>
              <ul className="legal__list">
                <li className="legal__list-item"><strong>VoiceOver:</strong> Every button, list row, form field, toggle, and chart cell exposes an accessibility label and role. The Lock Screen Live Activity announces trip status changes.</li>
                <li className="legal__list-item"><strong>Dynamic Type:</strong> Text scales with the system font-size setting up to the largest accessibility size, without truncation or layout breakage.</li>
                <li className="legal__list-item"><strong>Reduce Motion:</strong> Decorative animations (skeleton loaders, transitions, the pulse on the Tax Readiness card) are disabled when Reduce Motion is on.</li>
                <li className="legal__list-item"><strong>Increase Contrast:</strong> Border and text colour weights increase when the system Increase Contrast setting is on.</li>
                <li className="legal__list-item"><strong>Switch Control:</strong> All interactive elements are reachable via Switch Control's group/sequential navigation.</li>
                <li className="legal__list-item"><strong>Smart Invert and Differentiate Without Colour:</strong> Information is never conveyed by colour alone (every coloured status pill also carries a label or icon).</li>
              </ul>
              <p className="legal__text">
                We use Apple's on-device APIs for receipt OCR and Live Activities. Both are designed by Apple to work with assistive technologies and we do not interfere with that.
              </p>
            </section>

            <section id="known-issues" className="legal__section">
              <h2 className="legal__section-title">5. Known Limitations</h2>
              <p className="legal__text">
                We are honest about where we may fall short. As of the date at the top of this page:
              </p>
              <ul className="legal__list">
                <li className="legal__list-item">We have not commissioned a formal third-party WCAG 2.1 AA audit. We rely on self-testing with Lighthouse, axe, and manual VoiceOver / NVDA passes.</li>
                <li className="legal__list-item">Some chart and map visualisations (the Activity Heatmap, the trip-route map preview) provide aggregated text alternatives but do not yet expose every individual data point to screen readers.</li>
                <li className="legal__list-item">The Working Calendar on the web dashboard exposes day cells as links; multi-day range selection by keyboard isn't yet supported (single-day drill-through works).</li>
                <li className="legal__list-item">Some animations in the onboarding flow use opacity-only transitions; while these respect Reduce Motion, the static fallback can be slightly less inviting.</li>
              </ul>
              <p className="legal__text">
                Each of these is on the development roadmap. If any of them blocks you from using MileClear, please report it (see below) and we'll prioritise.
              </p>
            </section>

            <section id="report" className="legal__section">
              <h2 className="legal__section-title">6. Report an Accessibility Issue</h2>
              <p className="legal__text">
                If you find anything in MileClear that doesn't work with the assistive technology you use, we want to know.
              </p>
              <div className="legal__card">
                <p className="legal__card-text">
                  Email <strong>support@mileclear.com</strong> with:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">A description of what you were trying to do.</li>
                  <li className="legal__list-item">The page or screen you were on (a screenshot or screen recording is gold dust here, but optional).</li>
                  <li className="legal__list-item">The assistive technology you're using (e.g. VoiceOver on iOS 18, NVDA on Windows 11).</li>
                  <li className="legal__list-item">Your device and browser if it's a web issue (e.g. iPhone 15 Pro Safari, MacBook Air Chrome).</li>
                </ul>
              </div>
              <p className="legal__text">
                <strong>Our promise:</strong> we'll acknowledge your report within 2 working days. We aim to ship a fix within 14 days for issues that block use of a feature, and within 30 days for everything else. If a fix takes longer because the underlying platform constrains us (rare but possible), we'll tell you what the timeline looks like and what we're doing in the meantime.
              </p>
              <p className="legal__text">
                Anthony reads every accessibility report personally.
              </p>
            </section>

            <section id="enforcement" className="legal__section">
              <h2 className="legal__section-title">7. Enforcement</h2>
              <p className="legal__text">
                If you contact us about an accessibility issue and you're unhappy with our response, you can escalate to the Equality Advisory and Support Service (EASS):
              </p>
              <ul className="legal__list">
                <li className="legal__list-item">Web: <a href="https://www.equalityadvisoryservice.com" target="_blank" rel="noopener noreferrer">equalityadvisoryservice.com</a></li>
                <li className="legal__list-item">Telephone: 0808 800 0082</li>
                <li className="legal__list-item">Textphone: 0808 800 0084</li>
              </ul>
              <p className="legal__text">
                MileClear is a private commercial service, not a public-sector body, so we sit outside the Public Sector Bodies Accessibility Regulations 2018. We hold ourselves to the same standard regardless.
              </p>
            </section>

          </div>

        </div>
      </main>

      <Footer />
    </>
  );
}
