import type { Metadata } from 'next';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import BreadcrumbsJsonLd from '@/components/seo/BreadcrumbsJsonLd';
import '../legal.css';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for MileClear. Covers account usage, subscriptions, billing, data ownership, and liability for UK gig workers and self-employed drivers.',
  alternates: {
    canonical: 'https://mileclear.com/terms',
  },
  openGraph: {
    title: 'Terms of Service | MileClear',
    description: 'Terms of Service for MileClear. Account usage, subscriptions, and data ownership.',
    url: 'https://mileclear.com/terms',
    images: [{ url: '/branding/og-image.png', width: 1200, height: 628 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of Service | MileClear',
    description: 'Terms of Service for MileClear. Account usage, subscriptions, and data ownership.',
    images: ['/branding/og-image.png'],
  },
};

export default function TermsOfService() {
  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: 'Terms of Service', path: '/terms' }]} />
      <Navbar />

      <main className="legal">
        <div className="container">

          {/* Header */}
          <div className="legal__header">
            <h1 className="heading">Terms of Service</h1>
            <p className="legal__date">Last updated: 22 April 2026</p>
          </div>

          {/* Quick Navigation */}
          <nav className="legal__toc">
            <p className="legal__toc-title">Quick Navigation</p>
            <ul className="legal__toc-list legal__toc-list--grid">
              <li><a href="#acceptance" className="legal__toc-link">Acceptance of Terms</a></li>
              <li><a href="#eligibility" className="legal__toc-link">Eligibility &amp; Age</a></li>
              <li><a href="#license" className="legal__toc-link">License to Use</a></li>
              <li><a href="#user-responsibilities" className="legal__toc-link">Your Responsibilities</a></li>
              <li><a href="#content" className="legal__toc-link">User Content</a></li>
              <li><a href="#no-warranty" className="legal__toc-link">Disclaimers</a></li>
              <li><a href="#limitation" className="legal__toc-link">Limitation of Liability</a></li>
              <li><a href="#indemnity" className="legal__toc-link">Indemnification</a></li>
              <li><a href="#background-services" className="legal__toc-link">Background Services</a></li>
              <li><a href="#notifications" className="legal__toc-link">Scheduled Notifications</a></li>
              <li><a href="#termination" className="legal__toc-link">Termination</a></li>
              <li><a href="#billing" className="legal__toc-link">Billing &amp; Payments</a></li>
              <li><a href="#accountant" className="legal__toc-link">Accountant Sharing</a></li>
              <li><a href="#ip" className="legal__toc-link">Intellectual Property</a></li>
              <li><a href="#contact" className="legal__toc-link">Contact Us</a></li>
            </ul>
          </nav>

          <div className="legal__content">

            {/* 1. Acceptance of Terms */}
            <section id="acceptance" className="legal__section">
              <h2 className="legal__section-title">1. Acceptance of Terms</h2>
              <p className="legal__text">
                By downloading, installing, or using the MileClear mobile application and website (collectively, the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.
              </p>
              <p className="legal__text">
                <strong>Service Provider:</strong> Anthony Gair, trading as MileClear. Part of SOYOStudios (parent brand).
              </p>
              <p className="legal__text">
                <strong>Effective Date:</strong> 22 April 2026
              </p>
              <p className="legal__text legal__text--small">
                We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance. We will notify you of material changes via email or in-app notification.
              </p>
            </section>

            {/* 2. Eligibility & Age */}
            <section id="eligibility" className="legal__section">
              <h2 className="legal__section-title">2. Eligibility &amp; Age Requirements</h2>
              <p className="legal__text">
                To use MileClear, you must:
              </p>
              <ul className="legal__list">
                <li className="legal__list-item">Be at least <strong>16 years old</strong> (or the age of majority in your jurisdiction)</li>
                <li className="legal__list-item">Have the legal capacity to enter a binding contract</li>
                <li className="legal__list-item">Be eligible to work as a self-employed driver, gig worker, or independent contractor in the UK</li>
                <li className="legal__list-item">Not be subject to sanctions or export restrictions</li>
                <li className="legal__list-item">Have not previously had an account terminated for violating these Terms</li>
              </ul>

              <div className="legal__card">
                <h3 className="legal__card-title">Age Verification</h3>
                <p className="legal__card-text">
                  If you are under 18 but at least 16, use of MileClear may require parental or guardian consent. We do not verify age automatically; you certify by accepting these Terms that you meet age requirements. If we discover you are under 16, we will delete your account immediately.
                </p>
              </div>

              <div className="legal__card legal__card--amber">
                <h3 className="legal__card-title">Not for Children</h3>
                <p className="legal__card-text">
                  Parents/guardians: If your child under 16 has used MileClear, contact us immediately at support@mileclear.com to request account deletion.
                </p>
              </div>
            </section>

            {/* 3. License to Use */}
            <section id="license" className="legal__section">
              <h2 className="legal__section-title">3. License to Use the Service</h2>
              <p className="legal__text">
                We grant you a limited, non-exclusive, non-transferable, revocable license to access and use MileClear for your personal, non-commercial use as a self-employed driver or gig worker.
              </p>

              <div className="legal__card">
                <h3 className="legal__card-title">What You Can Do</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Track your mileage and trips for tax purposes</li>
                  <li className="legal__list-item">Export data for accountants or tax filing</li>
                  <li className="legal__list-item">Subscribe to premium features (£4.99/month or £44.99/year)</li>
                  <li className="legal__list-item">Download your data for backup or portability</li>
                  <li className="legal__list-item">View analytics and gamification features</li>
                  <li className="legal__list-item">Grant accountants read-only access via token</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">What You Cannot Do</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Resell, redistribute, or commercially exploit the Service</li>
                  <li className="legal__list-item">Reverse-engineer, decompile, or bypass security features</li>
                  <li className="legal__list-item">Scrape, crawl, or extract data (except your own via export)</li>
                  <li className="legal__list-item">Use bots, automated tools, or scripts (except official API)</li>
                  <li className="legal__list-item">Modify, translate, or create derivative works</li>
                  <li className="legal__list-item">Share your account or let others use it</li>
                  <li className="legal__list-item">Attempt unauthorised access or hacking</li>
                  <li className="legal__list-item">Harass, abuse, or violate others&apos; rights</li>
                  <li className="legal__list-item">Use the Service for illegal purposes</li>
                </ul>
              </div>
            </section>

            {/* 4. User Responsibilities */}
            <section id="user-responsibilities" className="legal__section">
              <h2 className="legal__section-title">4. Your Responsibilities</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Account Security</h3>
                <p className="legal__card-text">You are responsible for:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Keeping your password confidential and secure</li>
                  <li className="legal__list-item">Not sharing your account with others</li>
                  <li className="legal__list-item">Logging out of shared devices</li>
                  <li className="legal__list-item">Notifying us immediately if your account is compromised</li>
                  <li className="legal__list-item">All activity under your account, whether authorised by you or not</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Accurate Information</h3>
                <p className="legal__card-text">
                  You agree to provide accurate, complete, and current information when registering and updating your profile. You are responsible for the accuracy of your vehicle details, earnings data, and fuel logs entered into the Service.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Legal Compliance</h3>
                <p className="legal__card-text">You agree to use MileClear in compliance with all applicable UK laws, including:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Vehicle and road traffic laws</li>
                  <li className="legal__list-item">Tax reporting and HMRC regulations</li>
                  <li className="legal__list-item">Employment and self-employment rules (IR35, Agency Workers Regulations)</li>
                  <li className="legal__list-item">Data protection and privacy laws (UK GDPR)</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  MileClear is a tax and mileage tracking tool, not tax advice. Consult an accountant for compliance with your specific tax obligations.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Acceptable Use</h3>
                <p className="legal__card-text">You agree not to:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Use the Service fraudulently (false mileage, fake earnings, etc.)</li>
                  <li className="legal__list-item">Harass, threaten, defame, or harm others</li>
                  <li className="legal__list-item">Submit malware, viruses, or harmful code</li>
                  <li className="legal__list-item">Interfere with the Service&apos;s operation or security</li>
                  <li className="legal__list-item">Spam or flood with excessive requests</li>
                  <li className="legal__list-item">Use the Service for money laundering or sanctions evasion</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Location Data &amp; Permissions</h3>
                <p className="legal__card-text">By enabling background location tracking, you:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Consent to continuous GPS tracking during active shifts</li>
                  <li className="legal__list-item">Understand that location data reveals sensitive personal information</li>
                  <li className="legal__list-item">Grant MileClear the right to store and process this data per the Privacy Policy</li>
                  <li className="legal__list-item">Confirm you are the device owner or have permission to enable location services</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  You can disable location tracking at any time via device settings.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Trip Merging</h3>
                <p className="legal__card-text">You may merge 2 to 20 trips into a single trip record through the MileClear interface:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Merging is permanent and irreversible - original trip records are deleted</li>
                  <li className="legal__list-item">You are responsible for ensuring merged trips accurately reflect your journeys</li>
                  <li className="legal__list-item">For HMRC purposes, merged trips appear as a single entry in exports</li>
                  <li className="legal__list-item">You should retain any supporting evidence of the original journeys (vehicle odometer readings, business logs)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Driving Analytics</h3>
                <p className="legal__card-text">Analytics insights provided by MileClear include:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Route patterns and trip clustering (grouping trips with similar start/end points within approximately 500 metres)</li>
                  <li className="legal__list-item">Shift sweet spots and optimal driving times</li>
                  <li className="legal__list-item">Earnings heatmaps, fuel costs, and commute timing</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  <strong>Important:</strong> Analytics are informational tools only and do not constitute financial, tax, or legal advice. You should not rely solely on analytics for business decisions without independent verification.
                </p>
              </div>
            </section>

            {/* 5. User Content */}
            <section id="content" className="legal__section">
              <h2 className="legal__section-title">5. User Content &amp; Your Data</h2>
              <p className="legal__text">
                "User Content" includes any data you submit to MileClear: trips, vehicles, earnings, fuel logs, notes, comments, and feedback.
              </p>

              <div className="legal__card">
                <h3 className="legal__card-title">Ownership</h3>
                <p className="legal__card-text">
                  You own all User Content you create. MileClear does not own or claim ownership of your trips, mileage data, or earnings records. We are a custodian of your data, not an owner.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Our License to Your Data</h3>
                <p className="legal__card-text">By using MileClear, you grant us a limited license to:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Store your data on our servers and local devices</li>
                  <li className="legal__list-item">Process data to provide the Service (calculations, exports, analytics)</li>
                  <li className="legal__list-item">Display data back to you in the app and dashboard</li>
                  <li className="legal__list-item">Use anonymised, aggregated data for analytics and improvement</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  We do not use your data for marketing, sale to third parties, or beyond the scope of providing the Service.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Portability &amp; Deletion</h3>
                <p className="legal__card-text">You have the right to:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Download all your data (Settings &gt; Download My Data)</li>
                  <li className="legal__list-item">Delete your account and data (Settings &gt; Delete Account)</li>
                  <li className="legal__list-item">Correct inaccurate information anytime</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  See our Privacy Policy for full details on your data rights.
                </p>
              </div>
            </section>

            {/* 6. Disclaimers & No Warranty */}
            <section id="no-warranty" className="legal__section">
              <h2 className="legal__section-title">6. Disclaimers &amp; No Warranty</h2>

              <div className="legal__card legal__card--warning">
                <h3 className="legal__card-title">Important Legal Disclaimers</h3>
                <p className="legal__card-text">
                  MILECLEAR IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT ANY WARRANTIES OR GUARANTEES.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">No Warranty of Accuracy</h3>
                <p className="legal__card-text">MileClear relies on device sensors (GPS, accelerometer) which may:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Drift or lose accuracy in poor signal areas (tunnels, underground, dense buildings)</li>
                  <li className="legal__list-item">Over- or under-report distance (±5% margin of error typical for GPS)</li>
                  <li className="legal__list-item">Misclassify trips or routes due to signal loss</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  <strong>We do not warrant</strong> that mileage calculations are perfectly accurate for HMRC purposes. We recommend manual verification against vehicle odometer readings and business records. You are responsible for accuracy of tax claims.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">No Warranty of Availability</h3>
                <p className="legal__card-text">The Service may experience:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Unplanned downtime for maintenance, security patches, or emergencies</li>
                  <li className="legal__list-item">Scheduled maintenance (we aim for 99% uptime but cannot guarantee it)</li>
                  <li className="legal__list-item">Interruptions due to third-party services (Stripe, Apple, Google, hosting provider)</li>
                  <li className="legal__list-item">Loss of service due to device issues (no internet, storage full, OS incompatibility)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">No Warranty of Fitness for Purpose</h3>
                <p className="legal__card-text">MileClear is provided for mileage tracking and gamified fitness, not as:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Professional tax or legal advice</li>
                  <li className="legal__list-item">Professional accounting or bookkeeping</li>
                  <li className="legal__list-item">Guaranteed proof of mileage for HMRC audits</li>
                  <li className="legal__list-item">Insurance proof of vehicle usage</li>
                </ul>
                <p className="legal__card-text" style={{ marginTop: '1rem' }}>
                  <strong>Always consult a qualified accountant or tax advisor for tax compliance.</strong>
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Smart Dashboard Alerts &amp; Analytics Accuracy</h3>
                <p className="legal__card-text">
                  Smart dashboard alerts and driving analytics are generated automatically from your data and may not reflect all circumstances. We do not warrant that:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">Alerts accurately represent real-world conditions</li>
                  <li className="legal__list-item">Analytics capture all factors affecting your driving or earnings</li>
                  <li className="legal__list-item">Commute timing predictions reflect real-time traffic or conditions</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  These are advisory tools only and should not be relied upon exclusively for business or tax decisions.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">HMRC Export Disclaimer</h3>
                <p className="legal__card-text">
                  HMRC export documents generated by MileClear are tools to assist with self-assessment filing:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">Exports do not guarantee acceptance by HMRC</li>
                  <li className="legal__list-item">You remain solely responsible for the accuracy of your tax return</li>
                  <li className="legal__list-item">You should retain supporting documentation (vehicle odometer readings, business records, fuel receipts) to defend your claim if audited</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Assumption of Risk</h3>
                <p className="legal__card-text">
                  You use MileClear at your own risk. You assume all responsibility for any loss, damage, or inconvenience resulting from:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">Inaccurate mileage or earnings data</li>
                  <li className="legal__list-item">Data loss or corruption</li>
                  <li className="legal__list-item">Service interruptions</li>
                  <li className="legal__list-item">Privacy breaches (though we implement safeguards)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Third-Party Content &amp; Links</h3>
                <p className="legal__card-text">
                  MileClear may link to third-party websites (Xero, FreeAgent, QuickBooks, HMRC). We are not responsible for their content, accuracy, or privacy practices. Review their terms and policies before use.
                </p>
              </div>
            </section>

            {/* 7. Limitation of Liability */}
            <section id="limitation" className="legal__section">
              <h2 className="legal__section-title">7. Limitation of Liability</h2>

              <div className="legal__card legal__card--warning">
                <h3 className="legal__card-title">Cap on Our Liability</h3>
                <p className="legal__card-text">
                  TO THE MAXIMUM EXTENT PERMITTED BY UK LAW, MILECLEAR AND ITS OFFICERS, EMPLOYEES, AGENTS, AND SUPPLIERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITY, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Maximum Liability</h3>
                <p className="legal__card-text">
                  Our total liability to you arising from or relating to these Terms or your use of the Service shall not exceed the greater of:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">The amount paid by you to MileClear in the 12 months preceding the claim, or</li>
                  <li className="legal__list-item">£100 (one hundred pounds)</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  This applies to all claims: breach of contract, negligence, warranty, tort, or otherwise.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Exceptions (No Cap)</h3>
                <p className="legal__card-text">The limitation of liability does NOT apply to:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Death or personal injury caused by our negligence</li>
                  <li className="legal__list-item">Fraud or intentional misconduct</li>
                  <li className="legal__list-item">Statutory rights you cannot waive under UK law</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Tax-Related Losses</h3>
                <p className="legal__card-text">We are not liable for:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Tax penalties or interest from HMRC due to inaccurate data</li>
                  <li className="legal__list-item">Audit costs or legal fees arising from your use of MileClear</li>
                  <li className="legal__list-item">Lost tax deductions or claimed expenses</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  You are solely responsible for ensuring tax compliance. Consult your accountant.
                </p>
              </div>
            </section>

            {/* 8. Indemnification */}
            <section id="indemnity" className="legal__section">
              <h2 className="legal__section-title">8. Indemnification</h2>

              <div className="legal__card">
                <p className="legal__card-text">
                  You agree to indemnify, defend, and hold harmless MileClear and its officers, employees, agents, and successors from any claims, damages, liabilities, costs, and expenses (including legal fees) arising from or relating to:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">Your use of the Service or violation of these Terms</li>
                  <li className="legal__list-item">Your User Content or data submitted to MileClear</li>
                  <li className="legal__list-item">Your breach of any law or third-party rights</li>
                  <li className="legal__list-item">Your violation of the Acceptable Use Policy</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  We will notify you of any such claim and cooperate in your defence.
                </p>
              </div>
            </section>

            {/* 9. Background Services */}
            <section id="background-services" className="legal__section">
              <h2 className="legal__section-title">9. Background Services</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Background Operations</h3>
                <p className="legal__card-text">
                  MileClear may run background services with your permission to provide the Service. These include:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>GPS trip tracking:</strong> Continuous location capture during active shifts or quick trips</li>
                  <li className="legal__list-item"><strong>Automatic trip recording:</strong> When driving is detected outside of an active shift, MileClear may silently record GPS coordinates and automatically save a trip when you stop (5+ minutes idle). These trips are saved as "unclassified" for you to review later</li>
                  <li className="legal__list-item"><strong>Drive detection:</strong> Low-power monitoring of significant location changes to detect when you start driving (speed &gt; 15mph). GPS readings with poor accuracy (&gt; 50m) are filtered out to prevent false detections</li>
                  <li className="legal__list-item"><strong>Departure anchor geofencing:</strong> A temporary 200-metre geofence is registered around your last stationary position. When you leave this area, drive detection activates. This runs as an OS-level event and does not require the app to be open</li>
                  <li className="legal__list-item"><strong>Saved location geofences:</strong> Monitoring of saved locations (home, work, depot) for automatic trip detection on entry/exit</li>
                  <li className="legal__list-item"><strong>Push notifications:</strong> Delivery of streak reminders, subscription alerts, and weekly summaries</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Controlling Background Services</h3>
                <p className="legal__card-text">You can disable any background service at any time:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Through your device settings (iOS/Android location and notification permissions)</li>
                  <li className="legal__list-item">Within the MileClear app (Settings &gt; Permissions &gt; toggle services off)</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  <strong>Background location tracking</strong> only occurs during active shifts, automatic trip recording, or when drive detection is enabled. Location data is not collected continuously when the app is closed and no driving activity is detected.
                </p>
              </div>

            </section>

            {/* 10. Scheduled Notifications */}
            <section id="notifications" className="legal__section">
              <h2 className="legal__section-title">10. Scheduled Notifications</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Push Notifications</h3>
                <p className="legal__card-text">
                  MileClear sends push notifications to help you stay engaged. These may include:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">Weekly driving summaries and performance recaps</li>
                  <li className="legal__list-item">Streak reminders (encouraging daily or weekly tracking)</li>
                  <li className="legal__list-item">Subscription expiry alerts (7-day and 1-day before renewal)</li>
                  <li className="legal__list-item">Tax deadline reminders (Self Assessment dates, quarterly reporting)</li>
                  <li className="legal__list-item">Unclassified trip nudges (prompting you to classify business vs. personal)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Quiet Hours</h3>
                <p className="legal__card-text">
                  MileClear suppresses non-essential push notifications between <strong>10:00 PM and 7:00 AM</strong> (local device time). During quiet hours, driving detection notifications, streak reminders, trip classification nudges, and other advisory notifications are not sent. However, automatic trip recording continues silently in the background if driving is detected - trips are saved for review when you next open the app.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Opting Out</h3>
                <p className="legal__card-text">You can opt out of any notification category at any time:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">In-app: Settings &gt; Notifications &gt; toggle categories on/off</li>
                  <li className="legal__list-item">Device level: Disable notifications in iOS/Android settings (disables all MileClear notifications)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Technical Requirements</h3>
                <p className="legal__card-text">
                  Notifications require an active push token registered with Expo Push Service. If you have not enabled notifications or have revoked the app&apos;s permission, you will not receive push notifications.
                </p>
              </div>
            </section>

            {/* 11. Termination */}
            <section id="termination" className="legal__section">
              <h2 className="legal__section-title">11. Termination of Account</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Termination by You</h3>
                <p className="legal__card-text">You can delete your account anytime:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">In-app: Settings &gt; Account &gt; Delete Account</li>
                  <li className="legal__list-item">Or email: support@mileclear.com with your request</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  Account deletion is permanent. We will delete your data (except tax-required records, anonymised for 7 years per UK law).
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Termination by MileClear</h3>
                <p className="legal__card-text">We may suspend or terminate your account if you:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Violate these Terms or our Acceptable Use Policy</li>
                  <li className="legal__list-item">Engage in fraudulent activity (fake mileage, false earnings)</li>
                  <li className="legal__list-item">Violate UK law or regulations</li>
                  <li className="legal__list-item">Threaten, harass, or abuse other users or staff</li>
                  <li className="legal__list-item">Attempt unauthorised access or hacking</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  We will attempt to notify you before termination, except in cases of serious abuse or legal requirement.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Effect of Termination</h3>
                <p className="legal__card-text">Upon termination (by you or us):</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Your access to MileClear is immediately revoked</li>
                  <li className="legal__list-item">Your data is securely deleted (with exceptions noted above)</li>
                  <li className="legal__list-item">Your subscription ends; no refunds for remaining period (see Billing below)</li>
                </ul>
              </div>
            </section>

            {/* 12. Billing & Payments */}
            <section id="billing" className="legal__section">
              <h2 className="legal__section-title">12. Billing &amp; Subscription Payments</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Free &amp; Premium Tiers</h3>
                <p className="legal__card-text"><strong>Free Tier</strong></p>
                <p className="legal__card-text legal__text--small">Always free. Track mileage, gamification, basic analytics, 2 saved locations.</p>
                <p className="legal__card-text" style={{ marginTop: '0.75rem' }}><strong>Premium Tier</strong></p>
                <p className="legal__card-text legal__text--small">
                  <strong>Monthly:</strong> £4.99/month or <strong>Annual:</strong> £44.99/year
                </p>
                <p className="legal__card-text legal__text--small">Includes:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">HMRC-stamped PDF exports and self-assessment documents</li>
                  <li className="legal__list-item">CSV trip and earnings exports</li>
                  <li className="legal__list-item">Unlimited saved locations (free tier capped at 2)</li>
                  <li className="legal__list-item">CSV earnings import (bulk upload from platform CSVs)</li>
                  <li className="legal__list-item">Open Banking integration (Plaid) for automatic transaction import</li>
                  <li className="legal__list-item">Advanced analytics and business insights</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Subscription Terms</h3>
                <p className="legal__card-text">
                  <strong>MileClear Pro</strong> is an auto-renewable subscription:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Monthly pricing:</strong> £4.99 per month</li>
                  <li className="legal__list-item"><strong>Annual pricing:</strong> £44.99 per year (approximately £3.75/month)</li>
                  <li className="legal__list-item"><strong>Auto-renewal:</strong> Your subscription automatically renews each billing period unless you cancel at least 24 hours before the end of the current period</li>
                  <li className="legal__list-item"><strong>Billing cycle:</strong> Charged on the same day each cycle (e.g., if you start monthly on Feb 20, you&apos;ll be charged on Mar 20, Apr 20, etc.)</li>
                  <li className="legal__list-item"><strong>Payment processing:</strong> Payments are processed by Stripe (web) or Apple via In-App Purchase (iOS). We never store your card details</li>
                  <li className="legal__list-item"><strong>Failed payments:</strong> If a payment fails, we&apos;ll retry a few times. Repeated failures may suspend your premium access</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Apple In-App Purchase (iOS)</h3>
                <p className="legal__card-text">
                  If you subscribe via the MileClear iOS app, your purchase is processed by Apple through the App Store:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Payment:</strong> Charged to your Apple ID account at confirmation of purchase</li>
                  <li className="legal__list-item"><strong>Auto-renewal:</strong> Your subscription automatically renews unless you turn off auto-renewal at least 24 hours before the end of the current period</li>
                  <li className="legal__list-item"><strong>Renewal charge:</strong> Your account will be charged the subscription price for renewal within 24 hours prior to the end of the current period</li>
                  <li className="legal__list-item"><strong>Management:</strong> You can manage and cancel your subscription in your Apple ID Account Settings (Settings &gt; [your name] &gt; Subscriptions)</li>
                  <li className="legal__list-item"><strong>Free trial:</strong> Any unused portion of a free trial period (if offered) will be forfeited when you purchase a subscription</li>
                  <li className="legal__list-item"><strong>Terms:</strong> Apple&apos;s standard Terms and Conditions for auto-renewable subscriptions apply in addition to these Terms</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Cancellation &amp; Refunds</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Cancel anytime:</strong> For Stripe subscriptions, cancel via Settings &gt; Billing &gt; Cancel Subscription (or email support@mileclear.com). For Apple subscriptions, cancel via your Apple ID Account Settings (Settings &gt; [your name] &gt; Subscriptions)</li>
                  <li className="legal__list-item"><strong>No refunds:</strong> Subscription cancels at the end of your current billing period. No partial refunds for unused time. For Apple subscriptions, refund requests must be made through Apple</li>
                  <li className="legal__list-item"><strong>Cancellation effect:</strong> Premium features remain available until the end of your current billing period, then revert to the free tier. Free tracking continues</li>
                  <li className="legal__list-item"><strong>Reactivation:</strong> You can reactivate premium anytime; new subscription starts immediately</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Price Changes</h3>
                <p className="legal__card-text">We may increase or decrease the subscription price. We will notify you:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">At least 30 days before any price increase</li>
                  <li className="legal__list-item">Via email and in-app notification</li>
                  <li className="legal__list-item">New price takes effect on your next renewal date</li>
                  <li className="legal__list-item">You can cancel before the change if you disagree</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Taxes &amp; VAT</h3>
                <p className="legal__card-text">
                  Prices are shown before VAT (if applicable). We calculate and add VAT at checkout based on your location. You are responsible for any local taxes on subscription.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Consumer Rights (UK)</h3>
                <p className="legal__card-text">If you have a valid complaint about billing:</p>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>14-day cooling-off:</strong> Under the Consumer Contracts Regulations 2013, Stripe web purchases may be cancelled within 14 days of purchase (applies to services subject to this law). Apple IAP is subject to Apple&apos;s refund policy</li>
                  <li className="legal__list-item"><strong>Dispute a Stripe charge:</strong> Contact Stripe support or your bank within 60 days</li>
                  <li className="legal__list-item"><strong>Dispute an Apple charge:</strong> Request a refund through Apple at reportaproblem.apple.com</li>
                  <li className="legal__list-item"><strong>Consumer rights:</strong> UK Consumer Rights Act 2015 applies; you have statutory rights to cancel for breach of contract</li>
                  <li className="legal__list-item"><strong>Complaint process:</strong> Email support@mileclear.com if you believe you were charged in error</li>
                </ul>
              </div>
            </section>

            {/* 13. Accountant Sharing */}
            <section id="accountant" className="legal__section">
              <h2 className="legal__section-title">13. Accountant Portal &amp; Token-Based Sharing</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Overview</h3>
                <p className="legal__card-text">
                  You can grant a third-party accountant read-only access to your MileClear data via token-based authentication. Your accountant does not need a MileClear account to access this data.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">What Accountants Can Access</h3>
                <p className="legal__card-text">With a valid token, accountants can view:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Your trips (dates, routes, distances, classifications)</li>
                  <li className="legal__list-item">Mileage deductions and HMRC calculations</li>
                  <li className="legal__list-item">Your earnings records (manual, CSV, Plaid-imported)</li>
                  <li className="legal__list-item">Fuel logs and maintenance records</li>
                  <li className="legal__list-item">Exports in CSV and PDF format</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">What Accountants Cannot Do</h3>
                <p className="legal__card-text">Accountants with token access cannot:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Modify or delete any of your data</li>
                  <li className="legal__list-item">Export or download your data in bulk</li>
                  <li className="legal__list-item">Add or change accountant tokens</li>
                  <li className="legal__list-item">Access your account settings or passwords</li>
                  <li className="legal__list-item">View other users&apos; data</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Token Management</h3>
                <p className="legal__card-text">You fully control accountant access:</p>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Generate:</strong> Create a token in Settings &gt; Share Data &gt; Generate Accountant Token</li>
                  <li className="legal__list-item"><strong>View:</strong> See all active tokens and who can access your data</li>
                  <li className="legal__list-item"><strong>Revoke:</strong> Delete any token anytime to immediately stop accountant access</li>
                  <li className="legal__list-item"><strong>Expiry:</strong> Tokens do not auto-expire; you must manually revoke them</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Your Accountability</h3>
                <p className="legal__card-text">
                  Your accountant is your chosen third party, not a sub-processor or employee of MileClear. You are responsible for:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">Vetting your accountant and ensuring they are trustworthy</li>
                  <li className="legal__list-item">Agreeing on data handling and confidentiality with them directly</li>
                  <li className="legal__list-item">Revoking their access when the relationship ends</li>
                  <li className="legal__list-item">Understanding their privacy practices and data retention policies</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{marginTop: '1rem'}}>
                  MileClear is not liable for how your accountant uses, stores, or protects your data once they have access via token.
                </p>
              </div>
            </section>

            {/* 14. Intellectual Property */}
            <section id="ip" className="legal__section">
              <h2 className="legal__section-title">14. Intellectual Property Rights</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">MileClear IP</h3>
                <p className="legal__card-text">All MileClear content and technology is our intellectual property:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">App code, design, and interface (© Anthony Gair / MileClear)</li>
                  <li className="legal__list-item">Brand name, logo, wordmark (™ MileClear)</li>
                  <li className="legal__list-item">Algorithms (Haversine distance, stop detection, etc.)</li>
                  <li className="legal__list-item">Documentation and guides</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  You have a license to use these only as permitted by these Terms. Do not copy, reproduce, or reverse-engineer.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Third-Party Licenses</h3>
                <p className="legal__card-text">
                  MileClear uses open-source libraries (React, TypeScript, Prisma, etc.) and proprietary services (Stripe, Apple, Google). We comply with all third-party licenses and respect their intellectual property.
                </p>
                <p className="legal__card-text legal__text--small">
                  Open-source licenses: Available in the app&apos;s settings or contact support@mileclear.com for details.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Your IP</h3>
                <p className="legal__card-text">
                  You retain ownership of your User Content (trips, notes, etc.). By submitting it to MileClear, you grant us the limited license described in Section 5 (User Content).
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">DMCA / Copyright Infringement</h3>
                <p className="legal__card-text">If you believe MileClear infringes your copyright or IP, contact:</p>
                <div className="legal__code">
                  <p className="legal__code-highlight">support@mileclear.com</p>
                </div>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  Include: description of the work, location in the Service, proof of ownership, and contact info. We will investigate and respond within 10 days.
                </p>
              </div>
            </section>

            {/* 15. Governing Law & Jurisdiction */}
            <section id="governing" className="legal__section">
              <h2 className="legal__section-title">15. Governing Law &amp; Dispute Resolution</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">UK Law</h3>
                <p className="legal__card-text">
                  These Terms are governed by the laws of England and Wales, UK. Any disputes arising from these Terms or your use of MileClear shall be subject to the exclusive jurisdiction of the English courts.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Informal Resolution</h3>
                <p className="legal__card-text">Before litigation, we encourage you to:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Contact us at support@mileclear.com with your complaint</li>
                  <li className="legal__list-item">Give us 30 days to respond and resolve the issue</li>
                  <li className="legal__list-item">Be specific about the problem and your desired resolution</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Limitation on Lawsuits</h3>
                <p className="legal__card-text">
                  You agree that any claim or cause of action arising from these Terms or your use of the Service must be filed within <strong>one year</strong> after the cause of action arises. After one year, you lose the right to claim.
                </p>
              </div>
            </section>

            {/* 16. Contact Us */}
            <section id="contact" className="legal__section">
              <h2 className="legal__section-title">16. Contact Us</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">For Questions or Issues</h3>
                <div className="legal__code">
                  <p className="legal__code-highlight">Email: support@mileclear.com</p>
                  <p className="legal__code-muted">Response time: 5 business days</p>
                </div>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Service-Related Issues</h3>
                <div className="legal__code">
                  <p className="legal__code-highlight">In-app support: Help &gt; Contact Support</p>
                  <p className="legal__code-muted">Response time: 24-48 hours</p>
                </div>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Operator</h3>
                <div className="legal__code">
                  <p className="legal__code-highlight">Email: gair@mileclear.com</p>
                  <p className="legal__code-muted">For GDPR and data protection queries</p>
                </div>
              </div>
            </section>

            {/* Final Disclaimers */}
            <section className="legal__section">
              <div className="legal__card">
                <h3 className="legal__card-title">Final Disclaimers</h3>
                <p className="legal__card-text">
                  <strong>Tax Advice Disclaimer:</strong> MileClear is a mileage tracking tool, not a substitute for professional tax or legal advice. Always consult a qualified accountant or solicitor about your tax obligations.
                </p>
                <p className="legal__card-text">
                  <strong>HMRC Compliance:</strong> While MileClear helps track mileage per HMRC guidance, we cannot guarantee that data will be accepted by HMRC in an audit. Keep supporting records (vehicle odometer readings, business logs, fuel receipts).
                </p>
                <p className="legal__card-text">
                  <strong>Data Protection:</strong> While we implement strong security, no system is 100% secure. See our Privacy Policy for data protection details.
                </p>
              </div>
            </section>

            {/* Footer */}
            <div className="legal__footer">
              <p className="legal__footer-text">© 2026 MileClear. All rights reserved.</p>
              <p className="legal__footer-text">Version 1.3 - Effective 22 April 2026</p>
              <div className="legal__footer-links">
                <a href="/privacy" className="legal__footer-link">Privacy Policy</a>
                <a href="/terms" className="legal__footer-link">Terms of Service</a>
              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
