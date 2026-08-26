import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import BreadcrumbsJsonLd from '@/components/seo/BreadcrumbsJsonLd';
import DeleteAccountForm from './DeleteAccountForm';
import '../legal.css';
import '../support/support.css';

export const metadata: Metadata = {
  title: 'Delete your account',
  description:
    'How to delete your MileClear account and the data that goes with it. Delete it from inside the app, or request deletion here if you no longer have the app installed.',
  alternates: {
    canonical: 'https://mileclear.com/delete-account',
  },
  openGraph: {
    title: 'Delete your account | MileClear',
    description: 'Delete your MileClear account from inside the app, or request deletion here.',
    url: 'https://mileclear.com/delete-account',
    images: [{ url: '/branding/og-image.png', width: 1200, height: 628 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Delete your account | MileClear',
    description: 'Delete your MileClear account from inside the app, or request deletion here.',
    images: ['/branding/og-image.png'],
  },
};

export default function DeleteAccountPage() {
  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: 'Delete your account', path: '/delete-account' }]} />
      <Navbar />

      <main className="legal">
        <div className="container">

          <div className="legal__header">
            <h1 className="heading">Delete your account</h1>
            <p className="legal__date">
              You can delete your MileClear account at any time. Here is what gets removed, what we have to
              keep, and the two ways to do it.
            </p>
          </div>

          <div className="legal__content">

            <section id="what-is-deleted" className="legal__section">
              <h2 className="legal__section-title">What deleting your account removes</h2>
              <p className="legal__text">
                Deleting your account permanently removes your login and everything stored against it on our
                servers. That includes:
              </p>
              <ul className="legal__list">
                <li className="legal__list-item">Your account, profile, email address and sign-in details (including Apple or Google sign-in links)</li>
                <li className="legal__list-item">All trips, GPS route coordinates and shifts</li>
                <li className="legal__list-item">Vehicles and fuel logs</li>
                <li className="legal__list-item">Earnings, expenses, invoices and clients</li>
                <li className="legal__list-item">Saved locations and geofences</li>
                <li className="legal__list-item">Achievements, streaks and mileage summaries</li>
                <li className="legal__list-item">Open Banking connections and any accountant sharing links</li>
                <li className="legal__list-item">Push notification tokens, session tokens and device diagnostics</li>
                <li className="legal__list-item">The link between your account and your Stripe or App Store subscription</li>
              </ul>
              <div className="legal__card legal__card--warning">
                <p className="legal__card-text">
                  <strong>This cannot be undone.</strong> If you might need your mileage records for a tax return,
                  export them first. In the app go to Exports, or on the web dashboard go to Settings and choose
                  &ldquo;Download my data&rdquo; before you delete.
                </p>
              </div>
            </section>

            <section id="subscriptions" className="legal__section">
              <h2 className="legal__section-title">Subscriptions</h2>
              <ul className="legal__list">
                <li className="legal__list-item">
                  <strong>Paid on the web (Stripe):</strong> your subscription is cancelled automatically when the account is deleted.
                </li>
                <li className="legal__list-item">
                  <strong>Paid through the App Store or Google Play:</strong> deleting your MileClear account does not cancel the
                  subscription, because Apple and Google manage the billing. Cancel it yourself in your App Store or Google Play
                  subscription settings, otherwise you may continue to be charged.
                </li>
              </ul>
            </section>

            <section id="what-is-kept" className="legal__section">
              <h2 className="legal__section-title">What we keep</h2>
              <p className="legal__text">
                We keep as little as possible. After deletion:
              </p>
              <ul className="legal__list">
                <li className="legal__list-item">
                  We keep a record that the account was deleted (the email address, the date, and whether it had an active
                  subscription) so we can show the deletion happened and handle any later billing query.
                </li>
                <li className="legal__list-item">
                  Feature requests and feedback you posted in the app stay visible but are no longer linked to you.
                </li>
                <li className="legal__list-item">
                  Anonymised usage statistics with nothing that identifies you may be kept for analytics.
                </li>
                <li className="legal__list-item">
                  Records we are required to hold under UK tax law, or by a court order, may be retained for up to 7 years.
                </li>
                <li className="legal__list-item">
                  Encrypted backups are purged within 30 days of your deletion request.
                </li>
              </ul>
              <p className="legal__text legal__text--small">
                Full details are in the Data Retention section of our{' '}
                <a href="/privacy#retention" className="legal__footer-link">Privacy Policy</a>.
              </p>
            </section>

            <section id="in-app" className="legal__section">
              <h2 className="legal__section-title">Option 1: delete from inside the app</h2>
              <p className="legal__text">
                This is the quickest route and takes effect immediately.
              </p>
              <ol className="legal__list">
                <li className="legal__list-item">Open MileClear and go to <strong>Profile</strong>.</li>
                <li className="legal__list-item">Scroll to the bottom and tap <strong>Delete Account</strong>.</li>
                <li className="legal__list-item">Enter your password to confirm. If you only ever signed in with Apple or Google, there is no password step.</li>
              </ol>
              <p className="legal__text legal__text--small">
                You can also do this on the web at <a href="/dashboard/settings" className="legal__footer-link">mileclear.com/dashboard/settings</a>.
              </p>
            </section>

            <section id="request" className="legal__section">
              <h2 className="legal__section-title">Option 2: request deletion here</h2>
              <p className="legal__text">
                If you no longer have the app installed or cannot sign in, send us a request using the form below.
              </p>
              <ul className="legal__list">
                <li className="legal__list-item">
                  The request must come from the email address registered to the account. If it does not match, we will ask
                  you to confirm from that address before we delete anything.
                </li>
                <li className="legal__list-item">We action deletion requests within 30 days.</li>
                <li className="legal__list-item">We will email the address you give to confirm once the account has been deleted.</li>
              </ul>
              <DeleteAccountForm />
              <p className="legal__text legal__text--small" style={{ marginTop: '1rem' }}>
                Prefer email? Write to{' '}
                <a href="mailto:support@mileclear.com?subject=Account%20deletion%20request" className="legal__footer-link">
                  support@mileclear.com
                </a>{' '}
                with the subject &ldquo;Account deletion request&rdquo; from the email address on your account.
              </p>
            </section>

            <div className="legal__footer">
              <p className="legal__footer-text">&copy; 2026 MileClear. All rights reserved.</p>
              <div className="legal__footer-links">
                <a href="/privacy" className="legal__footer-link">Privacy Policy</a>
                <a href="/terms" className="legal__footer-link">Terms of Service</a>
                <a href="/support" className="legal__footer-link">Support</a>
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
