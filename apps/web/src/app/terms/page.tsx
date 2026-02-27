import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import '../legal.css';

export default function TermsOfService() {
  return (
    <>
      <Navbar />

      <main className="legal">
        <div className="container">

          {/* Header */}
          <div className="legal__header">
            <h1 className="heading">Terms of Service</h1>
            <p className="legal__date">Last updated: 25 February 2026</p>
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
              <li><a href="#termination" className="legal__toc-link">Termination</a></li>
              <li><a href="#billing" className="legal__toc-link">Billing &amp; Payments</a></li>
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
                <strong>Service Provider:</strong> MileClear Limited, a UK-registered company
              </p>
              <p className="legal__text">
                <strong>Effective Date:</strong> 25 February 2026
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
                  Parents/guardians: If your child under 16 has used MileClear, contact us immediately at legal@mileclear.com to request account deletion.
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
                  <li className="legal__list-item">✅ Track your mileage and trips for tax purposes</li>
                  <li className="legal__list-item">✅ Export data for accountants or tax filing</li>
                  <li className="legal__list-item">✅ Subscribe to premium features (£4.99/mo)</li>
                  <li className="legal__list-item">✅ Download your data for backup or portability</li>
                  <li className="legal__list-item">✅ View analytics and gamification features</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">What You Cannot Do</h3>
                <ul className="legal__list">
                  <li className="legal__list-item">❌ Resell, redistribute, or commercially exploit the Service</li>
                  <li className="legal__list-item">❌ Reverse-engineer, decompile, or bypass security features</li>
                  <li className="legal__list-item">❌ Scrape, crawl, or extract data (except your own via export)</li>
                  <li className="legal__list-item">❌ Use bots, automated tools, or scripts (except official API)</li>
                  <li className="legal__list-item">❌ Modify, translate, or create derivative works</li>
                  <li className="legal__list-item">❌ Share your account or let others use it</li>
                  <li className="legal__list-item">❌ Attempt unauthorised access or hacking</li>
                  <li className="legal__list-item">❌ Harass, abuse, or violate others' rights</li>
                  <li className="legal__list-item">❌ Use the Service for illegal purposes</li>
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
                  <li className="legal__list-item">Interfere with the Service's operation or security</li>
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
                <h3 className="legal__card-title">⚠️ Important Legal Disclaimers</h3>
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
                <h3 className="legal__card-title">⚠️ Cap on Our Liability</h3>
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

            {/* 9. Termination */}
            <section id="termination" className="legal__section">
              <h2 className="legal__section-title">9. Termination of Account</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Termination by You</h3>
                <p className="legal__card-text">You can delete your account anytime:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">In-app: Settings &gt; Account &gt; Delete Account</li>
                  <li className="legal__list-item">Or email: legal@mileclear.com with your request</li>
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

            {/* 10. Billing & Payments */}
            <section id="billing" className="legal__section">
              <h2 className="legal__section-title">10. Billing &amp; Subscription Payments</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">Free &amp; Premium Tiers</h3>
                <p className="legal__card-text"><strong>Free Tier</strong></p>
                <p className="legal__card-text legal__text--small">Always free. Track mileage, gamification, basic analytics.</p>
                <p className="legal__card-text" style={{ marginTop: '0.75rem' }}><strong>Premium Tier (£4.99/month)</strong></p>
                <p className="legal__card-text legal__text--small">HMRC exports, earnings tracking, advanced analytics, Open Banking.</p>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Subscription Terms</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Auto-renewal:</strong> Your subscription renews automatically each month unless cancelled</li>
                  <li className="legal__list-item"><strong>Billing:</strong> Charged on the same day each month (e.g., if you start on Feb 20, you'll be charged on Mar 20, Apr 20, etc.)</li>
                  <li className="legal__list-item"><strong>Payment method:</strong> Stripe processes all payments (we never store card details)</li>
                  <li className="legal__list-item"><strong>Failed payments:</strong> If a payment fails, we'll retry a few times. Repeated failures may suspend your premium access</li>
                </ul>
              </div>

              <div className="legal__card">
                <h3 className="legal__card-title">Cancellation &amp; Refunds</h3>
                <ul className="legal__list">
                  <li className="legal__list-item"><strong>Cancel anytime:</strong> Settings &gt; Billing &gt; Cancel Subscription (or email legal@mileclear.com)</li>
                  <li className="legal__list-item"><strong>No refunds:</strong> Subscription cancels at the end of your current billing period. No refunds for unused time</li>
                  <li className="legal__list-item"><strong>Cancellation effect:</strong> Premium features become unavailable immediately. Free tracking continues</li>
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
                  <li className="legal__list-item"><strong>Dispute a charge:</strong> Contact Stripe support or your bank within 60 days</li>
                  <li className="legal__list-item"><strong>Consumer rights:</strong> UK Consumer Rights Act 2015 applies; you have rights to cancel within 14 days of purchase if you change your mind</li>
                  <li className="legal__list-item"><strong>Complaint process:</strong> Email legal@mileclear.com if you believe you were charged in error</li>
                </ul>
              </div>
            </section>

            {/* 11. Intellectual Property */}
            <section id="ip" className="legal__section">
              <h2 className="legal__section-title">11. Intellectual Property Rights</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">MileClear IP</h3>
                <p className="legal__card-text">All MileClear content and technology is our intellectual property:</p>
                <ul className="legal__list">
                  <li className="legal__list-item">App code, design, and interface (© MileClear Limited)</li>
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
                  Open-source licenses: Available in the app's settings or contact legal@mileclear.com for details.
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
                  <p className="legal__code-highlight">legal@mileclear.com</p>
                </div>
                <p className="legal__card-text legal__text--small" style={{ marginTop: '1rem' }}>
                  Include: description of the work, location in the Service, proof of ownership, and contact info. We will investigate and respond within 10 days.
                </p>
              </div>
            </section>

            {/* 12. Governing Law & Jurisdiction */}
            <section id="governing" className="legal__section">
              <h2 className="legal__section-title">12. Governing Law &amp; Dispute Resolution</h2>

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
                  <li className="legal__list-item">Contact us at legal@mileclear.com with your complaint</li>
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

            {/* 13. Contact Us */}
            <section id="contact" className="legal__section">
              <h2 className="legal__section-title">13. Contact Us</h2>

              <div className="legal__card">
                <h3 className="legal__card-title">For Questions or Issues</h3>
                <div className="legal__code">
                  <p className="legal__code-highlight">Email: legal@mileclear.com</p>
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
              <p className="legal__footer-text">© 2026 MileClear Limited. All rights reserved.</p>
              <p className="legal__footer-text">Version 1.0 — Effective 25 February 2026</p>
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
