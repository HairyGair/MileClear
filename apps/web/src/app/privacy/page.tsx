'use client';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#030712] text-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#030712] to-[#0a0f1a] border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
          <p className="text-gray-400">Last updated: 25 February 2026</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Table of Contents */}
        <nav className="mb-12 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Navigation</h2>
          <ul className="space-y-2 text-sm">
            <li><a href="#overview" className="text-[#f5a623] hover:underline">Overview</a></li>
            <li><a href="#what-data" className="text-[#f5a623] hover:underline">What Data We Collect</a></li>
            <li><a href="#how-used" className="text-[#f5a623] hover:underline">How We Use Your Data</a></li>
            <li><a href="#lawful-basis" className="text-[#f5a623] hover:underline">Lawful Basis for Processing</a></li>
            <li><a href="#location-tracking" className="text-[#f5a623] hover:underline">Location Tracking & Background Permissions</a></li>
            <li><a href="#sharing" className="text-[#f5a623] hover:underline">Who We Share Data With</a></li>
            <li><a href="#retention" className="text-[#f5a623] hover:underline">Data Retention</a></li>
            <li><a href="#your-rights" className="text-[#f5a623] hover:underline">Your Rights</a></li>
            <li><a href="#cookies" className="text-[#f5a623] hover:underline">Cookies & Local Storage</a></li>
            <li><a href="#children" className="text-[#f5a623] hover:underline">Children's Privacy</a></li>
            <li><a href="#security" className="text-[#f5a623] hover:underline">Security</a></li>
            <li><a href="#contact" className="text-[#f5a623] hover:underline">Contact Us</a></li>
          </ul>
        </nav>

        {/* 1. Overview */}
        <section id="overview" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">1. Overview</h2>
          <p className="text-gray-300 mb-4">
            MileClear ("we," "us," "our," or "Company") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application and website (collectively, the "Service").
          </p>
          <p className="text-gray-300 mb-4">
            <strong className="text-white">Service Provider:</strong> MileClear Limited, a UK-registered company
          </p>
          <p className="text-gray-300 mb-4">
            <strong className="text-white">Website:</strong> mileclear.com
          </p>
          <p className="text-gray-300">
            This policy applies to all users of MileClear, including gig workers (Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, Gophr, DPD, Yodel, Evri drivers), self-employed drivers, and professionals who use our mileage tracking service. We comply with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and other applicable UK privacy laws.
          </p>
        </section>

        {/* 2. What Data We Collect */}
        <section id="what-data" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">2. What Data We Collect</h2>

          <div className="space-y-6">
            {/* Account Data */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Account Information</h3>
              <ul className="text-gray-300 space-y-2 ml-4">
                <li>• Email address</li>
                <li>• Display name (optional)</li>
                <li>• Password (hashed with bcryptjs, never stored in plain text)</li>
                <li>• Apple ID (if using Apple Sign-In)</li>
                <li>• Google ID (if using Google Sign-In)</li>
                <li>• Account creation date and login history</li>
              </ul>
            </div>

            {/* Location Data */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Location Data</h3>
              <ul className="text-gray-300 space-y-2 ml-4">
                <li>• GPS coordinates and altitude</li>
                <li>• Real-time location during active shifts (with your explicit permission)</li>
                <li>• Significant location changes outside shifts for drive detection</li>
                <li>• Location history for route replay and trip reconstruction</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4 italic">
                Location tracking requires you to grant background location permissions on your device. See Section 4 for full details on how we use this data.
              </p>
            </div>

            {/* Vehicle Data */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Vehicle Information</h3>
              <ul className="text-gray-300 space-y-2 ml-4">
                <li>• Make and model</li>
                <li>• Year of manufacture</li>
                <li>• Fuel type (petrol, diesel, electric, hybrid)</li>
                <li>• Registration plate</li>
                <li>• Miles per gallon (MPG) or efficiency rating</li>
              </ul>
            </div>

            {/* Trip Data */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Trip and Shift Data</h3>
              <ul className="text-gray-300 space-y-2 ml-4">
                <li>• Shift start and end times</li>
                <li>• Trip start and end coordinates</li>
                <li>• Trip addresses and route information</li>
                <li>• Distance travelled in miles</li>
                <li>• Trip classification (business or personal)</li>
                <li>• GPS breadcrumbs and precise location history</li>
                <li>• Trip notes and comments you add</li>
              </ul>
            </div>

            {/* Earnings Data */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Earnings and Financial Data</h3>
              <ul className="text-gray-300 space-y-2 ml-4">
                <li>• Earnings from gig platforms (manually entered)</li>
                <li>• CSV import of earnings data</li>
                <li>• Open Banking data via TrueLayer/Plaid (premium users only)</li>
                <li>• Payment method information (card details are processed by Stripe only, we never store them)</li>
                <li>• Stripe customer ID and subscription ID</li>
              </ul>
            </div>

            {/* Fuel Data */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Fuel and Maintenance Data</h3>
              <ul className="text-gray-300 space-y-2 ml-4">
                <li>• Fuel fill-up records (litres, cost, date)</li>
                <li>• Fuel station name and location</li>
                <li>• Odometer readings</li>
              </ul>
            </div>

            {/* Usage Data */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Usage and Device Data</h3>
              <ul className="text-gray-300 space-y-2 ml-4">
                <li>• Device type and operating system</li>
                <li>• App version and build number</li>
                <li>• Feature usage analytics (anonymous)</li>
                <li>• Session information (login/logout times)</li>
                <li>• Error logs and crash reports</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 3. How We Use Your Data */}
        <section id="how-used" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">3. How We Use Your Data</h2>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Essential Service Functions</h3>
              <ul className="space-y-2 ml-4">
                <li>• Creating and managing your account</li>
                <li>• Authenticating you at login (email, Apple, or Google)</li>
                <li>• Tracking mileage and trips in real-time</li>
                <li>• Calculating HMRC-compliant tax deductions (45p/mile for cars up to 10,000 miles, 25p/mile thereafter; 24p/mile for motorbikes)</li>
                <li>• Generating export files for tax reporting (PDF, CSV) and accounting software (Xero, FreeAgent, QuickBooks)</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Premium Features</h3>
              <ul className="space-y-2 ml-4">
                <li>• Earnings tracking and automatic import via Open Banking (TrueLayer/Plaid)</li>
                <li>• Advanced analytics and performance metrics</li>
                <li>• HMRC export functionality</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Gamification and Engagement</h3>
              <ul className="space-y-2 ml-4">
                <li>• Tracking achievements and badges</li>
                <li>• Calculating gamification stats (safety score, efficiency, consistency)</li>
                <li>• Displaying leaderboards and milestones</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Billing and Subscriptions</h3>
              <ul className="space-y-2 ml-4">
                <li>• Processing subscription payments via Stripe</li>
                <li>• Managing premium feature access</li>
                <li>• Handling refunds and cancellations</li>
                <li>• Sending billing notifications and receipts</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Communication</h3>
              <ul className="space-y-2 ml-4">
                <li>• Responding to support inquiries</li>
                <li>• Sending account notifications (login alerts, password reset, verification)</li>
                <li>• Service updates and maintenance notices</li>
                <li>• Feature announcements (only with your consent)</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Analytics and Improvement</h3>
              <ul className="space-y-2 ml-4">
                <li>• Analysing app usage patterns to improve service quality</li>
                <li>• Debugging technical issues and improving app stability</li>
                <li>• Understanding user behaviour for feature development</li>
                <li>• Generating anonymised analytics and reports</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Legal and Safety</h3>
              <ul className="space-y-2 ml-4">
                <li>• Complying with legal obligations and court orders</li>
                <li>• Detecting and preventing fraud or abuse</li>
                <li>• Enforcing our Terms of Service and other agreements</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 4. Lawful Basis for Processing */}
        <section id="lawful-basis" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">4. Lawful Basis for Processing</h2>
          <p className="text-gray-300 mb-6">
            Under UK GDPR Article 6, we only process your personal data on one of the following lawful bases:
          </p>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Consent (Article 6(1)(a))</h3>
              <p className="mb-3">
                We rely on your explicit consent for:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Background location tracking during active shifts</li>
                <li>• Significant location change detection outside shifts</li>
                <li>• Sending marketing communications or newsletters (opt-in)</li>
                <li>• Using Open Banking/Plaid to import earnings data</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                You can withdraw consent at any time by disabling location permissions on your device settings or unsubscribing from communications.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Contract (Article 6(1)(b))</h3>
              <p className="mb-3">
                We process data necessary to fulfil our contract with you:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Account creation and authentication</li>
                <li>• Trip tracking and mileage calculation</li>
                <li>• Billing and subscription management</li>
                <li>• Providing support services</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Legitimate Interest (Article 6(1)(f))</h3>
              <p className="mb-3">
                We process data where we have a legitimate business interest:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Analytics and service improvement (understanding usage patterns)</li>
                <li>• Fraud detection and abuse prevention</li>
                <li>• App stability and debugging (error logs)</li>
                <li>• Security monitoring and protection against unauthorised access</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                We conduct balancing tests to ensure our interests do not override your privacy rights. You have the right to object to this processing.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Legal Obligation (Article 6(1)(c))</h3>
              <p className="mb-3">
                We process data to comply with UK laws:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Tax reporting and HMRC compliance</li>
                <li>• Responding to lawful government requests or court orders</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 5. Location Tracking */}
        <section id="location-tracking" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">5. Location Tracking & Background Permissions</h2>

          <div className="space-y-4 text-gray-300">
            <div className="bg-blue-900 border border-blue-700 rounded-lg p-6 mb-6">
              <p className="font-semibold text-white mb-3">
                Location data is core to MileClear's functionality. This section explains how we collect, use, and protect it.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">How We Collect Location Data</h3>
              <ul className="space-y-2 ml-4">
                <li><strong className="text-white">During Active Shifts:</strong> When you start a shift, we continuously record GPS coordinates at intervals (approximately every 50 metres or 10 seconds) to track your route and calculate distance. This requires your explicit permission via the "Allow Background Location" prompt on your device.</li>
                <li><strong className="text-white">Outside Shifts:</strong> When shifts are inactive, we monitor for significant location changes (speed &gt; 15mph) to detect if you're driving. This uses low-power location services and requires separate permission.</li>
                <li><strong className="text-white">Stop Detection:</strong> We identify stops and trip boundaries by detecting when speed = 0 for more than 2 minutes.</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Your Control Over Location Data</h3>
              <ul className="space-y-3 ml-4">
                <li className="flex items-start">
                  <span className="text-[#f5a623] mr-3 flex-shrink-0">•</span>
                  <span>
                    <strong className="text-white">Mobile Settings:</strong> You can disable background location at any time in Settings &gt; Privacy &gt; Location on iOS or Settings &gt; Apps &gt; Permissions &gt; Location on Android. The app will continue to work but cannot track trips.
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-[#f5a623] mr-3 flex-shrink-0">•</span>
                  <span>
                    <strong className="text-white">In-App Controls:</strong> You can pause tracking at any time by ending your shift. Location recording stops immediately.
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-[#f5a623] mr-3 flex-shrink-0">•</span>
                  <span>
                    <strong className="text-white">Deletion:</strong> You can delete individual trips or all location history from within the app. See Section 8 (Your Rights) for account deletion.
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Storage and Privacy</h3>
              <ul className="space-y-2 ml-4">
                <li>• Location data is stored locally on your phone first (SQLite) before syncing to our secure server</li>
                <li>• Offline-first design means tracking works even without internet</li>
                <li>• GPS breadcrumbs enable trip replay and route verification for tax purposes</li>
                <li>• Data is encrypted in transit (HTTPS) and at rest on our UK servers</li>
                <li>• Only you and authorised app support staff can view your location data</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Privacy Implications</h3>
              <p className="mb-3">
                We understand location data is highly sensitive and reveals personal habits, travel patterns, and private locations. Therefore:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• We never share raw location data with third parties (including your employers, Uber, Deliveroo, etc.)</li>
                <li>• We only extract aggregate metrics: distance, duration, start/end points, and route summary</li>
                <li>• Location data is never used for marketing or sold to advertisers</li>
                <li>• We do not build detailed movement profiles or timelines of your personal activities</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 6. Sharing Data */}
        <section id="sharing" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">6. Who We Share Data With</h2>

          <p className="text-gray-300 mb-6">
            We only share data with third parties who need it to provide or support our service, and only on a need-to-know basis.
          </p>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Essential Service Providers (Data Processors)</h3>
              <div className="space-y-3 ml-4">
                <div>
                  <strong className="text-white">Stripe (Payment Processing)</strong>
                  <p className="text-gray-400 text-sm mt-1">PCI DSS Level 1 compliant. We share: Stripe customer ID, subscription status, and transaction records. Card details are entered directly into Stripe's secure forms — we never see them.</p>
                </div>
                <div>
                  <strong className="text-white">TrueLayer / Plaid (Open Banking)</strong>
                  <p className="text-gray-400 text-sm mt-1">Premium users only. We share: request to connect your bank account for earnings auto-import. TrueLayer/Plaid acts as intermediary — they do not store your bank login, only aggregated transaction data.</p>
                </div>
                <div>
                  <strong className="text-white">Apple & Google (Authentication)</strong>
                  <p className="text-gray-400 text-sm mt-1">Sign-in only. We share: email address (sometimes) and sign-in request. We verify the token on our servers; Apple/Google do not see your other data.</p>
                </div>
                <div>
                  <strong className="text-white">Expo / EAS (App Infrastructure)</strong>
                  <p className="text-gray-400 text-sm mt-1">App distribution and crash reporting only. No personal data is shared.</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Legal Obligations</h3>
              <p>
                We may disclose your data if required by law (court order, government request, law enforcement) or to protect our legal rights. Such disclosures are made only where legally required and accompanied by appropriate safeguards.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">What We Never Do</h3>
              <ul className="space-y-2 ml-4">
                <li>• Never sell personal data to advertisers, brokers, or third-party marketers</li>
                <li>• Never share data with gig platforms (Uber, Deliveroo, etc.) without your explicit request</li>
                <li>• Never share data with employers, tax authorities, or HMRC automatically</li>
                <li>• Never use location data for targeted advertising</li>
                <li>• Never build profiles for other companies</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Data Processing Agreements</h3>
              <p className="mb-3">
                All third-party processors sign Data Processing Agreements (DPAs) under UK GDPR Article 28, guaranteeing:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Processing only on our documented instructions</li>
                <li>• Appropriate technical and organisational security measures</li>
                <li>• Confidentiality and staff training requirements</li>
                <li>• Sub-processor notifications and approvals</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 7. Data Retention */}
        <section id="retention" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">7. Data Retention</h2>

          <p className="text-gray-300 mb-6">
            We retain data only as long as necessary. Here are our retention periods:
          </p>

          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-white font-semibold mb-2">Active Account Data</h4>
                  <p className="text-gray-300 text-sm">Duration of account use + 7 years</p>
                  <p className="text-gray-400 text-xs mt-2 italic">(UK tax records retention requirement)</p>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-2">Deleted Accounts</h4>
                  <p className="text-gray-300 text-sm">7 years (tax compliance)</p>
                  <p className="text-gray-400 text-xs mt-2 italic">Anonymised after deletion for analytics</p>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-2">Location Data</h4>
                  <p className="text-gray-300 text-sm">7 tax years, then deleted</p>
                  <p className="text-gray-400 text-xs mt-2 italic">Required for HMRC deduction proof</p>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-2">Trip Records</h4>
                  <p className="text-gray-300 text-sm">7 years, then deleted</p>
                  <p className="text-gray-400 text-xs mt-2 italic">Same as location data</p>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-2">Login Tokens</h4>
                  <p className="text-gray-300 text-sm">15 min (access), 30 days (refresh)</p>
                  <p className="text-gray-400 text-xs mt-2 italic">Auto-expire; not stored long-term</p>
                </div>
                <div>
                  <h4 className="text-white font-semibold mb-2">Billing Records</h4>
                  <p className="text-gray-300 text-sm">7 years</p>
                  <p className="text-gray-400 text-xs mt-2 italic">UK VAT and tax law requirement</p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-gray-300 mt-6">
            After retention periods expire, we securely delete or anonymise data. You can request deletion earlier (see Your Rights section). Anonymised data (aggregated stats with no identifiable information) may be retained indefinitely for analytics.
          </p>
        </section>

        {/* 8. Your Rights */}
        <section id="your-rights" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">8. Your Rights Under UK GDPR</h2>

          <p className="text-gray-300 mb-6">
            You have rights over your personal data. Here's how to exercise them:
          </p>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Right of Access (Article 15)</h3>
              <p className="mb-3">
                You can request a copy of all your personal data. We provide it in a structured, portable format (JSON export).
              </p>
              <p className="text-gray-400 text-sm">
                <strong>How to request:</strong> Use the "Download My Data" button in Settings within the MileClear app, or email legal@mileclear.com. We respond within 30 days.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Right of Rectification (Article 16)</h3>
              <p className="mb-3">
                You can correct or update inaccurate data (e.g., vehicle details, display name).
              </p>
              <p className="text-gray-400 text-sm">
                <strong>How to request:</strong> Edit your profile directly in the app (Settings &gt; Account Info). For data you cannot edit, email legal@mileclear.com.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Right of Erasure ("Right to Be Forgotten") (Article 17)</h3>
              <p className="mb-3">
                You can delete your account and associated data (subject to legal obligations).
              </p>
              <p className="text-gray-400 text-sm mb-3">
                <strong>How to request:</strong> Click "Delete Account" in Settings &gt; Account &gt; Danger Zone, or email legal@mileclear.com.
              </p>
              <p className="text-gray-400 text-sm italic">
                <strong>Exceptions:</strong> We may retain anonymised data and records required by tax law (7 years) or court order.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Right to Restrict Processing (Article 18)</h3>
              <p className="mb-3">
                You can ask us to limit how we use your data (e.g., stop analytics but keep account).
              </p>
              <p className="text-gray-400 text-sm">
                <strong>How to request:</strong> Email legal@mileclear.com with details of what should be restricted.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Right to Data Portability (Article 20)</h3>
              <p className="mb-3">
                You can export your data in a machine-readable format to switch to another service.
              </p>
              <p className="text-gray-400 text-sm">
                <strong>How to request:</strong> Use "Download My Data" in Settings. We provide JSON format including trips, vehicles, earnings, and achievements.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Right to Object (Article 21)</h3>
              <p className="mb-3">
                You can object to processing based on legitimate interest (analytics, fraud detection).
              </p>
              <p className="text-gray-400 text-sm mb-3">
                <strong>How to request:</strong> Email legal@mileclear.com stating which processing you object to.
              </p>
              <p className="text-gray-400 text-sm italic">
                Note: Objecting to essential processing (trip tracking, billing) may prevent the service from functioning.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Right Not to Be Subject to Automated Decision Making (Article 22)</h3>
              <p className="mb-3">
                You have the right to human review if we make decisions using only automated processing with legal effects.
              </p>
              <p className="text-gray-400 text-sm">
                Currently, we do not use fully automated decision-making. Decisions about premium access are made manually or with human oversight.
              </p>
            </div>

            <div className="bg-amber-900 border border-amber-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Exercising Your Rights</h3>
              <p className="text-gray-300 mb-3">
                To exercise any right, contact us at:
              </p>
              <div className="bg-gray-900 rounded p-4 text-sm font-mono">
                <p className="text-[#f5a623]">legal@mileclear.com</p>
                <p className="text-gray-400 mt-2">Response time: 30 days (UK GDPR standard)</p>
              </div>
              <p className="text-gray-300 mt-4 text-sm">
                You can also lodge a complaint with the Information Commissioner's Office (ICO) at ico.org.uk if you believe we've violated your rights.
              </p>
            </div>
          </div>
        </section>

        {/* 9. Cookies & Local Storage */}
        <section id="cookies" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">9. Cookies & Local Storage</h2>

          <p className="text-gray-300 mb-6">
            The MileClear web dashboard and landing page use minimal tracking technologies:
          </p>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Authentication Tokens (Essential)</h3>
              <ul className="space-y-2 ml-4">
                <li>• <strong className="text-white">Type:</strong> HttpOnly secure cookies (web) and Expo SecureStore (mobile)</li>
                <li>• <strong className="text-white">Purpose:</strong> Keeping you logged in</li>
                <li>• <strong className="text-white">Expiry:</strong> 15 min (access token), 30 days (refresh token)</li>
                <li>• <strong className="text-white">Required:</strong> Yes, for service to function</li>
                <li>• <strong className="text-white">Consent:</strong> No additional consent needed (implied by Terms of Service)</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Local Storage (Web App)</h3>
              <ul className="space-y-2 ml-4">
                <li>• <strong className="text-white">What:</strong> Browser localStorage for UI preferences (theme, sidebar state)</li>
                <li>• <strong className="text-white">Data stored:</strong> Non-personal (no PII, email, or location)</li>
                <li>• <strong className="text-white">Expires:</strong> Never (user can clear manually)</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Third-Party Analytics</h3>
              <p className="mb-3">
                We do not use Google Analytics, Mixpanel, or similar cookie-based tracking on our website.
              </p>
              <p className="text-gray-400 text-sm">
                (If this changes in future, we will update this policy and seek consent via cookie banner.)
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Mobile App Storage</h3>
              <ul className="space-y-2 ml-4">
                <li>• <strong className="text-white">SQLite database:</strong> Offline trip data, encrypted in Expo SecureStore</li>
                <li>• <strong className="text-white">User preferences:</strong> App settings stored locally</li>
                <li>• <strong className="text-white">No cookies:</strong> Mobile apps don't use HTTP cookies</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Cookie Controls</h3>
              <p className="text-gray-400 text-sm">
                You can delete cookies and local storage anytime via browser settings (Settings &gt; Privacy &gt; Clear Browsing Data). Doing so will log you out.
              </p>
            </div>
          </div>
        </section>

        {/* 10. Children's Privacy */}
        <section id="children" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">10. Children's Privacy (COPPA)</h2>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-gray-300 space-y-4">
            <p>
              MileClear is not intended for users under 16 years old. We do not knowingly collect personal information from children under 16.
            </p>
            <p>
              If you are under 16, please do not use MileClear. Parents/guardians who believe their child has provided information to us should contact legal@mileclear.com immediately.
            </p>
            <p className="text-sm italic text-gray-400">
              <strong>Note:</strong> COPPA (US Children's Online Privacy Protection Act) does not apply to UK services, but we extend similar protections as best practice. For UK users under 16, consent from a parent/guardian would be required.
            </p>
          </div>
        </section>

        {/* 11. Security */}
        <section id="security" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">11. Security</h2>

          <p className="text-gray-300 mb-6">
            We implement technical and organisational safeguards to protect your data:
          </p>

          <div className="space-y-4 text-gray-300">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Technical Security</h3>
              <ul className="space-y-2 ml-4">
                <li>• <strong className="text-white">Encryption in Transit:</strong> HTTPS/TLS 1.3 for all data transfers</li>
                <li>• <strong className="text-white">Encryption at Rest:</strong> MySQL database encryption and secure key storage</li>
                <li>• <strong className="text-white">Password Security:</strong> Bcrypt hashing (12 salt rounds), never plain text</li>
                <li>• <strong className="text-white">Token Security:</strong> JWT with signed secrets, 15-min expiry</li>
                <li>• <strong className="text-white">Mobile Storage:</strong> Expo SecureStore (encrypted keychain) for tokens and sensitive data</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Infrastructure Security</h3>
              <ul className="space-y-2 ml-4">
                <li>• <strong className="text-white">Hosting:</strong> UK-based server (Pixelish, 85.234.151.224) for data residency compliance</li>
                <li>• <strong className="text-white">SSL Certificates:</strong> Let's Encrypt via cPanel AutoSSL</li>
                <li>• <strong className="text-white">Firewall &amp; Access:</strong> cPanel security, restricted shell access, no public SSH</li>
                <li>• <strong className="text-white">Rate Limiting:</strong> 5 login attempts per 15 minutes per IP (brute-force protection)</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Organisational Security</h3>
              <ul className="space-y-2 ml-4">
                <li>• Staff access is restricted to those who need it (principle of least privilege)</li>
                <li>• No passwords or sensitive data hardcoded in source code</li>
                <li>• Environment variables securely managed</li>
                <li>• Regular security reviews and updates</li>
              </ul>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Data Breaches</h3>
              <p className="mb-3">
                If we discover a security breach affecting your data, we will:
              </p>
              <ul className="space-y-2 ml-4">
                <li>• Notify you within 72 hours (UK GDPR requirement)</li>
                <li>• Provide details of affected data and our response</li>
                <li>• Recommend steps you can take to protect yourself</li>
              </ul>
              <p className="text-gray-400 text-sm mt-4">
                Notification will be sent to your email on file and posted on our website.
              </p>
            </div>

            <div className="bg-amber-900 border border-amber-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-3">Limitations</h3>
              <p className="text-gray-300 text-sm">
                While we implement industry-standard security, no system is 100% secure. We cannot guarantee absolute security against all threats. You are responsible for keeping your password confidential and logging out of shared devices.
              </p>
            </div>
          </div>
        </section>

        {/* 12. International Data Transfers */}
        <section id="transfers" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">12. International Data Transfers</h2>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-gray-300 space-y-4">
            <p>
              <strong className="text-white">Primary Storage:</strong> All user data is stored on UK-based servers (Pixelish, England) and does not leave the UK by default.
            </p>
            <p>
              <strong className="text-white">Third-Party Processors:</strong> Some third-party services may process data outside the UK:
            </p>
            <ul className="space-y-2 ml-4">
              <li>• <strong className="text-white">Stripe (USA):</strong> Subject to Data Processing Agreement and Standard Contractual Clauses (SCCs)</li>
              <li>• <strong className="text-white">TrueLayer/Plaid (EU/USA):</strong> Subject to DPA and SCCs</li>
              <li>• <strong className="text-white">Apple/Google (USA):</strong> Limited data transfer for authentication verification only</li>
            </ul>
            <p className="text-gray-400 text-sm mt-4">
              All international transfers comply with UK GDPR Article 46 (SCCs) and Data Protection Act 2018 Chapter 5. We have reviewed these services' security certifications and compliance frameworks.
            </p>
          </div>
        </section>

        {/* 13. Policy Changes */}
        <section id="changes" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">13. Changes to This Policy</h2>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-gray-300 space-y-4">
            <p>
              We may update this Privacy Policy to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of material changes by:
            </p>
            <ul className="space-y-2 ml-4">
              <li>• Posting the updated policy on mileclear.com</li>
              <li>• Updating the "Last Updated" date (at the top of this document)</li>
              <li>• Sending you an email notification (for significant changes)</li>
              <li>• Requesting your explicit consent (if required by law)</li>
            </ul>
            <p className="text-gray-400 text-sm">
              Continued use of MileClear after changes constitutes acceptance of the updated policy.
            </p>
          </div>
        </section>

        {/* 14. Contact Us */}
        <section id="contact" className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-4">14. Contact Us & Data Requests</h2>

          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-4">For Privacy Inquiries</h3>
              <div className="bg-black rounded p-4 text-sm font-mono space-y-2">
                <p className="text-[#f5a623]">Email: legal@mileclear.com</p>
                <p className="text-[#f5a623]">Subject: Privacy Request</p>
              </div>
              <p className="text-gray-300 text-sm mt-4">
                Please include details of your request (access, deletion, objection, etc.).
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-4">Response Time</h3>
              <p className="text-gray-300">
                We aim to respond to all data requests within <strong className="text-white">30 days</strong> (UK GDPR requirement). Complex requests may take longer; we will inform you.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-[#f5a623] mb-4">Data Protection Authority</h3>
              <div className="bg-black rounded p-4 text-sm font-mono space-y-2">
                <p className="text-white">Information Commissioner's Office (ICO)</p>
                <p className="text-gray-400">United Kingdom</p>
                <p className="text-[#f5a623] mt-2">Website: ico.org.uk</p>
                <p className="text-[#f5a623]">Complaint Portal: ico.org.uk/make-a-complaint</p>
              </div>
              <p className="text-gray-300 text-sm mt-4">
                If you believe we have violated your privacy rights, you can lodge a complaint with the ICO free of charge.
              </p>
            </div>
          </div>
        </section>

        {/* Legal Disclaimer */}
        <section className="mb-12 bg-gray-900 border border-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-[#f5a623] mb-4">Legal Disclaimer</h2>
          <p className="text-gray-400 text-sm">
            This is a template privacy policy for informational purposes. It provides an overview of MileClear's data practices and UK GDPR compliance framework. While drafted to reflect current practices, specific implementation details and third-party integrations may vary. This policy does not constitute legal advice.
          </p>
          <p className="text-gray-400 text-sm mt-3">
            For legal advice tailored to your specific situation or for advice on data processing, consult with a qualified attorney specialising in UK data protection law.
          </p>
        </section>

        {/* Footer */}
        <div className="border-t border-gray-800 pt-8 mt-12 text-center text-gray-500 text-sm">
          <p>© 2026 MileClear Limited. All rights reserved.</p>
          <p className="mt-2">Version 1.0 — Effective 25 February 2026</p>
        </div>
      </div>
    </div>
  );
}
