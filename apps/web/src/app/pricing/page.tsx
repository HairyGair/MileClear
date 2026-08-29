import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import BreadcrumbsJsonLd from '@/components/seo/BreadcrumbsJsonLd';
import StoreButtons from "@/components/StoreButtons";

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

type FeatureGroup = { title: string; items: string[] };

const freeFeatures: FeatureGroup[] = [
  {
    title: 'Tracking',
    items: [
      'Unlimited GPS trip tracking with automatic drive detection - no monthly cap, ever',
      'Works offline - trips record with no signal and sync later',
      'Business and personal classification, platform tagging, shift mode with live earnings',
      'Trip split and merge (2-20 trips), plus Missed Journeys the app proposes for you to accept',
      '2 saved locations with geofencing (home, work, depot)',
      'Live Activities on the iPhone lock screen',
    ],
  },
  {
    title: 'Tax',
    items: [
      'HMRC mileage deduction calculator - 55p/25p for cars and vans, 24p for motorcycles; the car rate rose from 45p on 6 April 2026',
      'Tax Readiness card - live Income Tax + NI estimate, weekly set-aside, 31 January countdown',
      'Higher-rate threshold warning as you approach £50,270',
      'Self Assessment wizard - step-by-step mapping to HMRC SA103 form boxes',
      'HMRC Reconciliation - compare what HMRC sees to what you tracked',
      'First-time Self Assessment guide',
    ],
  },
  {
    title: 'Money',
    items: [
      'Expenses log across 15 SA103-mapped categories (parking, tolls, phone, equipment...)',
      'Receipt scanning - on-device OCR for parking tickets, fuel and tolls; images never leave your phone',
      'Invoicing - create and send invoices to clients, track paid and unpaid (3 a month free)',
      'Manual earnings by platform',
      'Pickup wait timer for restaurants and depots',
    ],
  },
  {
    title: 'Vehicle and fuel',
    items: [
      '1 vehicle with DVLA lookup, full DVSA MOT history, advisories and odometer growth',
      'MOT and tax expiry reminders (push 14 days before)',
      'UK fuel prices from 8,300+ stations, fuel log, and a daily cheapest-fuel alert near your saved locations',
      'EV charging points nearby and electricity-rate lookup',
      'Clean Air Zone and ULEZ check on every trip',
    ],
  },
  {
    title: 'Insight and community',
    items: [
      'Anonymous Benchmarking - your weekly miles and trips vs other UK drivers',
      'Activity Heatmap - when you drive and earn most, by hour and platform',
      'Community road insights near your start point',
      'Achievements, streaks, daily, weekly, monthly and yearly recaps',
      'Work Schedule editor - set your working days and hours',
      'Refer a driver: you both get a month of Pro (up to three referrals)',
    ],
  },
];

const proFeatures: FeatureGroup[] = [
  {
    title: 'Exports and filing',
    items: [
      'Print-ready Self Assessment PDF - the wizard\'s SA103 figures as a filing-ready document',
      'PDF mileage log with signed HMRC attestation cover sheet',
      'CSV export of trips, earnings and expenses',
      'Accountant Portal - read-only dashboard you invite your accountant to by email',
    ],
  },
  {
    title: 'Money',
    items: [
      'Open Banking - connect your bank and import earnings automatically, with an inbox to sort transactions into earnings or expenses',
      'CSV earnings import from Uber, Deliveroo, Just Eat, Amazon Flex and Stuart',
      'Unlimited invoices and one-tap late-payment chase emails',
    ],
  },
  {
    title: 'Insight',
    items: [
      'Business insights - earnings per mile and per hour, golden hours, weekly P&L, shift grades',
      'Driving Analytics - weekly and multi-month trends',
      'Journey Map - every route on one map',
      'Pickup-wait community insights - "drivers here average 12-minute waits"',
    ],
  },
  {
    title: 'Automation and limits',
    items: [
      'Auto-Classify Rules - business or personal from your work schedule, with automatic mode switching and shift reminders',
      'Unlimited vehicles',
      'Unlimited saved locations',
    ],
  },
];

