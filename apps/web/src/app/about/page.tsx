import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import BreadcrumbsJsonLd from '@/components/seo/BreadcrumbsJsonLd';
import '../legal.css';
import './about.css';

export const metadata: Metadata = {
  title: 'About MileClear',
  description:
    'MileClear was built by Anthony Gair, a software developer from the North East of England, to solve his own frustration with existing mileage trackers.',
  alternates: {
    canonical: 'https://mileclear.com/about',
  },
  openGraph: {
    title: 'About MileClear',
    description:
      'MileClear was built by Anthony Gair, a software developer from the North East of England, to solve his own frustration with existing mileage trackers.',
    url: 'https://mileclear.com/about',
    images: [{ url: '/branding/og-image.png', width: 1200, height: 628 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About MileClear',
    description:
      'MileClear was built by Anthony Gair, a software developer from the North East of England, to solve his own frustration with existing mileage trackers.',
    images: ['/branding/og-image.png'],
  },
};

const personSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Anthony Gair',
  jobTitle: 'Founder & Developer',
  url: 'https://mileclear.com/about',
  sameAs: [],
};

export default function AboutPage() {
  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: 'About', path: '/about' }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />
      <Navbar />

      <main className="legal about">
        <div className="container">

          <div className="legal__header">
            <span className="label">About</span>
            <h1 className="heading">About MileClear</h1>
            <p className="subtext">
              Built for UK drivers, by a UK developer.
            </p>
          </div>

          <div className="legal__content">

            {/* ---- The Story ---- */}
            <section className="legal__section" id="the-story">
              <h2 className="legal__section-title">The Story</h2>
              <p className="legal__text">
                MileClear was built by <strong>Anthony Gair</strong>, a software developer from the
                North East of England. Launched in <strong>March 2026</strong>, it was born from
                personal frustration with existing mileage trackers that were either US-focused
                (MileIQ), expensive, or simply inaccurate for UK roads.
              </p>
              <p className="legal__text">
                Anthony built MileClear to solve his own problem: a mileage tracker designed from
                the ground up for UK drivers, with HMRC rates built in, UK tax years handled
                correctly, and the gig platforms UK drivers actually use supported from day one.
              </p>
              <p className="legal__text">
                No American mileage rates. No confusing currency conversion. No features that only
                make sense if you file taxes in April rather than January.
              </p>
            </section>

            {/* ---- Why MileClear Exists ---- */}
            <section className="legal__section about__section--highlight" id="why">
              <h2 className="legal__section-title">Why MileClear Exists</h2>
              <p className="legal__text">
                Every popular mileage app on the market was built for American drivers. UK
                self-employed workers and gig drivers needed something that understood HMRC
                simplified mileage rates, the UK tax year (6 April to 5 April), and the
                platforms UK drivers actually use.
              </p>
              <div className="about__platform-grid">
                {[
                  'Uber', 'Deliveroo', 'Amazon Flex', 'Just Eat',
                  'Stuart', 'DPD', 'Evri', 'Gophr', 'Yodel', 'Bolt',
                ].map((platform) => (
                  <span key={platform} className="about__platform-tag">{platform}</span>
                ))}
              </div>
              <p className="legal__text">
                MileClear supports all of these platforms natively. When you log a trip, you can
                tag it to the platform you were working for. Your earnings, business miles, and
                HMRC deductions are broken down per platform so you can see exactly where your
                income and mileage come from.
              </p>
              <p className="legal__text">
                The 45p and 25p HMRC rates are built in from the start - not an afterthought. The
                10,000-mile threshold is tracked automatically. Tax year summaries are generated
                the way HMRC expects them. And it works offline, because gig drivers often work
                in areas with poor mobile signal.
              </p>
            </section>

            {/* ---- Built for Gig Workers, by a Developer ---- */}
            <section className="legal__section" id="built-by">
              <h2 className="legal__section-title">Built for Gig Workers, by a Developer</h2>
              <p className="legal__text">
                MileClear is a one-person project. Every line of code, every design decision, and
                every feature has been built by Anthony. There is no team of product managers or
                investors pushing features that do not matter to UK drivers.
              </p>
              <p className="legal__text">
                The app is self-hosted on UK infrastructure, fully GDPR compliant, and built with
                a focus on accuracy and reliability. Your data stays in the UK. It is never sold.
                You can export or delete it at any time.
              </p>
              <p className="legal__text">
                Because it is a one-person project, MileClear moves fast. Bugs are fixed quickly.
                Features that users ask for get built. The{' '}
                <a href="/updates" style={{ color: 'var(--amber-400)' }}>updates page</a>{' '}
                has a full history of every release and what changed.
              </p>
            </section>

            {/* ---- What's Next ---- */}
            <section className="legal__section" id="whats-next">
              <h2 className="legal__section-title">What&apos;s Next</h2>
              <p className="legal__text">
                MileClear is actively developed with regular updates. Current focus areas include:
              </p>
              <ul className="legal__list" style={{ marginBottom: '1rem' }}>
                <li className="legal__list-item">
                  Improving auto-trip detection reliability across more device types and Android
                </li>
                <li className="legal__list-item">
                  Expanding business intelligence features - route analytics, shift grading
                  improvements, and smarter golden hours
                </li>
                <li className="legal__list-item">
                  Preparing for an Android launch later in 2026
                </li>
                <li className="legal__list-item">
                  Accounting software integrations for Xero, FreeAgent, and QuickBooks
                </li>
              </ul>
              <p className="legal__text">
                The full development blog is on the{' '}
                <a href="/updates" style={{ color: 'var(--amber-400)' }}>updates page</a>.
                Every release is documented, including what was fixed, what was added, and why.
              </p>
            </section>

            {/* ---- CTA ---- */}
            <div className="about__cta">
              <div className="about__cta-inner">
                <h2 className="about__cta-title">Ready to track every mile?</h2>
                <p className="about__cta-sub">
                  Free to download. No credit card required. HMRC rates built in from day one.
                </p>
                <div className="about__cta-links">
                  <a
                    href="https://apps.apple.com/gb/app/mileclear/id6743638010"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about__cta-btn about__cta-btn--primary"
                  >
                    Download on the App Store
                  </a>
                  <a href="/features" className="about__cta-btn about__cta-btn--ghost">
                    See All Features
                  </a>
                </div>
              </div>
            </div>

            {/* ---- Footer links ---- */}
            <div className="legal__footer">
              <p className="legal__footer-text">Questions or feedback?</p>
              <p className="legal__footer-text">
                <a href="mailto:support@mileclear.com" className="legal__footer-link">
                  support@mileclear.com
                </a>
              </p>
              <div className="legal__footer-links">
                <a href="/features" className="legal__footer-link">Features</a>
                <a href="/pricing" className="legal__footer-link">Pricing</a>
                <a href="/updates" className="legal__footer-link">Updates</a>
                <a href="/privacy" className="legal__footer-link">Privacy Policy</a>
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
