import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import BreadcrumbsJsonLd from '@/components/seo/BreadcrumbsJsonLd';
import '../legal.css';
import './faq.css';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Frequently asked questions about MileClear, the UK mileage tracker for gig workers. HMRC rates, trip tracking, subscriptions, and more.',
  alternates: {
    canonical: 'https://mileclear.com/faq',
  },
  openGraph: {
    title: 'FAQ | MileClear',
    description:
      'Frequently asked questions about MileClear, the UK mileage tracker for gig workers. HMRC rates, trip tracking, subscriptions, and more.',
    url: 'https://mileclear.com/faq',
    images: [{ url: '/branding/og-image.png', width: 1200, height: 628 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FAQ | MileClear',
    description:
      'Frequently asked questions about MileClear, the UK mileage tracker for gig workers. HMRC rates, trip tracking, subscriptions, and more.',
    images: ['/branding/og-image.png'],
  },
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    // Getting Started
    {
      '@type': 'Question',
      name: 'How do I get started with MileClear?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Download MileClear from the App Store, create a free account, and add your vehicle. MileClear will walk you through a short onboarding to set your vehicle type and fuel type. Once done, tap "Start Shift" on the dashboard to begin tracking your first journey.',
      },
    },
    {
      '@type': 'Question',
      name: 'What permissions does MileClear need?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MileClear requires "Always On" location access to track trips in the background while you drive. Without this permission, drive detection and background tracking will not work. Motion & Fitness access is optional but helps with trip start detection. Notifications are optional but recommended for streak reminders and weekly summaries.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does MileClear work without an internet connection?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. MileClear is offline-first. Trips, shifts, fuel logs, and earnings are saved directly to your device and synced to the cloud when you reconnect. You will never lose data because of a poor signal.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are Work mode and Personal mode?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Work mode is designed for gig workers and self-employed drivers who need to track business mileage for HMRC. It shows your tax deduction, earnings by platform, and business efficiency metrics. Personal mode is for everyday drivers who want to monitor fuel costs, driving goals, and personal milestones. You can switch between modes at any time from the dashboard.',
      },
    },
    // Trip Tracking
    {
      '@type': 'Question',
      name: 'How does automatic trip tracking work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MileClear uses your phone\'s GPS to record your route when a shift is active. Start a shift on the dashboard and trips are tracked automatically as you drive, with stop detection separating individual journeys. You can also enable drive detection, which monitors for significant movement above 15 mph and prompts you to start tracking even if you forgot to open the app.',
      },
    },
    {
      '@type': 'Question',
      name: 'How accurate is the mileage tracking?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MileClear uses high-accuracy GPS combined with OSRM road routing to calculate distances. Rather than using straight-line (as-the-crow-flies) distances, it snaps your journey to actual roads for a realistic mileage figure. GPS samples are taken every 50 metres while driving.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is drive detection?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Drive detection watches for significant location changes above 15 mph in the background. When it detects that you are probably driving, it sends a notification with two action buttons: "Track Trip" to immediately start recording from your current position, or "Not Driving" to dismiss. Buffered location data from before you tapped is included, so your trip starts from where you actually departed rather than where you tapped the notification.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I log trips manually?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. On the Trips screen, tap the add button and choose manual entry. You can specify a start location, end location, date, distance, classification, and platform tag. Manual trips are calculated using road routing where possible.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I classify trips as business or personal?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'When a trip ends, you can classify it as Business or Personal. You can also add a platform tag (Uber, Deliveroo, Amazon Flex, Just Eat, and others). Unclassified trips appear in your dashboard as a reminder to categorise them. You can edit classification at any time from the Trips screen.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I merge trips that were split incorrectly?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. If a journey is split into multiple trips (for example after a stop at a petrol station), long-press any trip to enter selection mode, select up to 20 trips, and tap Merge. You choose the classification for the merged trip. Merging is permanent and cannot be undone.',
      },
    },
    // HMRC & Tax
    {
      '@type': 'Question',
      name: 'What are the HMRC approved mileage rates?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'For cars and vans: 45p per mile for the first 10,000 business miles in a tax year, and 25p per mile after that. For motorbikes: 24p per mile flat rate. These are the HMRC Approved Mileage Allowance Payment (AMAP) rates and MileClear calculates your deduction automatically using these figures.',
      },
    },
    {
      '@type': 'Question',
      name: 'What counts as a business mile?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A business mile is any journey made wholly and exclusively for work purposes. This includes travelling to a customer, picking up a delivery order, driving between depots, or visiting a client. Normal commuting to a fixed place of work does not count. If you work for gig platforms like Uber or Deliveroo, all miles driven during active jobs qualify. MileClear lets you classify each trip so only business miles count toward your deduction.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does the UK tax year work in MileClear?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The UK tax year runs from 6 April to 5 April the following year. MileClear automatically groups your mileage and deductions by tax year. When you cross the 10,000-mile threshold within a year, the rate automatically drops from 45p to 25p per mile. Your exports include a per-tax-year breakdown ready for your Self Assessment return.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I use MileClear for my Self Assessment tax return?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. MileClear Pro generates a PDF Self Assessment export that includes your total business miles, deduction amount, vehicle breakdown, and tax year summary. It also exports a detailed trip log as CSV or PDF. These documents are designed to be submitted directly as mileage evidence for your Self Assessment. See the Exports section of the app or visit our pricing page at mileclear.com/pricing to learn more about Pro.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I claim fuel costs on top of the HMRC mileage deduction?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. If you use HMRC approved mileage rates (AMAP), you cannot also claim separate fuel costs. The mileage rate is designed to cover fuel, servicing, insurance, and depreciation. You claim one or the other, not both. MileClear uses AMAP rates. If you are a company car driver, different rules apply and you should consult a tax adviser.',
      },
    },
    // Billing & Subscriptions
    {
      '@type': 'Question',
      name: 'What is included in the free plan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The free plan includes unlimited GPS trip tracking, shift management, drive detection, business and personal trip classification, platform tags, vehicle management with DVLA lookup, fuel logs and nearby fuel prices from 8,300 stations across the UK, manual earnings tracking, all 43 achievements and gamification features, up to 2 saved locations with geofencing, and push notifications.',
      },
    },
    {
      '@type': 'Question',
      name: 'What does MileClear Pro include?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MileClear Pro (£4.99 per month or £44.99 per year) adds: HMRC-ready PDF and CSV trip exports, Self Assessment PDF, bulk CSV earnings import, Open Banking via Plaid for automatic earnings sync, unlimited saved locations with geofencing, and accounting software previews for Xero, FreeAgent, and QuickBooks.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I cancel my subscription?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'On iOS, go to Profile, scroll to Subscription, and tap Manage Subscription. This takes you to your Apple subscription settings where you can cancel. On the web, go to Settings and use the Cancel Subscription option. You keep Pro access until the end of your current billing period and are never charged again after cancelling.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there an annual plan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. MileClear Pro is available for £44.99 per year, which works out at around £3.75 per month - saving you over 25% compared to the monthly plan. The annual plan is available on the web dashboard.',
      },
    },
    // Data & Privacy
    {
      '@type': 'Question',
      name: 'Where is my data stored?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Trip data is saved locally on your device in an encrypted SQLite database first, then synced to MileClear servers when you are online. The server is hosted in the UK on UK infrastructure. We do not use US-based cloud providers for your personal data. See our Privacy Policy at mileclear.com/privacy for full details.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is MileClear GDPR compliant?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. MileClear is fully GDPR compliant. You can export all your data as a JSON file from Profile, and you can permanently delete your account and all associated data at any time. We only collect data that is necessary for the app to function. We never sell your data. Read the full Privacy Policy at mileclear.com/privacy.',
      },
    },
    {
      '@type': 'Question',
      name: 'What diagnostic data does MileClear collect?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'MileClear sends diagnostic telemetry on startup to help us improve drive detection reliability. This includes your app version, GPS permission status, detection event logs (timestamps and event types only), and configuration settings. We do not send GPS coordinates, Bluetooth device names, or any personal location information. The data is tied to your account for debugging purposes only.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do I delete my account?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Go to Profile, scroll to the bottom, and tap Delete Account. You will be asked to confirm your password. Deleting your account permanently removes all trips, earnings, shifts, vehicles, and personal data from our servers. This action cannot be undone. Any active subscription will also be cancelled.',
      },
    },
  ],
};