const faqs = [
  {
    q: 'Is MileClear really free?',
    a: 'Yes, genuinely. The free plan has no trip limits, no time limits, and no paywall on the tracker itself. The Self Assessment wizard, Tax Readiness card, HMRC Reconciliation, expenses, receipt scanning, MOT history and the web dashboard are all free for everyone. It is not a trial - it stays free for as long as you use it.',
  },
  {
    q: 'Does MileClear cap how many trips I can track on the free tier?',
    a: 'No. Trip tracking is unlimited and free forever - no monthly drive cap. That is the biggest difference between MileClear and the US-built alternatives most UK drivers are pointed at: MileIQ stops at 40 drives a month on its free tier and Driversnote at 15. A full-time gig driver or a DPD ODF burns through either inside the first shift. Pro is for exports, Open Banking, automation and business insights, never for the tracker.',
  },
  {
    q: 'What does the free plan limit?',
    a: 'Three things: one vehicle (Pro is unlimited), two saved locations (Pro is unlimited), and three tracked invoices a month (Pro is unlimited). Everything else on the free list has no cap.',
  },
  {
    q: 'What happens when I upgrade to Pro?',
    a: 'You unlock the print-ready Self Assessment PDF, PDF and CSV exports, the Accountant Portal, Open Banking earnings import, CSV earnings import, Auto-Classify Rules, business insights (golden hours, P&L, shift grades), Driving Analytics, the Journey Map, pickup-wait community insights, and unlimited vehicles, saved locations and invoices. Everything switches on the moment your payment goes through.',
  },
  {
    q: 'Where does MileClear run?',
    a: 'iPhone and iPad on the App Store, Android in closed beta on Google Play (leave your email at mileclear.com/android to join), and a full web dashboard at mileclear.com for trips, shifts, vehicles, fuel, earnings, expenses, exports and tax - all on one account.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes, with no penalty. You can cancel from within the app at any time - go to Profile and scroll to the Subscription section. Your Pro access continues until the end of your current billing period, and you will not be charged again after that. There is no cancellation fee.',
  },
  {
    q: 'Is there a free trial?',
    a: 'There is no time-limited trial, but the free plan is genuinely comprehensive. You can use the tracker, the Self Assessment wizard, the Tax Readiness card, expenses, receipt scanning, HMRC Reconciliation, MOT history and the web dashboard in full before deciding whether the Pro tools are worth it for you. Referring a driver also gives you both a month of Pro.',
  },
  {
    q: 'Do I need Pro to file my Self Assessment?',
    a: 'You do not need Pro to track your mileage, see your HMRC deduction build up, log expenses, or use the Self Assessment wizard that maps your numbers to specific SA103 form boxes - all of that is on the free plan. Pro is for the export workflow: the wizard\'s figures as a print-ready PDF, a mileage log with a signed cover sheet that HMRC inspectors recognise, and the Accountant Portal that lets you share read-only access by email. If you do your own return manually using just the numbers, free is enough.',
  },
  {
    q: 'Does MileClear connect to Xero, QuickBooks or FreeAgent?',
    a: 'Not yet. You can export CSV and PDF today and import those yourself; direct accounting integrations are on the roadmap and will be announced on the Updates page when they ship.',
  },
  {
    q: 'How does payment work?',
    a: 'On iPhone, Pro is sold through Apple In-App Purchase; on Android, through Google Play Billing; on the web, through Stripe. Your card details stay with Apple, Google or Stripe - we never see them. Manage or cancel from your App Store or Google Play subscriptions, or from MileClear Profile.',
  },
  {
    q: 'Do you offer an annual plan?',
    a: 'Yes. Pro is £4.99/month or £44.99/year - the annual plan works out at under £3.75 a month, so you save £14.89, about three months. You can pick either when you upgrade.',
  },
];

