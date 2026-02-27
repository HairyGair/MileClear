import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import '../legal.css';

export default function PrivacyPolicy() {
  return (
    <>
      <Navbar />

      <main className="legal">
        <div className="container">

          {/* Header */}
          <div className="legal__header">
            <h1 className="heading">Privacy Policy</h1>
            <p className="legal__date">Last updated: 25 February 2026</p>
          </div>

          {/* Table of Contents */}
          <nav className="legal__toc">
            <h2 className="legal__toc-title">Quick Navigation</h2>
            <ul className="legal__toc-list">
              <li><a href="#overview" className="legal__toc-link">Overview</a></li>
              <li><a href="#what-data" className="legal__toc-link">What Data We Collect</a></li>
              <li><a href="#how-used" className="legal__toc-link">How We Use Your Data</a></li>
              <li><a href="#lawful-basis" className="legal__toc-link">Lawful Basis for Processing</a></li>
              <li><a href="#location-tracking" className="legal__toc-link">Location Tracking &amp; Background Permissions</a></li>
              <li><a href="#sharing" className="legal__toc-link">Who We Share Data With</a></li>
              <li><a href="#retention" className="legal__toc-link">Data Retention</a></li>
              <li><a href="#your-rights" className="legal__toc-link">Your Rights</a></li>
              <li><a href="#cookies" className="legal__toc-link">Cookies &amp; Local Storage</a></li>
              <li><a href="#children" className="legal__toc-link">Children&apos;s Privacy</a></li>
              <li><a href="#security" className="legal__toc-link">Security</a></li>
              <li><a href="#contact" className="legal__toc-link">Contact Us</a></li>
            </ul>
          </nav>

          {/* Main Content */}
          <div className="legal__content">

            {/* 1. Overview */}
            <section id="overview" className="legal__section">
              <h2 className="legal__section-title">1. Overview</h2>
              <p className="legal__text">
                MileClear (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our,&rdquo; or &ldquo;Company&rdquo;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the &ldquo;Service&rdquo;).
              </p>
              <p className="legal__text">
                <strong>Service Provider:</strong> MileClear Limited, a UK-registered company
              </p>
              <p className="legal__text">
                <strong>Website:</strong> mileclear.com
              </p>
              <p className="legal__text">
                This policy applies to all users of MileClear, including gig workers (Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, Gophr, DPD, Yodel, Evri drivers), self-employed drivers, and professionals who use our mileage tracking service. We comply with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and other applicable UK privacy laws.
              </p>
            </section>

            {/* 2. What Data We Collect */}
            <section id="what-data" className="legal__section">
              <h2 className="legal__section-title">2. What Data We Collect</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Account Information</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Email address</li>
                  <li className="legal__list-item">Display name (optional)</li>
                  <li className="legal__list-item">Password (hashed with bcryptjs, never stored in plain text)</li>
                  <li className="legal__list-item">Apple ID (if using Apple Sign-In)</li>
                  <li className="legal__list-item">Google ID (if using Google Sign-In)</li>
                  <li className="legal__list-item">Account creation date and login history</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Location Data</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">GPS coordinates and altitude</li>
                  <li className="legal__list-item">Real-time location during active shifts (with your explicit permission)</li>
                  <li className="legal__list-item">Significant location changes outside shifts for drive detection</li>
                  <li className="legal__list-item">Location history for route replay and trip reconstruction</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{marginTop: '1rem'}}>
                  Location tracking requires you to grant background location permissions on your device. See Section 4 for full details on how we use this data.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Vehicle Information</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Make and model</li>
                  <li className="legal__list-item">Year of manufacture</li>
                  <li className="legal__list-item">Fuel type (petrol, diesel, electric, hybrid)</li>
                  <li className="legal__list-item">Registration plate</li>
                  <li className="legal__list-item">Miles per gallon (MPG) or efficiency rating</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Trip and Shift Data</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Shift start and end times</li>
                  <li className="legal__list-item">Trip start and end coordinates</li>
                  <li className="legal__list-item">Trip addresses and route information</li>
                  <li className="legal__list-item">Distance travelled in miles</li>
                  <li className="legal__list-item">Trip classification (business or personal)</li>
                  <li className="legal__list-item">GPS breadcrumbs and precise location history</li>
                  <li className="legal__list-item">Trip notes and comments you add</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Earnings and Financial Data</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Earnings from gig platforms (manually entered)</li>
                  <li className="legal__list-item">CSV import of earnings data</li>
                  <li className="legal__list-item">Open Banking data via TrueLayer/Plaid (premium users only)</li>
                  <li className="legal__list-item">Payment method information (card details are processed by Stripe only, we never store them)</li>
                  <li className="legal__list-item">Stripe customer ID and subscription ID</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Fuel and Maintenance Data</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Fuel fill-up records (litres, cost, date)</li>
                  <li className="legal__list-item">Fuel station name and location</li>
                  <li className="legal__list-item">Odometer readings</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Usage and Device Data</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Device type and operating system</li>
                  <li className="legal__list-item">App version and build number</li>
                  <li className="legal__list-item">Feature usage analytics (anonymous)</li>
                  <li className="legal__list-item">Session information (login/logout times)</li>
                  <li className="legal__list-item">Error logs and crash reports</li>
                </ul>
              </div>
            </section>

            {/* 3. How We Use Your Data */}
            <section id="how-used" className="legal__section">
              <h2 className="legal__section-title">3. How We Use Your Data</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Essential Service Functions</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Creating and managing your account</li>
                  <li className="legal__list-item">Authenticating you at login (email, Apple, or Google)</li>
                  <li className="legal__list-item">Tracking mileage and trips in real-time</li>
                  <li className="legal__list-item">Calculating HMRC-compliant tax deductions (45p/mile for cars up to 10,000 miles, 25p/mile thereafter; 24p/mile for motorbikes)</li>
                  <li className="legal__list-item">Generating export files for tax reporting (PDF, CSV) and accounting software (Xero, FreeAgent, QuickBooks)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Premium Features</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Earnings tracking and automatic import via Open Banking (TrueLayer/Plaid)</li>
                  <li className="legal__list-item">Advanced analytics and performance metrics</li>
                  <li className="legal__list-item">HMRC export functionality</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Gamification and Engagement</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Tracking achievements and badges</li>
                  <li className="legal__list-item">Calculating gamification stats (safety score, efficiency, consistency)</li>
                  <li className="legal__list-item">Displaying leaderboards and milestones</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Billing and Subscriptions</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Processing subscription payments via Stripe</li>
                  <li className="legal__list-item">Managing premium feature access</li>
                  <li className="legal__list-item">Handling refunds and cancellations</li>
                  <li className="legal__list-item">Sending billing notifications and receipts</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Communication</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Responding to support inquiries</li>
                  <li className="legal__list-item">Sending account notifications (login alerts, password reset, verification)</li>
                  <li className="legal__list-item">Service updates and maintenance notices</li>
                  <li className="legal__list-item">Feature announcements (only with your consent)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Analytics and Improvement</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Analysing app usage patterns to improve service quality</li>
                  <li className="legal__list-item">Debugging technical issues and improving app stability</li>
                  <li className="legal__list-item">Understanding user behaviour for feature development</li>
                  <li className="legal__list-item">Generating anonymised analytics and reports</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Legal and Safety</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Complying with legal obligations and court orders</li>
                  <li className="legal__list-item">Detecting and preventing fraud or abuse</li>
                  <li className="legal__list-item">Enforcing our Terms of Service and other agreements</li>
                </ul>
              </div>
            </section>

            {/* 4. Lawful Basis for Processing */}
            <section id="lawful-basis" className="legal__section">
              <h2 className="legal__section-title">4. Lawful Basis for Processing</h2>
              <p className="legal__text">
                Under UK GDPR Article 6, we only process your personal data on one of the following lawful bases:
              </p>

              <div className="legal__card">
                <h3 className="legal__card-title">Consent (Article 6(1)(a))</h3>
                <p className="legal__card-text">We rely on your explicit consent for:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Background location tracking during active shifts</li>
                  <li className="legal__list-item">Significant location change detection outside shifts</li>
                  <li className="legal__list-item">Sending marketing communications or newsletters (opt-in)</li>
                  <li className="legal__list-item">Using Open Banking/Plaid to import earnings data</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{marginTop: '1rem'}}>
                  You can withdraw consent at any time by disabling location permissions on your device settings or unsubscribing from communications.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Contract (Article 6(1)(b))</h3>
                <p className="legal__card-text">We process data necessary to fulfil our contract with you:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Account creation and authentication</li>
                  <li className="legal__list-item">Trip tracking and mileage calculation</li>
                  <li className="legal__list-item">Billing and subscription management</li>
                  <li className="legal__list-item">Providing support services</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Legitimate Interest (Article 6(1)(f))</h3>
                <p className="legal__card-text">We process data where we have a legitimate business interest:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Analytics and service improvement (understanding usage patterns)</li>
                  <li className="legal__list-item">Fraud detection and abuse prevention</li>
                  <li className="legal__list-item">App stability and debugging (error logs)</li>
                  <li className="legal__list-item">Security monitoring and protection against unauthorised access</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{marginTop: '1rem'}}>
                  We conduct balancing tests to ensure our interests do not override your privacy rights. You have the right to object to this processing.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Legal Obligation (Article 6(1)(c))</h3>
                <p className="legal__card-text">We process data to comply with UK laws:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Tax reporting and HMRC compliance</li>
                  <li className="legal__list-item">Responding to lawful government requests or court orders</li>
                </ul>
              </div>
            </section>

            {/* 5. Location Tracking */}
            <section id="location-tracking" className="legal__section">
              <h2 className="legal__section-title">5. Location Tracking &amp; Background Permissions</h2>

              <div className="legal__card legal__card--amber">
                <p className="legal__card-text">
                  <strong>Location data is core to MileClear&apos;s functionality. This section explains how we collect, use, and protect it.</strong>
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">How We Collect Location Data</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>During Active Shifts:</strong> When you start a shift, we continuously record GPS coordinates at intervals (approximately every 50 metres or 10 seconds) to track your route and calculate distance. This requires your explicit permission via the &ldquo;Allow Background Location&rdquo; prompt on your device.</li>
                  <li className="legal__list-item"><strong>Outside Shifts:</strong> When shifts are inactive, we monitor for significant location changes (speed &gt; 15mph) to detect if you&apos;re driving. This uses low-power location services and requires separate permission.</li>
                  <li className="legal__list-item"><strong>Stop Detection:</strong> We identify stops and trip boundaries by detecting when speed = 0 for more than 2 minutes.</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Your Control Over Location Data</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Mobile Settings:</strong> You can disable background location at any time in Settings &gt; Privacy &gt; Location on iOS or Settings &gt; Apps &gt; Permissions &gt; Location on Android. The app will continue to work but cannot track trips.</li>
                  <li className="legal__list-item"><strong>In-App Controls:</strong> You can pause tracking at any time by ending your shift. Location recording stops immediately.</li>
                  <li className="legal__list-item"><strong>Deletion:</strong> You can delete individual trips or all location history from within the app. See Section 8 (Your Rights) for account deletion.</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Storage and Privacy</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Location data is stored locally on your phone first (SQLite) before syncing to our secure server</li>
                  <li className="legal__list-item">Offline-first design means tracking works even without internet</li>
                  <li className="legal__list-item">GPS breadcrumbs enable trip replay and route verification for tax purposes</li>
                  <li className="legal__list-item">Data is encrypted in transit (HTTPS) and at rest on our UK servers</li>
                  <li className="legal__list-item">Only you and authorised app support staff can view your location data</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Privacy Implications</h3>
                <p className="legal__card-text">We understand location data is highly sensitive and reveals personal habits, travel patterns, and private locations. Therefore:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">We never share raw location data with third parties (including your employers, Uber, Deliveroo, etc.)</li>
                  <li className="legal__list-item">We only extract aggregate metrics: distance, duration, start/end points, and route summary</li>
                  <li className="legal__list-item">Location data is never used for marketing or sold to advertisers</li>
                  <li className="legal__list-item">We do not build detailed movement profiles or timelines of your personal activities</li>
                </ul>
              </div>
            </section>

            {/* 6. Sharing Data */}
            <section id="sharing" className="legal__section">
              <h2 className="legal__section-title">6. Who We Share Data With</h2>
              <p className="legal__text">
                We only share data with third parties who need it to provide or support our service, and only on a need-to-know basis.
              </p>

              <div className="legal__card">
                <h3 className="legal__card-title">Essential Service Providers (Data Processors)</h3>
                <p className="legal__card-text"><strong>Stripe (Payment Processing)</strong></p>
                <p className="legal__card-text legal__text--small">PCI DSS Level 1 compliant. We share: Stripe customer ID, subscription status, and transaction records. Card details are entered directly into Stripe&apos;s secure forms — we never see them.</p>
                <p className="legal__card-text" style={{marginTop: '0.75rem'}}><strong>TrueLayer / Plaid (Open Banking)</strong></p>
                <p className="legal__card-text legal__text--small">Premium users only. We share: request to connect your bank account for earnings auto-import. TrueLayer/Plaid acts as intermediary — they do not store your bank login, only aggregated transaction data.</p>
                <p className="legal__card-text" style={{marginTop: '0.75rem'}}><strong>Apple &amp; Google (Authentication)</strong></p>
                <p className="legal__card-text legal__text--small">Sign-in only. We share: email address (sometimes) and sign-in request. We verify the token on our servers; Apple/Google do not see your other data.</p>
                <p className="legal__card-text" style={{marginTop: '0.75rem'}}><strong>Expo / EAS (App Infrastructure)</strong></p>
                <p className="legal__card-text legal__text--small">App distribution and crash reporting only. No personal data is shared.</p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Legal Obligations</h3>
                <p className="legal__card-text">
                  We may disclose your data if required by law (court order, government request, law enforcement) or to protect our legal rights. Such disclosures are made only where legally required and accompanied by appropriate safeguards.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">What We Never Do</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Never sell personal data to advertisers, brokers, or third-party marketers</li>
                  <li className="legal__list-item">Never share data with gig platforms (Uber, Deliveroo, etc.) without your explicit request</li>
                  <li className="legal__list-item">Never share data with employers, tax authorities, or HMRC automatically</li>
                  <li className="legal__list-item">Never use location data for targeted advertising</li>
                  <li className="legal__list-item">Never build profiles for other companies</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Data Processing Agreements</h3>
                <p className="legal__card-text">All third-party processors sign Data Processing Agreements (DPAs) under UK GDPR Article 28, guaranteeing:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Processing only on our documented instructions</li>
                  <li className="legal__list-item">Appropriate technical and organisational security measures</li>
                  <li className="legal__list-item">Confidentiality and staff training requirements</li>
                  <li className="legal__list-item">Sub-processor notifications and approvals</li>
                </ul>
              </div>
            </section>

            {/* 7. Data Retention */}
            <section id="retention" className="legal__section">
              <h2 className="legal__section-title">7. Data Retention</h2>
              <p className="legal__text">
                We retain data only as long as necessary. Here are our retention periods:
              </p>

              <div className="legal__card">
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem'}}>
                  <div>
                    <p className="legal__card-text"><strong>Active Account Data</strong></p>
                    <p className="legal__card-text">Duration of account use + 7 years</p>
                    <p className="legal__card-text legal__text--small">(UK tax records retention requirement)</p>
                  </div>
                  <div>
                    <p className="legal__card-text"><strong>Deleted Accounts</strong></p>
                    <p className="legal__card-text">7 years (tax compliance)</p>
                    <p className="legal__card-text legal__text--small">Anonymised after deletion for analytics</p>
                  </div>
                  <div>
                    <p className="legal__card-text"><strong>Location Data</strong></p>
                    <p className="legal__card-text">7 tax years, then deleted</p>
                    <p className="legal__card-text legal__text--small">Required for HMRC deduction proof</p>
                  </div>
                  <div>
                    <p className="legal__card-text"><strong>Trip Records</strong></p>
                    <p className="legal__card-text">7 years, then deleted</p>
                    <p className="legal__card-text legal__text--small">Same as location data</p>
                  </div>
                  <div>
                    <p className="legal__card-text"><strong>Login Tokens</strong></p>
                    <p className="legal__card-text">15 min (access), 30 days (refresh)</p>
                    <p className="legal__card-text legal__text--small">Auto-expire; not stored long-term</p>
                  </div>
                  <div>
                    <p className="legal__card-text"><strong>Billing Records</strong></p>
                    <p className="legal__card-text">7 years</p>
                    <p className="legal__card-text legal__text--small">UK VAT and tax law requirement</p>
                  </div>
                </div>
              </div>

              <p className="legal__text">
                After retention periods expire, we securely delete or anonymise data. You can request deletion earlier (see Your Rights section). Anonymised data (aggregated stats with no identifiable information) may be retained indefinitely for analytics.
              </p>
            </section>

            {/* 8. Your Rights */}
            <section id="your-rights" className="legal__section">
              <h2 className="legal__section-title">8. Your Rights Under UK GDPR</h2>
              <p className="legal__text">
                You have rights over your personal data. Here&apos;s how to exercise them:
              </p>

              <div className="legal__card">
                <h3 className="legal__card-title">Right of Access (Article 15)</h3>
                <p className="legal__card-text">
                  You can request a copy of all your personal data. We provide it in a structured, portable format (JSON export).
                </p>
                <p className="legal__card-text legal__text--small">
                  <strong>How to request:</strong> Use the &ldquo;Download My Data&rdquo; button in Settings within the MileClear app, or email legal@mileclear.com. We respond within 30 days.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Right of Rectification (Article 16)</h3>
                <p className="legal__card-text">
                  You can correct or update inaccurate data (e.g., vehicle details, display name).
                </p>
                <p className="legal__card-text legal__text--small">
                  <strong>How to request:</strong> Edit your profile directly in the app (Settings &gt; Account Info). For data you cannot edit, email legal@mileclear.com.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Right of Erasure (&ldquo;Right to Be Forgotten&rdquo;) (Article 17)</h3>
                <p className="legal__card-text">
                  You can delete your account and associated data (subject to legal obligations).
                </p>
                <p className="legal__card-text legal__text--small">
                  <strong>How to request:</strong> Click &ldquo;Delete Account&rdquo; in Settings &gt; Account &gt; Danger Zone, or email legal@mileclear.com.
                </p>
                <p className="legal__card-text legal__text--small">
                  <strong>Exceptions:</strong> We may retain anonymised data and records required by tax law (7 years) or court order.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Right to Restrict Processing (Article 18)</h3>
                <p className="legal__card-text">
                  You can ask us to limit how we use your data (e.g., stop analytics but keep account).
                </p>
                <p className="legal__card-text legal__text--small">
                  <strong>How to request:</strong> Email legal@mileclear.com with details of what should be restricted.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Right to Data Portability (Article 20)</h3>
                <p className="legal__card-text">
                  You can export your data in a machine-readable format to switch to another service.
                </p>
                <p className="legal__card-text legal__text--small">
                  <strong>How to request:</strong> Use &ldquo;Download My Data&rdquo; in Settings. We provide JSON format including trips, vehicles, earnings, and achievements.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Right to Object (Article 21)</h3>
                <p className="legal__card-text">
                  You can object to processing based on legitimate interest (analytics, fraud detection).
                </p>
                <p className="legal__card-text legal__text--small">
                  <strong>How to request:</strong> Email legal@mileclear.com stating which processing you object to.
                </p>
                <p className="legal__card-text legal__text--small">
                  Note: Objecting to essential processing (trip tracking, billing) may prevent the service from functioning.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Right Not to Be Subject to Automated Decision Making (Article 22)</h3>
                <p className="legal__card-text">
                  You have the right to human review if we make decisions using only automated processing with legal effects.
                </p>
                <p className="legal__card-text legal__text--small">
                  Currently, we do not use fully automated decision-making. Decisions about premium access are made manually or with human oversight.
                </p>
              </div>

              <div className="legal__card legal__card--amber">
                <h3 className="legal__card-title">Exercising Your Rights</h3>
                <p className="legal__card-text">To exercise any right, contact us at:</p>
                <div className="legal__code">
                  <p className="legal__code-highlight">legal@mileclear.com</p>
                  <p className="legal__code-muted">Response time: 30 days (UK GDPR standard)</p>
                </div>
                <p className="legal__card-text" style={{marginTop: '1rem'}}>
                  You can also lodge a complaint with the Information Commissioner&apos;s Office (ICO) at ico.org.uk if you believe we&apos;ve violated your rights.
                </p>
              </div>
            </section>

            {/* 9. Cookies & Local Storage */}
            <section id="cookies" className="legal__section">
              <h2 className="legal__section-title">9. Cookies &amp; Local Storage</h2>
              <p className="legal__text">
                The MileClear web dashboard and landing page use minimal tracking technologies:
              </p>

              <div className="legal__card">
                <h3 className="legal__card-title">Authentication Tokens (Essential)</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Type:</strong> HttpOnly secure cookies (web) and Expo SecureStore (mobile)</li>
                  <li className="legal__list-item"><strong>Purpose:</strong> Keeping you logged in</li>
                  <li className="legal__list-item"><strong>Expiry:</strong> 15 min (access token), 30 days (refresh token)</li>
                  <li className="legal__list-item"><strong>Required:</strong> Yes, for service to function</li>
                  <li className="legal__list-item"><strong>Consent:</strong> No additional consent needed (implied by Terms of Service)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Local Storage (Web App)</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>What:</strong> Browser localStorage for UI preferences (theme, sidebar state)</li>
                  <li className="legal__list-item"><strong>Data stored:</strong> Non-personal (no PII, email, or location)</li>
                  <li className="legal__list-item"><strong>Expires:</strong> Never (user can clear manually)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Third-Party Analytics</h3>
                <p className="legal__card-text">
                  We do not use Google Analytics, Mixpanel, or similar cookie-based tracking on our website.
                </p>
                <p className="legal__card-text legal__text--small">
                  (If this changes in future, we will update this policy and seek consent via cookie banner.)
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Mobile App Storage</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>SQLite database:</strong> Offline trip data, encrypted in Expo SecureStore</li>
                  <li className="legal__list-item"><strong>User preferences:</strong> App settings stored locally</li>
                  <li className="legal__list-item"><strong>No cookies:</strong> Mobile apps don&apos;t use HTTP cookies</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Cookie Controls</h3>
                <p className="legal__card-text legal__text--small">
                  You can delete cookies and local storage anytime via browser settings (Settings &gt; Privacy &gt; Clear Browsing Data). Doing so will log you out.
                </p>
              </div>
            </section>

            {/* 10. Children's Privacy */}
            <section id="children" className="legal__section">
              <h2 className="legal__section-title">10. Children&apos;s Privacy (COPPA)</h2>

              <div className="legal__card">
                <p className="legal__card-text">
                  MileClear is not intended for users under 16 years old. We do not knowingly collect personal information from children under 16.
                </p>
                <p className="legal__card-text">
                  If you are under 16, please do not use MileClear. Parents/guardians who believe their child has provided information to us should contact legal@mileclear.com immediately.
                </p>
                <p className="legal__card-text legal__text--small">
                  <strong>Note:</strong> COPPA (US Children&apos;s Online Privacy Protection Act) does not apply to UK services, but we extend similar protections as best practice. For UK users under 16, consent from a parent/guardian would be required.
                </p>
              </div>
            </section>

            {/* 11. Security */}
            <section id="security" className="legal__section">
              <h2 className="legal__section-title">11. Security</h2>
              <p className="legal__text">
                We implement technical and organisational safeguards to protect your data:
              </p>

              <div className="legal__card">
                <h3 className="legal__card-title">Technical Security</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Encryption in Transit:</strong> HTTPS/TLS 1.3 for all data transfers</li>
                  <li className="legal__list-item"><strong>Encryption at Rest:</strong> MySQL database encryption and secure key storage</li>
                  <li className="legal__list-item"><strong>Password Security:</strong> Bcrypt hashing (12 salt rounds), never plain text</li>
                  <li className="legal__list-item"><strong>Token Security:</strong> JWT with signed secrets, 15-min expiry</li>
                  <li className="legal__list-item"><strong>Mobile Storage:</strong> Expo SecureStore (encrypted keychain) for tokens and sensitive data</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Infrastructure Security</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Hosting:</strong> UK-based server (Pixelish, 85.234.151.224) for data residency compliance</li>
                  <li className="legal__list-item"><strong>SSL Certificates:</strong> Let&apos;s Encrypt via cPanel AutoSSL</li>
                  <li className="legal__list-item"><strong>Firewall &amp; Access:</strong> cPanel security, restricted shell access, no public SSH</li>
                  <li className="legal__list-item"><strong>Rate Limiting:</strong> 5 login attempts per 15 minutes per IP (brute-force protection)</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Organisational Security</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">Staff access is restricted to those who need it (principle of least privilege)</li>
                  <li className="legal__list-item">No passwords or sensitive data hardcoded in source code</li>
                  <li className="legal__list-item">Environment variables securely managed</li>
                  <li className="legal__list-item">Regular security reviews and updates</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Data Breaches</h3>
                <p className="legal__card-text">If we discover a security breach affecting your data, we will:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">Notify you within 72 hours (UK GDPR requirement)</li>
                  <li className="legal__list-item">Provide details of affected data and our response</li>
                  <li className="legal__list-item">Recommend steps you can take to protect yourself</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{marginTop: '1rem'}}>
                  Notification will be sent to your email on file and posted on our website.
                </p>
              </div>

              <div className="legal__card legal__card--amber">
                <h3 className="legal__card-title">Limitations</h3>
                <p className="legal__card-text">
                  While we implement industry-standard security, no system is 100% secure. We cannot guarantee absolute security against all threats. You are responsible for keeping your password confidential and logging out of shared devices.
                </p>
              </div>
            </section>

            {/* 12. International Data Transfers */}
            <section id="transfers" className="legal__section">
              <h2 className="legal__section-title">12. International Data Transfers</h2>

              <div className="legal__card">
                <p className="legal__card-text">
                  <strong>Primary Storage:</strong> All user data is stored on UK-based servers (Pixelish, England) and does not leave the UK by default.
                </p>
                <p className="legal__card-text">
                  <strong>Third-Party Processors:</strong> Some third-party services may process data outside the UK:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Stripe (USA):</strong> Subject to Data Processing Agreement and Standard Contractual Clauses (SCCs)</li>
                  <li className="legal__list-item"><strong>TrueLayer/Plaid (EU/USA):</strong> Subject to DPA and SCCs</li>
                  <li className="legal__list-item"><strong>Apple/Google (USA):</strong> Limited data transfer for authentication verification only</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{marginTop: '1rem'}}>
                  All international transfers comply with UK GDPR Article 46 (SCCs) and Data Protection Act 2018 Chapter 5. We have reviewed these services&apos; security certifications and compliance frameworks.
                </p>
              </div>
            </section>

            {/* 13. Policy Changes */}
            <section id="changes" className="legal__section">
              <h2 className="legal__section-title">13. Changes to This Policy</h2>

              <div className="legal__card">
                <p className="legal__card-text">
                  We may update this Privacy Policy to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of material changes by:
                </p>
                <ul className="legal__list">
                  <li className="legal__list-item">Posting the updated policy on mileclear.com</li>
                  <li className="legal__list-item">Updating the &ldquo;Last Updated&rdquo; date (at the top of this document)</li>
                  <li className="legal__list-item">Sending you an email notification (for significant changes)</li>
                  <li className="legal__list-item">Requesting your explicit consent (if required by law)</li>
                </ul>
                <p className="legal__card-text legal__text--small" style={{marginTop: '1rem'}}>
                  Continued use of MileClear after changes constitutes acceptance of the updated policy.
                </p>
              </div>
            </section>

            {/* 14. Contact Us */}
            <section id="contact" className="legal__section">
              <h2 className="legal__section-title">14. Contact Us &amp; Data Requests</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">For Privacy Inquiries</h3>
                <div className="legal__code">
                  <p className="legal__code-highlight">Email: legal@mileclear.com</p>
                  <p className="legal__code-highlight">Subject: Privacy Request</p>
                </div>
                <p className="legal__card-text" style={{marginTop: '1rem'}}>
                  Please include details of your request (access, deletion, objection, etc.).
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Response Time</h3>
                <p className="legal__card-text">
                  We aim to respond to all data requests within <strong>30 days</strong> (UK GDPR requirement). Complex requests may take longer; we will inform you.
                </p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Data Protection Authority</h3>
                <div className="legal__code">
                  <p style={{fontFamily: 'monospace', fontSize: '0.875rem', color: 'var(--text-white)'}}>Information Commissioner&apos;s Office (ICO)</p>
                  <p className="legal__code-muted">United Kingdom</p>
                  <p className="legal__code-highlight" style={{marginTop: '0.5rem'}}>Website: ico.org.uk</p>
                  <p className="legal__code-highlight">Complaint Portal: ico.org.uk/make-a-complaint</p>
                </div>
                <p className="legal__card-text" style={{marginTop: '1rem'}}>
                  If you believe we have violated your privacy rights, you can lodge a complaint with the ICO free of charge.
                </p>
              </div>
            </section>

            {/* Legal Disclaimer */}
            <section className="legal__section">
              <div className="legal__card">
                <h3 className="legal__card-title">Legal Disclaimer</h3>
                <p className="legal__card-text legal__text--small">
                  This is a template privacy policy for informational purposes. It provides an overview of MileClear&apos;s data practices and UK GDPR compliance framework. While drafted to reflect current practices, specific implementation details and third-party integrations may vary. This policy does not constitute legal advice.
                </p>
                <p className="legal__card-text legal__text--small">
                  For legal advice tailored to your specific situation or for advice on data processing, consult with a qualified attorney specialising in UK data protection law.
                </p>
              </div>
            </section>

            {/* Footer */}
            <div className="legal__footer">
              <p className="legal__footer-text">&copy; 2026 MileClear Limited. All rights reserved.</p>
              <p className="legal__footer-text">Version 1.0 &mdash; Effective 25 February 2026</p>
              <div className="legal__footer-links">
                <a href="/terms" className="legal__footer-link">Terms of Service</a>
                <a href="/privacy" className="legal__footer-link">Privacy Policy</a>
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