export default function FaqPage() {
  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: 'FAQ', path: '/faq' }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <Navbar />

      <main className="legal faq">
        <div className="container">

          <div className="legal__header">
            <span className="label">Help</span>
            <h1 className="heading">Frequently Asked Questions</h1>
            <p className="subtext">
              Everything you need to know about MileClear. Can&apos;t find your answer?{' '}
              <a href="/support" style={{ color: 'var(--amber-400)' }}>Contact us</a>.
            </p>
          </div>

          <div className="legal__content">

            {/* ---- Getting Started ---- */}
            <section className="legal__section faq__section" id="getting-started">
              <h2 className="legal__section-title">Getting Started</h2>

              <div className="faq__qa">
                <h3 className="faq__question">How do I get started with MileClear?</h3>
                <p className="legal__text">
                  Download MileClear from the App Store, create a free account, and add your vehicle.
                  MileClear will walk you through a short onboarding to set your vehicle type and fuel
                  type. Once done, tap <strong>Start Shift</strong> on the dashboard to begin tracking
                  your first journey.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">What permissions does MileClear need?</h3>
                <p className="legal__text">
                  MileClear requires <strong>Always On</strong> location access to track trips in the
                  background while you drive. Without this permission, drive detection and background
                  tracking will not work. Motion and Fitness access is optional but helps with trip
                  start detection. Notifications are optional but recommended for streak reminders
                  and weekly summaries.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">Does MileClear work without an internet connection?</h3>
                <p className="legal__text">
                  Yes. MileClear is offline-first. Trips, shifts, fuel logs, and earnings are saved
                  directly to your device and synced to the cloud when you reconnect. You will never
                  lose data because of a poor signal.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">What are Work mode and Personal mode?</h3>
                <p className="legal__text">
                  <strong>Work mode</strong> is designed for gig workers and self-employed drivers who
                  need to track business mileage for HMRC. It shows your tax deduction, earnings by
                  platform, and business efficiency metrics. <strong>Personal mode</strong> is for
                  everyday drivers who want to monitor fuel costs, driving goals, and personal
                  milestones. You can switch between modes at any time from the dashboard.
                </p>
              </div>
            </section>

            {/* ---- Trip Tracking ---- */}
            <section className="legal__section faq__section" id="trip-tracking">
              <h2 className="legal__section-title">Trip Tracking</h2>

              <div className="faq__qa">
                <h3 className="faq__question">How does automatic trip tracking work?</h3>
                <p className="legal__text">
                  MileClear uses your phone&apos;s GPS to record your route when a shift is active.
                  Start a shift on the dashboard and trips are tracked automatically as you drive,
                  with stop detection separating individual journeys. You can also enable{' '}
                  <strong>drive detection</strong>, which monitors for significant movement above 15
                  mph and prompts you to start tracking even if you forgot to open the app.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">How accurate is the mileage tracking?</h3>
                <p className="legal__text">
                  MileClear uses high-accuracy GPS combined with OSRM road routing to calculate
                  distances. Rather than using straight-line distances, it snaps your journey to
                  actual roads for a realistic mileage figure. GPS samples are taken every 50 metres
                  while driving.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">What is drive detection?</h3>
                <p className="legal__text">
                  Drive detection watches for significant location changes above 15 mph in the
                  background. When it detects that you are probably driving, it sends a notification
                  with two action buttons: <strong>Track Trip</strong> to immediately start recording
                  from your current position, or <strong>Not Driving</strong> to dismiss. Buffered
                  location data from before you tapped is included, so your trip starts from where
                  you actually departed rather than where you tapped the notification.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">Can I log trips manually?</h3>
                <p className="legal__text">
                  Yes. On the Trips screen, tap the add button and choose manual entry. You can
                  specify a start location, end location, date, distance, classification, and platform
                  tag. Manual trips are calculated using road routing where possible.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">How do I classify trips as business or personal?</h3>
                <p className="legal__text">
                  When a trip ends you can classify it as <strong>Business</strong> or{' '}
                  <strong>Personal</strong>. You can also add a platform tag (Uber, Deliveroo, Amazon
                  Flex, Just Eat, and others). Unclassified trips appear in your dashboard as a
                  reminder to categorise them. You can edit classification at any time from the Trips
                  screen.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">Can I merge trips that were split incorrectly?</h3>
                <p className="legal__text">
                  Yes. If a journey is split into multiple trips - for example after a stop at a
                  petrol station - long-press any trip to enter selection mode, select up to 20 trips,
                  and tap Merge. You choose the classification for the merged trip. Merging is
                  permanent and cannot be undone.
                </p>
              </div>
            </section>

            {/* ---- HMRC & Tax ---- */}
            <section className="legal__section faq__section" id="hmrc-tax">
              <h2 className="legal__section-title">HMRC &amp; Tax</h2>

              <div className="faq__qa">
                <h3 className="faq__question">What are the HMRC approved mileage rates?</h3>
                <p className="legal__text">
                  For <strong>cars and vans</strong>: 45p per mile for the first 10,000 business
                  miles in a tax year, and 25p per mile after that. For <strong>motorbikes</strong>:
                  24p per mile flat rate. These are the HMRC Approved Mileage Allowance Payment
                  (AMAP) rates and MileClear calculates your deduction automatically using these
                  figures.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">What counts as a business mile?</h3>
                <p className="legal__text">
                  A business mile is any journey made wholly and exclusively for work purposes. This
                  includes travelling to a customer, picking up a delivery order, driving between
                  depots, or visiting a client. Normal commuting to a fixed place of work does not
                  count. If you work for gig platforms like Uber or Deliveroo, all miles driven during
                  active jobs qualify. MileClear lets you classify each trip so only business miles
                  count toward your deduction.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">How does the UK tax year work in MileClear?</h3>
                <p className="legal__text">
                  The UK tax year runs from <strong>6 April to 5 April</strong> the following year.
                  MileClear automatically groups your mileage and deductions by tax year. When you
                  cross the 10,000-mile threshold within a year, the rate automatically drops from
                  45p to 25p per mile. Your exports include a per-tax-year breakdown ready for your
                  Self Assessment return.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">Can I use MileClear for my Self Assessment tax return?</h3>
                <p className="legal__text">
                  Yes. MileClear Pro generates a PDF Self Assessment export that includes your total
                  business miles, deduction amount, vehicle breakdown, and tax year summary. It also
                  exports a detailed trip log as CSV or PDF. These documents are designed to be
                  submitted directly as mileage evidence for your Self Assessment.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">Can I claim fuel costs on top of the HMRC mileage deduction?</h3>
                <p className="legal__text">
                  No. If you use HMRC approved mileage rates (AMAP), you cannot also claim separate
                  fuel costs. The mileage rate is designed to cover fuel, servicing, insurance, and
                  depreciation - you claim one or the other, not both. MileClear uses AMAP rates. If
                  you are a company car driver, different rules apply and you should consult a tax
                  adviser.
                </p>
              </div>
            </section>

            {/* ---- Billing & Subscriptions ---- */}
            <section className="legal__section faq__section" id="billing">
              <h2 className="legal__section-title">Billing &amp; Subscriptions</h2>

              <div className="faq__qa">
                <h3 className="faq__question">What is included in the free plan?</h3>
                <p className="legal__text">
                  The free plan includes unlimited GPS trip tracking, shift management, drive
                  detection, business and personal trip classification, platform tags, vehicle
                  management with DVLA lookup, fuel logs and nearby fuel prices from over 8,300
                  stations across the UK, manual earnings tracking, all 43 achievements and
                  gamification features, up to 2 saved locations with geofencing, and push
                  notifications.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">What does MileClear Pro include?</h3>
                <p className="legal__text">
                  MileClear Pro adds HMRC-ready PDF and CSV trip exports, Self Assessment PDF, bulk
                  CSV earnings import, Open Banking via Plaid for automatic earnings sync, unlimited
                  saved locations with geofencing, and accounting software previews for Xero,
                  FreeAgent, and QuickBooks. See{' '}
                  <a href="/pricing" style={{ color: 'var(--amber-400)' }}>our pricing page</a>{' '}
                  for plan details.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">Is there an annual plan?</h3>
                <p className="legal__text">
                  Yes. MileClear Pro is available for <strong>£44.99 per year</strong>, which works
                  out at around £3.75 per month - saving you over 25% compared to the monthly plan at
                  £4.99. The annual plan is available on the web dashboard.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">How do I cancel my subscription?</h3>
                <p className="legal__text">
                  On iOS, go to Profile, scroll to Subscription, and tap Manage Subscription. This
                  takes you to your Apple subscription settings where you can cancel. On the web, go
                  to Settings and use the Cancel Subscription option. You keep Pro access until the
                  end of your current billing period and are never charged again after cancelling.
                </p>
              </div>
            </section>

            {/* ---- Data & Privacy ---- */}
            <section className="legal__section faq__section" id="data-privacy">
              <h2 className="legal__section-title">Data &amp; Privacy</h2>

              <div className="faq__qa">
                <h3 className="faq__question">Where is my data stored?</h3>
                <p className="legal__text">
                  Trip data is saved locally on your device first, then synced to MileClear servers
                  when you are online. The server is hosted in the UK on UK infrastructure. We do
                  not use US-based cloud providers for your personal data. See our{' '}
                  <a href="/privacy" style={{ color: 'var(--amber-400)' }}>Privacy Policy</a>{' '}
                  for full details.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">Is MileClear GDPR compliant?</h3>
                <p className="legal__text">
                  Yes. MileClear is fully GDPR compliant. You can export all your data as a JSON
                  file from Profile, and you can permanently delete your account and all associated
                  data at any time. We only collect data that is necessary for the app to function.
                  We never sell your data. Read the full{' '}
                  <a href="/privacy" style={{ color: 'var(--amber-400)' }}>Privacy Policy</a>.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">What diagnostic data does MileClear collect?</h3>
                <p className="legal__text">
                  MileClear sends diagnostic telemetry on startup to help us improve drive detection
                  reliability. This includes your app version, GPS permission status, detection event
                  logs (timestamps and event types only), and configuration settings. We do not send
                  GPS coordinates, Bluetooth device names, or any personal location information. The
                  data is tied to your account for debugging purposes only.
                </p>
              </div>

              <div className="faq__qa">
                <h3 className="faq__question">How do I delete my account?</h3>
                <p className="legal__text">
                  Go to Profile, scroll to the bottom, and tap <strong>Delete Account</strong>. You
                  will be asked to confirm your password. Deleting your account permanently removes
                  all trips, earnings, shifts, vehicles, and personal data from our servers. This
                  action cannot be undone. Any active subscription will also be cancelled.
                </p>
              </div>
            </section>

            {/* ---- Still need help ---- */}
            <div className="faq__cta">
              <p className="legal__text" style={{ marginBottom: '1.25rem' }}>
                Still have a question? We&apos;re happy to help.
              </p>
              <div className="faq__cta-links">
                <a href="/support" className="faq__cta-btn faq__cta-btn--primary">
                  Contact Support
                </a>
                <a href="/features" className="faq__cta-btn faq__cta-btn--ghost">
                  See All Features
                </a>
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