export default function PricingPage() {
  const product = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'MileClear',
    description:
      'UK mileage tracker for gig workers, delivery drivers, and self-employed drivers, on iPhone, Android (beta) and the web. Free unlimited GPS tracking, HMRC deduction calculator, Self Assessment wizard, expenses and invoicing. Pro adds exports, Open Banking, automation and business insights.',
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
          'Unlimited GPS trip tracking, Self Assessment wizard, Tax Readiness card, HMRC Reconciliation, expenses and receipt scanning, invoicing (3 a month), 1 vehicle with MOT history and reminders, fuel prices, benchmarking, achievements and recaps, web dashboard. Free forever.',
      },
      {
        '@type': 'Offer',
        name: 'Pro Monthly',
        price: '4.99',
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
        url: 'https://mileclear.com/pricing',
        description:
          'Print-ready Self Assessment PDF, PDF and CSV exports with HMRC attestation cover sheet, Accountant Portal, Open Banking and CSV earnings import, Auto-Classify Rules, business insights, Driving Analytics, Journey Map, pickup-wait community insights, unlimited vehicles, saved locations and invoices.',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '4.99',
          priceCurrency: 'GBP',
          unitCode: 'MON',
          unitText: 'month',
          billingDuration: 'P1M',
        },
      },
      {
        '@type': 'Offer',
        name: 'Pro Annual',
        price: '44.99',
        priceCurrency: 'GBP',
        availability: 'https://schema.org/InStock',
        url: 'https://mileclear.com/pricing',
        description:
          'Print-ready Self Assessment PDF, PDF and CSV exports with HMRC attestation cover sheet, Accountant Portal, Open Banking and CSV earnings import, Auto-Classify Rules, business insights, Driving Analytics, Journey Map, pickup-wait community insights, unlimited vehicles, saved locations and invoices. Billed yearly.',
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: '44.99',
          priceCurrency: 'GBP',
          unitCode: 'ANN',
          unitText: 'year',
          billingDuration: 'P1Y',
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
              Track every mile for free, with no monthly drive cap - unlike MileIQ (40/month) or Driversnote (15/month). Upgrade to Pro when you need exports, Open Banking, automation and business insights. iPhone, Android (beta) and web, one account.
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
                  Unlimited tracking, the Self Assessment wizard, expenses, invoicing and the web dashboard. Forever free.
                </p>
                <ul className="p-card__list">
                  {freeFeatures.map((group) => (
                    <li key={group.title} className="p-card__group">
                      <p className="p-card__group-title">{group.title}</p>
                      <ul className="p-card__list">
                        {group.items.map((feature) => (
                          <li key={feature} className="p-card__item">
                            <Tick />
                            {feature}
                          </li>
                        ))}
                      </ul>
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
                <p className="p-card__period" style={{ marginTop: '-0.5rem', marginBottom: '0.75rem' }}>
                  or &pound;44.99/year (save &pound;14.89 - about three months free)
                </p>
                <p className="p-card__desc">
                  Filing-ready exports, Accountant Portal, Open Banking, auto-classification and the full business-insights toolkit for self-employed drivers.
                </p>
                <p className="p-card__group-title">Everything in Free, plus:</p>
                <ul className="p-card__list">
                  {proFeatures.map((group) => (
                    <li key={group.title} className="p-card__group">
                      <p className="p-card__group-title">{group.title}</p>
                      <ul className="p-card__list">
                        {group.items.map((feature) => (
                          <li key={feature} className="p-card__item">
                            <Tick pro />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            <p className="pricing__footnote">
              Cancel anytime from inside the app. No card needed to start on the free plan. Making Tax Digital quarterly submission is in HMRC sandbox testing and not yet available.
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
              Free on iPhone, in beta on Android, and on the web. No credit card needed.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
              <StoreButtons align="center" />

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
