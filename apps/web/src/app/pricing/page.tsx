import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';

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
  'Unlimited GPS trip tracking',
  'Automatic drive detection',
  'Live Activities on the lock screen',
  'Business and personal trip classification',
  'HMRC mileage deduction calculator',
  'Shift mode with platform tagging',
  'UK fuel prices from 8,300+ stations',
  '43 achievements and streaks',
  '2 saved locations with geofencing',
  'Push notifications and weekly summaries',
];

const proFeatures = [
  'Everything in Free, plus:',
  'PDF and CSV trip exports',
  'Self Assessment summary (HMRC-ready)',
  'Business expense tracking with tax estimate',
  'Earnings tracking - manual and CSV import',
  'Open Banking sync via Plaid',
  'Weekly P&L and business intelligence',
  'Platform comparison and shift grades',
  'Unlimited saved locations',
];

const faqs = [
  {
    q: 'Is MileClear really free?',
    a: 'Yes, genuinely. The free plan has no trip limits, no time limits, and no surprise paywalls on core features. You can track unlimited GPS journeys, classify trips as business or personal, use the HMRC calculator, and earn all 43 achievements without spending a penny. The free plan is not a trial - it stays free for as long as you use it.',
  },
  {
    q: 'What happens when I upgrade to Pro?',
    a: 'You unlock tax-ready exports immediately - PDF trip reports, CSV files for your accountant, and a Self Assessment mileage summary. You also get earnings tracking with CSV import, Open Banking sync, business intelligence reports, and unlimited saved locations. Everything switches on the moment your payment goes through, with no setup needed.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, with no penalty. You can cancel from within the app at any time - go to Profile and scroll to the Subscription section. Your Pro access continues until the end of your current billing period, and you will not be charged again after that. There is no cancellation fee.',
  },
  {
    q: 'Is there a free trial?',
    a: 'There is no time-limited trial, but the free plan is comprehensive enough to get a clear sense of how the app works before upgrading. You can track trips, see your HMRC deduction build up, and use the dashboard fully before deciding if exports are worth it for you.',
  },
  {
    q: 'How does the annual plan work?',
    a: 'The annual plan costs £44.99 per year, which works out at £3.75 per month - a saving of 25% compared to paying monthly. You are billed once per year. On iOS the annual plan is available as an in-app purchase via Apple. The annual plan is otherwise identical to the monthly Pro plan, with the same features and the same ability to cancel.',
  },
  {
    q: 'Do I need Pro for HMRC compliance?',
    a: 'You do not need Pro to track your mileage or to calculate your HMRC deduction - that all happens on the free plan. You only need Pro if you want to export your mileage log as a PDF or CSV for your self-assessment tax return or to share with an accountant. If you keep records manually or just need the numbers, free is enough.',
  },
];

export default function PricingPage() {
  return (
    <>
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
                  Tax-ready exports, earnings insights, and the full toolkit for self-employed drivers. Also available at &pound;44.99/year - save 25%.
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
              Annual plan available at &pound;44.99/year (save 25%). No card needed to start on the free plan.
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
