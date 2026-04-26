import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import BreadcrumbsJsonLd from '@/components/seo/BreadcrumbsJsonLd';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'MileClear mileage tracker pricing UK. Free mileage app with unlimited GPS tracking. Upgrade to Pro for HMRC exports and business intelligence. Free mileage tracker with no trip limits.',
  alternates: {
    canonical: 'https://mileclear.com/pricing',
  },
  openGraph: {
    title: 'Pricing | MileClear',
    description:
      'Track every mile for free. Upgrade to Pro at £4.99/month for HMRC-ready exports, earnings tracking, and business intelligence.',
    url: 'https://mileclear.com/pricing',
    images: [{ url: '/branding/og-image.png', width: 1200, height: 628 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pricing | MileClear',
    description:
      'Track every mile for free. Upgrade to Pro at £4.99/month for HMRC-ready exports, earnings tracking, and business intelligence.',
    images: ['/branding/og-image.png'],
  },
};

const Tick = ({ pro }: { pro?: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{
      flexShrink: 0,
      marginTop: 2,
      color: pro ? 'var(--amber-400)' : 'var(--emerald-400)',
    }}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const freeFeatures = [
  'Unlimited GPS trip tracking with auto-detection',
  'Tax Readiness card - live HMRC tax + NI estimate, weekly set-aside, 31 January countdown',
  'Anonymous Benchmarking - your weekly miles and trips vs other UK drivers',
  'HMRC Reconciliation - compare what HMRC sees to what you tracked',
  'MOT and tax expiry reminders (push 14 days before)',
  'Full DVSA MOT history with advisories and odometer growth',
  'Activity Heatmap - when you drive and earn most, by hour and platform',
  'Pickup wait timer for restaurants and depots',
  'Shift mode with platform tagging and live earnings',
  'UK fuel prices from 8,300+ stations',
  'Live Activities on the lock screen',
  'Business and personal trip classification',
  'HMRC mileage deduction calculator (45p/25p car, 24p moped)',
  'Higher-rate threshold warning when approaching £50,270',
  'First-time Self Assessment guide',
  'Achievements, streaks, weekly and monthly recaps',
  '2 saved locations with geofencing',
  'Push notifications and weekly summaries',
];

const proFeatures = [
  'Everything in Free, plus:',
  'Self Assessment wizard - step-by-step mapping to HMRC SA103 form boxes',
  'PDF mileage log with signed HMRC attestation cover sheet',
  'CSV and accounting-software exports',
  'Accountant Portal - read-only dashboard you can invite your accountant to',
  'Receipt scanning - on-device OCR for parking tickets, fuel, tolls',
  'CSV earnings import from Uber, Deliveroo, Just Eat, Amazon Flex, Stuart',
  'Business insights - earnings per mile, golden hours, weekly P&L, shift grades',
  'Pickup-wait community insights - "drivers here average 12-min waits"',
  'Anonymous Benchmarking platform breakdowns and regional cuts',
  'Unlimited saved locations',
];

const faqs = [
  {
    q: 'Is MileClear really free?',
    a: 'Yes, genuinely. The free plan has no trip limits, no time limits, and no surprise paywalls on core features. The Tax Readiness card, Anonymous Benchmarking, MOT reminders, HMRC Reconciliation - all free for everyone. The free plan is not a trial - it stays free for as long as you use it.',
  },
  {
    q: 'What happens when I upgrade to Pro?',
    a: 'You unlock the Self Assessment wizard, PDF and CSV exports, the Accountant Portal, receipt scanning, CSV earnings import, business insights (golden hours, P&L, shift grades), pickup-wait community insights, and unlimited saved locations. Everything switches on the moment your payment goes through.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, with no penalty. You can cancel from within the app at any time - go to Profile and scroll to the Subscription section. Your Pro access continues until the end of your current billing period, and you will not be charged again after that. There is no cancellation fee.',
  },
  {
    q: 'Is there a free trial?',
    a: 'There is no time-limited trial, but the free plan is genuinely comprehensive. You can use the Tax Readiness card, Anonymous Benchmarking, HMRC Reconciliation, MOT history, and the dashboard fully before deciding if the Pro tools (Self Assessment wizard, exports, Accountant Portal, receipt OCR) are worth it for you.',
  },
  {
    q: 'Do I need Pro to file my Self Assessment?',
    a: 'You do not need Pro to track your mileage or to see your HMRC deduction build up - that is all on the free plan. Pro is for the export workflow: a PDF mileage log with a signed cover sheet that HMRC inspectors recognise, the Self Assessment wizard that maps your numbers to specific SA103 form boxes, and the Accountant Portal that lets you share read-only access by email. If you do your own return manually using just the numbers, free is enough.',
  },
  {
    q: 'How does payment work?',
    a: 'On iOS, Pro is sold via Apple In-App Purchase - your card details stay with Apple. You manage and cancel from your phone Settings under your Apple ID, or from MileClear Profile. Web sign-ups go via Stripe; same cancel-anytime guarantees apply.',
  },
  {
    q: 'Do you offer an annual plan?',
    a: 'Not yet. Pro is currently monthly only at £4.99/month. An annual plan is on the roadmap and will land before public App Store launch.',
  },
];

export default function PricingPage() {
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'MileClear',
    description:
      'UK mileage tracker for gig workers, delivery drivers, and self-employed drivers. Free GPS tracking with HMRC tax deduction calculator. Pro tier unlocks tax-ready exports, earnings tracking, and business intelligence.',
    brand: { '@type': 'Brand', name: 'MileClear' },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '5',
      ratingCount: '4',
      bestRating: '5',
      worstRating: '1',
    },
    offers: [
      {
        '@type': 'Offer',
        name: 'Free',
        price: '0',
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
        url: 'https://mileclear.com/pricing',
        description:
          'Unlimited GPS trip tracking, Tax Readiness card, Anonymous Benchmarking, HMRC Reconciliation, MOT and tax expiry reminders, MOT history, Activity Heatmap, fuel prices, achievements, and weekly recaps. Free forever.',
      },
      {
        '@type': 'Offer',
        name: 'Pro Monthly',
        price: '4.99',
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
        url: 'https://mileclear.com/pricing',
        description:
          'Self Assessment wizard, PDF and CSV exports with HMRC attestation cover sheet, Accountant Portal, receipt scanning, CSV earnings import, business insights, pickup-wait community insights, unlimited saved locations.',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '4.99',
          priceCurrency: 'GBP',
          unitCode: 'MON',
          unitText: 'month',
          billingDuration: 'P1M',
        },
      },
    ],
  };

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };

  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: 'Pricing', path: '/pricing' }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />
      <Navbar />

      <main style={{ paddingTop: '68px' }}>

        {/* Hero */}
        <section className="section">
          <div className="container" style={{ textAlign: 'center' }}>
            <span className="label">Pricing</span>
            <h1
              className="heading"
              style={{ marginBottom: '1rem' }}
            >
              Simple, Transparent Pricing
            </h1>
            <p
              className="subtext"
              style={{ margin: '0 auto', maxWidth: 560 }}
            >
              Track every mile for free. Upgrade to Pro when you need exports and business intelligence.
            </p>

            {/* Pricing Cards */}
            <div className="pricing__cards" style={{ marginTop: '3rem' }}>

              {/* Free */}
              <div className="p-card">
                <p className="p-card__name">Free</p>
                <p className="p-card__price">
                  &pound;0<span className="p-card__period"> /month</span>
                </p>
                <p className="p-card__desc">
                  Full mileage tracking with everything you need to record your driving, forever free.
                </p>
                <ul className="p-card__list">
                  {freeFeatures.map((feature) => (
                    <li key={feature} className="p-card__item">
                      <Tick />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Pro */}
              <div className="p-card p-card--pro">
                <span className="p-card__badge">Most popular</span>
                <p className="p-card__name">Pro</p>
                <p className="p-card__price">
                  &pound;4.99<span className="p-card__period"> /month</span>
                </p>
                <p className="p-card__desc">
                  Self Assessment wizard, HMRC-ready exports, Accountant Portal, receipt scanning, and the full business-insights toolkit for self-employed drivers.
                </p>
                <ul className="p-card__list">
                  {proFeatures.map((feature) => (
                    <li key={feature} className="p-card__item">
                      <Tick pro />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            <p className="pricing__footnote">
              Cancel anytime from inside the app. No card needed to start on the free plan.
            </p>
          </div>
        </section>

        {/* Divider */}
        <div className="container">
          <div className="divider" />
        </div>

        {/* FAQ */}
        <section className="section">
          <div className="container" style={{ maxWidth: 760, marginLeft: 'auto', marginRight: 'auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 'clamp(2.5rem, 5vw, 3.5rem)' }}>
              <span className="label">FAQ</span>
              <h2 className="heading">Frequently Asked Questions About Pricing</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
              {faqs.map((faq) => (
                <div key={faq.q}>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.0625rem',
                      fontWeight: 700,
                      color: 'var(--text-white)',
                      marginBottom: '0.625rem',
                      lineHeight: 1.35,
                    }}
                  >
                    {faq.q}
                  </h3>
                  <p
                    style={{
                      fontSize: '0.9375rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.75,
                    }}
                  >
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Divider */}
        <div className="container">
          <div className="divider" />
        </div>

        {/* CTA */}
        <section className="section">
          <div className="container" style={{ textAlign: 'center' }}>
            <span className="label">Download</span>
            <h2
              className="heading"
              style={{ marginBottom: '1rem' }}
            >
              Start tracking for free today
            </h2>
            <p
              className="subtext"
              style={{ margin: '0 auto 2rem', maxWidth: 480 }}
            >
              Join thousands of UK drivers who track their mileage with MileClear. No credit card needed.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
              <a
                href="https://apps.apple.com/app/mileclear/id6742044832"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  background: 'var(--amber-400)',
                  color: 'var(--bg-deep)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '0.9375rem',
                  padding: '0.75rem 1.75rem',
                  borderRadius: 'var(--r-full)',
                  transition: 'background 0.2s, transform 0.15s',
                  textDecoration: 'none',
                }}
              >
                Download MileClear
              </a>

              <a
                href="/features"
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                }}
              >
                See all features
              </a>
            </div>

            {/* Internal links */}
            <div
              style={{
                marginTop: '3rem',
                display: 'flex',
                gap: '1.5rem',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <a
                href="/features"
                style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}
              >
                Features
              </a>
              <a
                href="/support"
                style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}
              >
                Support
              </a>
              <a
                href="/"
                style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}
              >
                Back to MileClear
              </a>
            </div>
          </div>
        </section>

      </main>

      <Footer />
    </>
  );
}
