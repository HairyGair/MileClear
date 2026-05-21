import type { Metadata } from "next";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import BreadcrumbsJsonLd from "@/components/seo/BreadcrumbsJsonLd";
import "./quickbooks.css";

// Public landing page for the QuickBooks Online integration. Also
// serves as Intuit's "Launch URL" and "Connect/Reconnect URL" for the
// App Partner Program: users who find MileClear via the Intuit App
// Store land here and tap "Connect QuickBooks" to start OAuth.
//
// The actual OAuth flow runs from the mobile app (or web dashboard
// when we build that surface). This page is informational + a
// gateway: deep-link into the app, or sign in on web.

export const metadata: Metadata = {
  title: "QuickBooks Online for MileClear — Push your mileage to your accountant's books",
  description:
    "MileClear's QuickBooks integration pushes business mileage, gig earnings, and allowable expenses from your phone into QuickBooks Online. Pro feature. No copy-paste.",
  alternates: { canonical: "https://mileclear.com/quickbooks" },
  openGraph: {
    title: "MileClear + QuickBooks Online",
    description:
      "Push business mileage, gig earnings, and expenses from MileClear into QuickBooks Online with a tap. Pro feature.",
    url: "https://mileclear.com/quickbooks",
    images: [{ url: "/branding/og-image.png", width: 1200, height: 628 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MileClear + QuickBooks Online",
    description:
      "Push business mileage, gig earnings, and expenses from MileClear into QuickBooks Online with a tap. Pro feature.",
  },
};

const APP_STORE_URL =
  "https://apps.apple.com/gb/app/mileclear/id6759671005";

export default function QuickBooksLanding() {
  return (
    <>
      <BreadcrumbsJsonLd
        crumbs={[{ name: "QuickBooks integration", path: "/quickbooks" }]}
      />
      <Navbar />
      <main className="qb-page">
        {/* Hero */}
        <section className="qb-hero">
          <div className="container qb-hero__inner">
            <p className="qb-hero__eyebrow">Pro integration</p>
            <h1 className="qb-hero__title">
              MileClear <span className="qb-hero__plus">+</span> QuickBooks Online
            </h1>
            <p className="qb-hero__subtitle">
              Push your business mileage, gig earnings, and allowable expenses
              from MileClear straight into your QuickBooks books. Your
              accountant gets clean records; you stop copy-pasting.
            </p>
            <div className="qb-hero__cta-row">
              <a
                className="btn btn--primary qb-hero__cta"
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get MileClear
              </a>
              <a className="btn btn--secondary qb-hero__cta-secondary" href="/dashboard/settings">
                Already a member? Connect
              </a>
            </div>
            <p className="qb-hero__finepoint">
              QuickBooks Online required (Simple Start or higher). Open Banking
              + cash basis supported.
            </p>
          </div>
        </section>

        {/* What syncs */}
        <section className="qb-section">
          <div className="container">
            <h2 className="qb-section__title">What syncs to QuickBooks</h2>
            <div className="qb-syncs">
              <article className="qb-sync-card">
                <div className="qb-sync-card__icon" aria-hidden>🛣️</div>
                <h3 className="qb-sync-card__title">Business mileage</h3>
                <p className="qb-sync-card__body">
                  Every classified business trip becomes a QBO Vehicle Mileage
                  entry. AMAP rates applied automatically (45p first 10k, 25p
                  after).
                </p>
              </article>
              <article className="qb-sync-card">
                <div className="qb-sync-card__icon" aria-hidden>💷</div>
                <h3 className="qb-sync-card__title">Gig earnings</h3>
                <p className="qb-sync-card__body">
                  Uber, Deliveroo, Just Eat, Amazon Flex and manual earnings
                  push to QBO as Sales Receipts, ready for your accountant's
                  reconciliation.
                </p>
              </article>
              <article className="qb-sync-card">
                <div className="qb-sync-card__icon" aria-hidden>🧾</div>
                <h3 className="qb-sync-card__title">Allowable expenses</h3>
                <p className="qb-sync-card__body">
                  Parking, tolls, phone bills, accountancy fees, equipment —
                  every expense you log lands in QBO as a Purchase, with the
                  right SA103S category.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="qb-section qb-section--alt">
          <div className="container">
            <h2 className="qb-section__title">How it works</h2>
            <ol className="qb-steps">
              <li className="qb-step">
                <span className="qb-step__num">1</span>
                <div>
                  <h3 className="qb-step__title">Connect once</h3>
                  <p className="qb-step__body">
                    Open MileClear → Settings → Integrations → QuickBooks → tap
                    Connect. Sign into QBO, authorise MileClear, done.
                  </p>
                </div>
              </li>
              <li className="qb-step">
                <span className="qb-step__num">2</span>
                <div>
                  <h3 className="qb-step__title">Pick a date range</h3>
                  <p className="qb-step__body">
                    Push this tax year, last month, or any custom window. We
                    de-duplicate against previous pushes so re-running is safe.
                  </p>
                </div>
              </li>
              <li className="qb-step">
                <span className="qb-step__num">3</span>
                <div>
                  <h3 className="qb-step__title">Done — your accountant sees it</h3>
                  <p className="qb-step__body">
                    Every record lands in QBO with a MileClear reference, so
                    your accountant can trace anything back to the source
                    trip / earning / receipt.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section className="qb-section">
          <div className="container">
            <h2 className="qb-section__title">Common questions</h2>
            <details className="qb-faq">
              <summary className="qb-faq__q">Is this Pro-only?</summary>
              <p className="qb-faq__a">
                Yes. The QuickBooks integration is part of MileClear Pro
                (£4.99/month or £44.99/year). All free features stay free.
              </p>
            </details>
            <details className="qb-faq">
              <summary className="qb-faq__q">Which QuickBooks product?</summary>
              <p className="qb-faq__a">
                QuickBooks Online (Simple Start, Essentials, Plus or
                Advanced). QuickBooks Self-Employed and QuickBooks Desktop
                aren't supported — Intuit's APIs for those products are
                read-only or unavailable.
              </p>
            </details>
            <details className="qb-faq">
              <summary className="qb-faq__q">
                What happens to data already in QBO?
              </summary>
              <p className="qb-faq__a">
                We never delete or modify entries we didn't create.
                MileClear-pushed records are tagged so we can update or remove
                them later, but anything else in your QBO file is untouched.
              </p>
            </details>
            <details className="qb-faq">
              <summary className="qb-faq__q">How do I disconnect?</summary>
              <p className="qb-faq__a">
                In MileClear: Settings → Integrations → QuickBooks → Disconnect.
                Or from inside QuickBooks: Apps → Connected apps → MileClear →
                Disconnect. Either side works; both will sync.
              </p>
            </details>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="qb-section qb-section--cta">
          <div className="container qb-cta">
            <h2 className="qb-cta__title">Stop copy-pasting your mileage</h2>
            <p className="qb-cta__body">
              MileClear Pro + QuickBooks Online. Two taps and your tax records
              are in one place.
            </p>
            <a
              className="btn btn--primary qb-cta__btn"
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get MileClear on the App Store
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
