'use client';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[#030712] text-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#030712] to-[#0a0f1a] border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
          <p className="text-gray-400">Last updated: 25 February 2026</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Quick Navigation */}
        <nav className="mb-12 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Navigation</h2>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <li><a href="#acceptance" className="text-[#f5a623] hover:underline">Acceptance of Terms</a></li>
            <li><a href="#eligibility" className="text-[#f5a623] hover:underline">Eligibility & Age</a></li>
            <li><a href="#license" className="text-[#f5a623] hover:underline">License to Use</a></li>
            <li><a href="#user-responsibilities" className="text-[#f5a623] hover:underline">Your Responsibilities</a></li>
            <li><a href="#content" className="text-[#f5a623] hover:underline">User Content</a></li>
            <li><a href="#no-warranty" className="text-[#f5a623] hover:underline">Disclaimers</a></li>
            <li><a href="#limitation" className="text-[#f5a623] hover:underline">Limitation of Liability</a></li>
            <li><a href="#indemnity" className="text-[#f5a623] hover:underline">Indemnification</a></li>
            <li><a href="#termination" className="text-[#f5a623] hover:underline">Termination</a></li>
            <li><a href="#billing" className="text-[#f5a623] hover:underline">Billing & Payments</a></li>
            <li><a href="#ip" className="text-[#f5a623] hover:underline">Intellectual Property</a></li>
            <li><a href="#contact" className="text-[#f5a623] hover:underline">Contact Us</a></li>
          </ul>
        </nav>

        {/* 1. Acceptance of Terms */}
        <section id="acceptance" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">1. Acceptance of Terms</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              By downloading, installing, or using the MileClear mobile application and website (collectively, the "Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.
            </p>
            <p>
              <strong className="text-white">Service Provider:</strong> MileClear Limited, a UK-registered company
            </p>
            <p>
              <strong className="text-white">Effective Date:</strong> 25 February 2026
            </p>
            <p className="text-sm text-gray-400 italic">
              We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance. We will notify you of material changes via email or in-app notification.
            </p>
          </div>
        </section>

        {/* 2. Eligibility & Age */}
        <section id="eligibility" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">2. Eligibility & Age Requirements</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              To use MileClear, you must:
            </p>
            <ul className="space-y-2 ml-4">
              <li>• Be at least <strong className="text-white">16 years old</strong> (or the age of majority in your jurisdiction)</li>
              <li>• Have the legal capacity to enter a binding contract</li>
              <li>• Be eligible to work as a self-employed driver, gig worker, or independent contractor in the UK</li>
              <li>• Not be subject to sanctions or export restrictions</li>
              <li>• Have not previously had an account terminated for violating these Terms</li>
            </ul>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mt-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Age Verification</h3>
              <p>
                If you are under 18 but at least 16, use of MileClear may require parental or guardian consent. We do not verify age automatically; you certify by accepting these Terms that you meet age requirements. If we discover you are under 16, we will delete your account immediately.
              </p>
            </div>

            <div className="bg-amber-900 border border-amber-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Not for Children</h3>
              <p className="text-gray-300 text-sm">
                Parents/guardians: If your child under 16 has used MileClear, contact us immediately at legal@mileclear.com to request account deletion.
              </p>
            </div>
          </div>
        </section>

        {/* 3. License to Use */}
        <section id="license" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">3. License to Use the Service</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              We grant you a limited, non-exclusive, non-transferable, revocable license to access and use MileClear for your personal, non-commercial use as a self-employed driver or gig worker.
            </p>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">What You Can Do</h3>
              <ul className="space-y-2 ml-4">
                <li>✅ Track your mileage and trips for tax purposes</li>
                <li>✅ Export data for accountants or tax filing</li>
                <li>✅ Subscribe to premium features (£4.99/mo)</li>
                <li>✅ Download your data for backup or portability</li>
                <li>✅ View analytics and gamification features</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">What You Cannot Do</h3>
              <ul className="space-y-2 ml-4">
                <li>❌ Resell, redistribute, or commercially exploit the Service</li>
                <li>❌ Reverse-engineer, decompile, or bypass security features</li>
                <li>❌ Scrape, crawl, or extract data (except your own via export)</li>
                <li>❌ Use bots, automated tools, or scripts (except official API)</li>
                <li>❌ Modify, translate, or create derivative works</li>
                <li>❌ Share your account or let others use it</li>
                <li>❌ Attempt unauthorised access or hacking</li>
                <li>❌ Harass, abuse, or violate others' rights</li>
                <li>❌ Use the Service for illegal purposes</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 4. User Responsibilities */}
        <section id="user-responsibilities" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">4. Your Responsibilities</h2>
          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Account Security</h3>
              <p className="mb-3">
                You are responsible for:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Keeping your password confidential and secure</li>
                <li>• Not sharing your account with others</li>
                <li>• Logging out of shared devices</li>
                <li>• Notifying us immediately if your account is compromised</li>
                <li>• All activity under your account, whether authorised by you or not</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Accurate Information</h3>
              <p>
                You agree to provide accurate, complete, and current information when registering and updating your profile. You are responsible for the accuracy of your vehicle details, earnings data, and fuel logs entered into the Service.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Legal Compliance</h3>
              <p className="mb-3">
                You agree to use MileClear in compliance with all applicable UK laws, including:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Vehicle and road traffic laws</li>
                <li>• Tax reporting and HMRC regulations</li>
                <li>• Employment and self-employment rules (IR35, Agency Workers Regulations)</li>
                <li>• Data protection and privacy laws (UK GDPR)</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4 italic">
                MileClear is a tax and mileage tracking tool, not tax advice. Consult an accountant for compliance with your specific tax obligations.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Acceptable Use</h3>
              <p className="mb-3">
                You agree not to:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Use the Service fraudulently (false mileage, fake earnings, etc.)</li>
                <li>• Harass, threaten, defame, or harm others</li>
                <li>• Submit malware, viruses, or harmful code</li>
                <li>• Interfere with the Service's operation or security</li>
                <li>• Spam or flood with excessive requests</li>
                <li>• Use the Service for money laundering or sanctions evasion</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Location Data & Permissions</h3>
              <p className="mb-3">
                By enabling background location tracking, you:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Consent to continuous GPS tracking during active shifts</li>
                <li>• Understand that location data reveals sensitive personal information</li>
                <li>• Grant MileClear the right to store and process this data per the Privacy Policy</li>
                <li>• Confirm you are the device owner or have permission to enable location services</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4 italic">
                You can disable location tracking at any time via device settings.
              </p>
            </div>
          </div>
        </section>

        {/* 5. User Content */}
        <section id="content" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">5. User Content & Your Data</h2>
          <div className="space-y-4 text-gray-300">
            <p>
              "User Content" includes any data you submit to MileClear: trips, vehicles, earnings, fuel logs, notes, comments, and feedback.
            </p>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Ownership</h3>
              <p>
                You own all User Content you create. MileClear does not own or claim ownership of your trips, mileage data, or earnings records. We are a custodian of your data, not an owner.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Our License to Your Data</h3>
              <p className="mb-3">
                By using MileClear, you grant us a limited license to:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Store your data on our servers and local devices</li>
                <li>• Process data to provide the Service (calculations, exports, analytics)</li>
                <li>• Display data back to you in the app and dashboard</li>
                <li>• Use anonymised, aggregated data for analytics and improvement</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                We do not use your data for marketing, sale to third parties, or beyond the scope of providing the Service.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Portability & Deletion</h3>
              <p className="mb-3">
                You have the right to:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Download all your data (Settings &gt; Download My Data)</li>
                <li>• Delete your account and data (Settings &gt; Delete Account)</li>
                <li>• Correct inaccurate information anytime</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                See our Privacy Policy for full details on your data rights.
              </p>
            </div>
          </div>
        </section>

        {/* 6. Disclaimers & No Warranty */}
        <section id="no-warranty" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">6. Disclaimers & No Warranty</h2>

          <div className="bg-red-900 border border-red-700 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-[#f5a623] mb-3">⚠️ Important Legal Disclaimers</h3>
            <p className="text-gray-300 mb-4">
              MILECLEAR IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT ANY WARRANTIES OR GUARANTEES.
            </p>
          </div>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">No Warranty of Accuracy</h3>
              <p className="mb-3">
                MileClear relies on device sensors (GPS, accelerometer) which may:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Drift or lose accuracy in poor signal areas (tunnels, underground, dense buildings)</li>
                <li>• Over- or under-report distance (±5% margin of error typical for GPS)</li>
                <li>• Misclassify trips or routes due to signal loss</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4 italic">
                <strong>We do not warrant</strong> that mileage calculations are perfectly accurate for HMRC purposes. We recommend manual verification against vehicle odometer readings and business records. You are responsible for accuracy of tax claims.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">No Warranty of Availability</h3>
              <p className="mb-3">
                The Service may experience:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Unplanned downtime for maintenance, security patches, or emergencies</li>
                <li>• Scheduled maintenance (we aim for 99% uptime but cannot guarantee it)</li>
                <li>• Interruptions due to third-party services (Stripe, Apple, Google, hosting provider)</li>
                <li>• Loss of service due to device issues (no internet, storage full, OS incompatibility)</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">No Warranty of Fitness for Purpose</h3>
              <p className="mb-3">
                MileClear is provided for mileage tracking and gamified fitness, not as:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Professional tax or legal advice</li>
                <li>• Professional accounting or bookkeeping</li>
                <li>• Guaranteed proof of mileage for HMRC audits</li>
                <li>• Insurance proof of vehicle usage</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                <strong>Always consult a qualified accountant or tax advisor for tax compliance.</strong>
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Assumption of Risk</h3>
              <p>
                You use MileClear at your own risk. You assume all responsibility for any loss, damage, or inconvenience resulting from:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Inaccurate mileage or earnings data</li>
                <li>• Data loss or corruption</li>
                <li>• Service interruptions</li>
                <li>• Privacy breaches (though we implement safeguards)</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Third-Party Content & Links</h3>
              <p>
                MileClear may link to third-party websites (Xero, FreeAgent, QuickBooks, HMRC). We are not responsible for their content, accuracy, or privacy practices. Review their terms and policies before use.
              </p>
            </div>
          </div>
        </section>

        {/* 7. Limitation of Liability */}
        <section id="limitation" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">7. Limitation of Liability</h2>

          <div className="bg-red-900 border border-red-700 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-[#f5a623] mb-3">⚠️ Cap on Our Liability</h3>
            <p className="text-gray-300">
              TO THE MAXIMUM EXTENT PERMITTED BY UK LAW, MILECLEAR AND ITS OFFICERS, EMPLOYEES, AGENTS, AND SUPPLIERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITY, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
          </div>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Maximum Liability</h3>
              <p>
                Our total liability to you arising from or relating to these Terms or your use of the Service shall not exceed the greater of:
              </p>
              <ul className="space-y-2 ml-4 mt-3">
                <li>• The amount paid by you to MileClear in the 12 months preceding the claim, or</li>
                <li>• £100 (one hundred pounds)</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4 italic">
                This applies to all claims: breach of contract, negligence, warranty, tort, or otherwise.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Exceptions (No Cap)</h3>
              <p className="mb-3">
                The limitation of liability does NOT apply to:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Death or personal injury caused by our negligence</li>
                <li>• Fraud or intentional misconduct</li>
                <li>• Statutory rights you cannot waive under UK law</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Tax-Related Losses</h3>
              <p className="mb-3">
                We are not liable for:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Tax penalties or interest from HMRC due to inaccurate data</li>
                <li>• Audit costs or legal fees arising from your use of MileClear</li>
                <li>• Lost tax deductions or claimed expenses</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                You are solely responsible for ensuring tax compliance. Consult your accountant.
              </p>
            </div>
          </div>
        </section>

        {/* 8. Indemnification */}
        <section id="indemnity" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">8. Indemnification</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-gray-300">
            <p className="mb-4">
              You agree to indemnify, defend, and hold harmless MileClear and its officers, employees, agents, and successors from any claims, damages, liabilities, costs, and expenses (including legal fees) arising from or relating to:
            </p>
            <ul className="space-y-2 ml-4">
              <li>• Your use of the Service or violation of these Terms</li>
              <li>• Your User Content or data submitted to MileClear</li>
              <li>• Your breach of any law or third-party rights</li>
              <li>• Your violation of the Acceptable Use Policy</li>
            </ul>
            <p className="text-gray-400 text-sm mt-4">
              We will notify you of any such claim and cooperate in your defence.
            </p>
          </div>
        </section>

        {/* 9. Termination */}
        <section id="termination" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">9. Termination of Account</h2>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Termination by You</h3>
              <p className="mb-3">
                You can delete your account anytime:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• In-app: Settings &gt; Account &gt; Delete Account</li>
                <li>• Or email: legal@mileclear.com with your request</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                Account deletion is permanent. We will delete your data (except tax-required records, anonymised for 7 years per UK law).
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Termination by MileClear</h3>
              <p className="mb-3">
                We may suspend or terminate your account if you:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Violate these Terms or our Acceptable Use Policy</li>
                <li>• Engage in fraudulent activity (fake mileage, false earnings)</li>
                <li>• Violate UK law or regulations</li>
                <li>• Threaten, harass, or abuse other users or staff</li>
                <li>• Attempt unauthorised access or hacking</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                We will attempt to notify you before termination, except in cases of serious abuse or legal requirement.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Effect of Termination</h3>
              <p>
                Upon termination (by you or us):
              </p>
              <ul className="space-y-2 ml-4 mt-3">
                <li>• Your access to MileClear is immediately revoked</li>
                <li>• Your data is securely deleted (with exceptions noted above)</li>
                <li>• Your subscription ends; no refunds for remaining period (see Billing below)</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 10. Billing & Payments */}
        <section id="billing" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">10. Billing & Subscription Payments</h2>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Free & Premium Tiers</h3>
              <div className="space-y-3 ml-4">
                <div>
                  <strong className="text-white">Free Tier</strong>
                  <p className="text-gray-400 text-sm mt-1">Always free. Track mileage, gamification, basic analytics.</p>
                </div>
                <div>
                  <strong className="text-white">Premium Tier (£4.99/month)</strong>
                  <p className="text-gray-400 text-sm mt-1">HMRC exports, earnings tracking, advanced analytics, Open Banking.</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Subscription Terms</h3>
              <ul className="space-y-2 ml-4">
                <li>• <strong className="text-white">Auto-renewal:</strong> Your subscription renews automatically each month unless cancelled</li>
                <li>• <strong className="text-white">Billing:</strong> Charged on the same day each month (e.g., if you start on Feb 20, you'll be charged on Mar 20, Apr 20, etc.)</li>
                <li>• <strong className="text-white">Payment method:</strong> Stripe processes all payments (we never store card details)</li>
                <li>• <strong className="text-white">Failed payments:</strong> If a payment fails, we'll retry a few times. Repeated failures may suspend your premium access</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Cancellation & Refunds</h3>
              <ul className="space-y-2 ml-4">
                <li>• <strong className="text-white">Cancel anytime:</strong> Settings &gt; Billing &gt; Cancel Subscription (or email legal@mileclear.com)</li>
                <li>• <strong className="text-white">No refunds:</strong> Subscription cancels at the end of your current billing period. No refunds for unused time</li>
                <li>• <strong className="text-white">Cancellation effect:</strong> Premium features become unavailable immediately. Free tracking continues</li>
                <li>• <strong className="text-white">Reactivation:</strong> You can reactivate premium anytime; new subscription starts immediately</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Price Changes</h3>
              <p className="mb-3">
                We may increase or decrease the subscription price. We will notify you:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• At least 30 days before any price increase</li>
                <li>• Via email and in-app notification</li>
                <li>• New price takes effect on your next renewal date</li>
                <li>• You can cancel before the change if you disagree</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Taxes & VAT</h3>
              <p>
                Prices are shown before VAT (if applicable). We calculate and add VAT at checkout based on your location. You are responsible for any local taxes on subscription.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Consumer Rights (UK)</h3>
              <p className="mb-3">
                If you have a valid complaint about billing:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• <strong className="text-white">Dispute a charge:</strong> Contact Stripe support or your bank within 60 days</li>
                <li>• <strong className="text-white">Consumer rights:</strong> UK Consumer Rights Act 2015 applies; you have rights to cancel within 14 days of purchase if you change your mind</li>
                <li>• <strong className="text-white">Complaint process:</strong> Email legal@mileclear.com if you believe you were charged in error</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 11. Intellectual Property */}
        <section id="ip" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">11. Intellectual Property Rights</h2>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">MileClear IP</h3>
              <p className="mb-3">
                All MileClear content and technology is our intellectual property:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• App code, design, and interface (© MileClear Limited)</li>
                <li>• Brand name, logo, wordmark (™ MileClear)</li>
                <li>• Algorithms (Haversine distance, stop detection, etc.)</li>
                <li>• Documentation and guides</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                You have a license to use these only as permitted by these Terms. Do not copy, reproduce, or reverse-engineer.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Third-Party Licenses</h3>
              <p className="mb-3">
                MileClear uses open-source libraries (React, TypeScript, Prisma, etc.) and proprietary services (Stripe, Apple, Google). We comply with all third-party licenses and respect their intellectual property.
              </p>
              <p className="text-gray-400 text-sm">
                Open-source licenses: Available in the app's settings or contact legal@mileclear.com for details.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Your IP</h3>
              <p>
                You retain ownership of your User Content (trips, notes, etc.). By submitting it to MileClear, you grant us the limited license described in Section 5 (User Content).
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">DMCA / Copyright Infringement</h3>
              <p className="mb-3">
                If you believe MileClear infringes your copyright or IP, contact:
              </p>
              <div className="bg-black rounded p-4 text-sm font-mono">
                <p className="text-[#f5a623]">legal@mileclear.com</p>
              </div>
              <p className="text-gray-400 text-sm mt-4">
                Include: description of the work, location in the Service, proof of ownership, and contact info. We will investigate and respond within 10 days.
              </p>
            </div>
          </div>
        </section>

        {/* 12. Governing Law & Jurisdiction */}
        <section id="governing" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">12. Governing Law & Dispute Resolution</h2>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">UK Law</h3>
              <p>
                These Terms are governed by the laws of England and Wales, UK. Any disputes arising from these Terms or your use of MileClear shall be subject to the exclusive jurisdiction of the English courts.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Informal Resolution</h3>
              <p className="mb-3">
                Before litigation, we encourage you to:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Contact us at legal@mileclear.com with your complaint</li>
                <li>• Give us 30 days to respond and resolve the issue</li>
                <li>• Be specific about the problem and your desired resolution</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Limitation on Lawsuits</h3>
              <p className="mb-3">
                You agree that any claim or cause of action arising from these Terms or your use of the Service must be filed within <strong className="text-white">one year</strong> after the cause of action arises. After one year, you lose the right to claim.
              </p>
            </div>
          </div>
        </section>

        {/* 13. Contact Us */}
        <section id="contact" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">13. Contact Us</h2>

          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-4">For Questions or Issues</h3>
              <div className="bg-black rounded p-4 text-sm font-mono space-y-2">
                <p className="text-[#f5a623]">Email: legal@mileclear.com</p>
                <p className="text-gray-400 mt-2">Response time: 5 business days</p>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-4">Service-Related Issues</h3>
              <div className="bg-black rounded p-4 text-sm font-mono space-y-2">
                <p className="text-[#f5a623]">In-app support: Help &gt; Contact Support</p>
                <p className="text-gray-400 mt-2">Response time: 24-48 hours</p>
              </div>
            </div>
          </div>
        </section>

        {/* Final Disclaimer */}
        <section className="mb-12 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[#f5a623] mb-4">Final Disclaimers</h2>
          <div className="space-y-3 text-gray-300 text-sm">
            <p>
              <strong className="text-white">Tax Advice Disclaimer:</strong> MileClear is a mileage tracking tool, not a substitute for professional tax or legal advice. Always consult a qualified accountant or solicitor about your tax obligations.
            </p>
            <p>
              <strong className="text-white">HMRC Compliance:</strong> While MileClear helps track mileage per HMRC guidance, we cannot guarantee that data will be accepted by HMRC in an audit. Keep supporting records (vehicle odometer readings, business logs, fuel receipts).
            </p>
            <p>
              <strong className="text-white">Data Protection:</strong> While we implement strong security, no system is 100% secure. See our Privacy Policy for data protection details.
            </p>
          </div>
        </section>

        {/* Footer */}
        <div className="border-t border-gray-800 pt-8 mt-12 text-center text-gray-500 text-sm">
          <p>© 2026 MileClear Limited. All rights reserved.</p>
          <p className="mt-2">Version 1.0 — Effective 25 February 2026</p>
          <p className="mt-4"><a href="/privacy" className="text-[#f5a623] hover:underline">Privacy Policy</a> | <a href="/terms" className="text-[#f5a623] hover:underline">Terms of Service</a></p>
        </div>
      </div>
    </div>
  );
}
