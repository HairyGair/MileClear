'use client';

import { useState } from 'react';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import BreadcrumbsJsonLd from '@/components/seo/BreadcrumbsJsonLd';
import './support.css';

// FAQ is grouped into sections matching the in-app Help & Tutorials
// screen at /help. Each `q` is mirrored in the FAQPage schema below
// (flattened across all sections) so Google indexes every Q individually.
const faqSections = [
  {
    title: 'Getting started',
    faqs: [
      {
        q: 'What does MileClear actually do for me?',
        a: 'MileClear automatically records every mile you drive for work and calculates the tax deduction HMRC owes you back. At year-end you can export a PDF Self Assessment, submit quarterly returns direct to HMRC (Pro), or hand the numbers to your accountant. For UK tax years 2024-25 and earlier the standard AMAP rate is 45p per mile for the first 10,000 business miles and 25p after — MileClear tracks both tiers automatically.',
      },
      {
        q: 'How does MileClear know when I’m driving?',
        a: 'Two ways. Drive past 15mph for more than a few minutes and the app starts a recording automatically (we call it "watch-and-wait" detection). Or set up saved locations like Home and Work, and we’ll auto-detect when you leave one and arrive at another. The Lock Screen shows a Live Activity from the moment you cross a saved-location boundary, so you can see the trip recording in real time without unlocking your phone.',
      },
      {
        q: 'What’s the difference between Work and Personal mode?',
        a: 'Top of the dashboard — toggle between Work and Personal whenever your day changes. Work mode shows your tax deduction, business insights, and HMRC tooling. Personal mode shows journey timeline, milestones, and fuel costs. If you do both, set your dashboard mode to "Both" in Settings to see everything at once.',
      },
      {
        q: 'I just installed MileClear — what should I do first?',
        a: 'Three things, in order. (1) Add your vehicle in Settings → Vehicles — we need fuel type and MPG to calculate fuel costs. (2) Add Home and Work as saved locations under Settings → Saved Locations. The app will then auto-detect trips between them. (3) Take your first drive. You should see a "Trip Active" Live Activity on the Lock Screen.',
      },
    ],
  },
  {
    title: 'Tax & HMRC',
    faqs: [
      {
        q: 'What is the Tax Readiness card?',
        a: 'Real-time estimate of what you’ll owe HMRC at the end of the current UK tax year, based on the trips and earnings you’ve recorded so far. The "Set aside" line tells you what to save each week to cover both income tax and Class 4 NI on your gig profits. The more accurate your earnings and trip data, the better the estimate.',
      },
      {
        q: 'What are the HMRC mileage rates?',
        a: 'For cars and vans you can claim 45p per mile for the first 10,000 business miles in a tax year, and 25p per mile after that. Motorbikes are 24p per mile flat rate. MileClear applies the correct rate to every business trip automatically and tracks exactly where you sit on the 10,000-mile threshold.',
      },
      {
        q: 'What is MTD ITSA — do I need to worry about it?',
        a: 'Making Tax Digital for Income Tax Self Assessment. From April 2026, sole traders earning over £50,000 a year must submit four quarterly returns to HMRC plus a year-end statement — no more single January 31 Self Assessment. MileClear Pro handles all four quarters automatically. Avatar menu → Work & Tax → MTD ITSA. Currently in sandbox mode while HMRC reviews our production accreditation.',
      },
      {
        q: 'I have a salaried job alongside my gig work — does MileClear handle that?',
        a: 'Yes. Settings → Work & Tax → enter what your employer has already deducted in PAYE this year (it’s on your most recent payslip, year-to-date tax line). Tax Readiness then shows what you still owe on top of PAYE, rather than the full gross liability. NI is still calculated separately on your gig profits because Class 4 NI is per-source.',
      },
      {
        q: 'Cash or accruals basis?',
        a: 'Cash basis (the UK default since April 2024 for most sole traders) counts invoice income when the money actually arrives in your account. Accruals counts it when you sent the invoice, regardless of payment. Unless your accountant has told you otherwise, leave it on cash — it matches how the money actually flows.',
      },
      {
        q: 'I pay an accountant. Can I factor that into my set-aside?',
        a: 'Settings → Work & Tax → Sole Trader → My Accountant. Enter their annual filing fee. We spread it across 52 weeks and add it to your weekly set-aside, so by filing season the cash is there for both the tax bill and the accountant’s invoice.',
      },
      {
        q: 'How do I export my mileage for my tax return?',
        a: 'Avatar menu → Tax Exports (Pro feature). You can export your mileage log as a PDF Self Assessment SA103, a CSV, or as a preview compatible with Xero / FreeAgent / QuickBooks (full accounting integrations are coming after MTD accreditation lands).',
      },
    ],
  },
  {
    title: 'Trips & tracking',
    faqs: [
      {
        q: 'How do I add a trip manually?',
        a: 'Dashboard → Start Trip → Manual. Enter the start and end address (or pick on the map), set the date, classify as Work or Personal, save. Manual trips use our routing engine for accurate distance — the same address pair always returns the same mileage, every time.',
      },
      {
        q: 'How does auto-classification work?',
        a: 'Tag the same A → B journey as Work three times consistently, and the fourth time MileClear suggests Work automatically. For auto-detected geofence trips, the Lock Screen confirmation push leads with the suggestion: "Work trip detected. Tap Yes, Work to confirm." Three one-tap action buttons (Yes Work / Personal / Not me) live on the Lock Screen. Auto-classify rules can also be driven by your Work Schedule under Pro.',
      },
      {
        q: 'A trip’s distance looks wrong. Can I fix it?',
        a: 'Open the trip → Recalculate distance. The button hits our routing engine on demand. For sparse-GPS trips, try Settings → Data Quality → Recheck suspicious trips — we’ll re-route any trip with low confidence in bulk.',
      },
      {
        q: 'What does the High / Medium / Low confidence badge mean?',
        a: 'Confidence level for each trip’s distance figure, based on GPS sample quality, breadcrumb density, route verification, and average-speed sanity. Tap any badge for the plain-English breakdown. High = bulletproof for HMRC defence. Low = worth a Recalculate before you rely on it.',
      },
      {
        q: 'What is trip merging?',
        a: 'If your journey gets split into multiple trips (for example, when you stop at a petrol station), you can merge them back together. Long-press a trip to enter selection mode, pick 2 to 20 trips, choose the classification, and merge. Merging is permanent — it can’t be undone.',
      },
      {
        q: 'How do saved locations and geofencing work?',
        a: 'Save locations like Home, Work, or Depot with a custom geofence radius. When you enter or leave a geofenced area, MileClear auto-starts or ends a trip and shows the Live Activity on your Lock Screen. Free users get 2 saved locations; Pro users get unlimited.',
      },
    ],
  },
  {
    title: 'Money & subscription',
    faqs: [
      {
        q: 'What’s included in the free plan?',
        a: 'Unlimited trip tracking with automatic drive detection, Work / Personal classification, the Tax Readiness card with real-time tax estimate, HMRC AMAP calculation, manual earnings + expenses, MOT and tax expiry reminders, all 18 milestone achievements, 1 vehicle, 2 saved locations, 3 invoices per calendar month. Free really is free — you keep your mileage data forever.',
      },
      {
        q: 'What does Pro add?',
        a: 'MileClear Pro is £4.99 a month or £44.99 a year. You get: HMRC quarterly Self Assessment submissions (MTD ITSA), HMRC SA103 PDF + CSV exports, CSV earnings import, Open Banking auto-import via TrueLayer, auto-classify rules driven by your Work Schedule, business insights (platform comparison, golden hours, P&L), Driving Analytics, accountant sharing (read-only dashboard for your accountant), Journey Map, Pickup Wait community insights, unlimited invoices, unlimited saved locations, unlimited vehicles.',
      },
      {
        q: 'Earnings vs invoices — what’s the difference?',
        a: 'Earnings are gig platform income (Uber, Deliveroo, Just Eat). They can be typed in manually, imported from a platform CSV (Pro), or auto-imported via Open Banking (Pro). Invoices are freelance or consultancy work you’ve billed clients for. Free tier covers 3 invoices per calendar month; Pro is unlimited.',
      },
      {
        q: 'How do I cancel my subscription?',
        a: 'If you subscribed via Apple, go to iOS Settings → your name → Subscriptions → MileClear → Cancel Subscription. If you subscribed via Stripe on the web, sign in to the dashboard → Settings → Subscription → Manage. You’ll keep Pro features until the end of your current billing period.',
      },
    ],
  },
  {
    title: 'Privacy & data',
    faqs: [
      {
        q: 'Is my location data safe?',
        a: 'Yes. GPS coordinates are stored locally on your device and only synced to our server when you choose. We use encrypted connections (TLS 1.2+), secure token storage (iOS Keychain), encrypted refresh tokens, and never sell your data. You can export every byte we hold about you, or delete your account permanently, from inside the app.',
      },
      {
        q: 'What diagnostic data does MileClear collect?',
        a: 'Diagnostic telemetry on startup, used only to debug drive-detection issues. This includes app version, GPS permission status, detection event logs (timestamps and event types only), and configuration settings. We do not send GPS coordinates or any personal location information in diagnostics. The data is tied to your account for debugging only and is never shared with third parties.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Avatar menu → Settings → Account → Delete Account. Enter your password to confirm. Deletion is immediate and permanent — it removes every trip, every earning, every invoice, and every other piece of data we hold about you, and cancels any active subscription. Cannot be undone.',
      },
    ],
  },
  {
    title: 'Troubleshooting',
    faqs: [
      {
        q: 'The Live Activity isn’t showing on my Lock Screen.',
        a: 'Two things to check. (1) iOS Settings → Notifications → MileClear → Live Activities — must be ON. (2) iOS Settings → MileClear → Live Activities — also ON. If both are on and you still don’t see one, restart the app once.',
      },
      {
        q: 'My trips aren’t appearing on the web dashboard.',
        a: 'Open Avatar menu → Sync Status. Pending trips upload as soon as you’re back online. If you see "failed" items, tap Retry. Trips are always saved locally first — they don’t get lost if sync is delayed.',
      },
      {
        q: 'I got logged out and ended up in a blank profile.',
        a: 'Known issue we fixed in 1.2.0. If it happens, log out of the blank profile and sign in again using the method you originally signed up with (email + password OR Apple ID — whichever you used first). You’ll be back in your real account with all your data intact.',
      },
      {
        q: 'Is GPS tracking going to kill my battery?',
        a: 'MileClear uses iOS’s significant-location-change API while you’re stationary, and only escalates to active GPS during a recording. Typical impact is 2-4% per 8-hour shift. If you notice more than that, check the Data Quality screen — your tracking permissions might be sub-optimal and we’ll show you the fix.',
      },
    ],
  },
];

// Flatten for the FAQPage schema (Google indexes the full set in one block).
const faqs = faqSections.flatMap((s) => s.faqs);

export default function SupportPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mailto = `mailto:support@mileclear.com?subject=Support Request from ${encodeURIComponent(name)}&body=${encodeURIComponent(`From: ${name} (${email})\n\n${message}`)}`;
    window.location.href = mailto;
    setSubmitted(true);
  };

  const supportFaqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <>
      <BreadcrumbsJsonLd crumbs={[{ name: 'Support', path: '/support' }]} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(supportFaqSchema) }}
      />
      <Navbar />
      <main className="support">
        <div className="container">
          {/* Header */}
          <div className="support__header">
            <span className="label">Help Centre</span>
            <h1 className="heading">MileClear Help Centre</h1>
            <p className="subtext">
              Find answers to common questions or get in touch with our team.
            </p>
          </div>

          {/* FAQ — grouped by section */}
          {faqSections.map((section) => (
            <section key={section.title} className="support__faq-section">
              <h2 className="support__faq-section-title">{section.title}</h2>
              <div className="support__faq-list">
                {section.faqs.map((faq, i) => (
                  <details key={`${section.title}-${i}`} className="support__faq">
                    <summary>{faq.q}</summary>
                    <p className="support__faq-answer">{faq.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <div className="divider" />

          {/* Contact */}
          <div style={{ paddingTop: 'clamp(3rem, 6vw, 4.5rem)' }}>
            <div style={{ textAlign: 'center', marginBottom: 'clamp(2rem, 4vw, 3rem)' }}>
              <span className="label">Get in Touch</span>
              <h2 className="heading">Contact Us</h2>
            </div>

            <div className="support__contact">
              <div className="support__contact-info">
                <p>
                  Can&apos;t find what you&apos;re looking for? Get in touch and we&apos;ll get back to you as soon as possible.
                </p>

                <div className="support__detail">
                  <div className="support__detail-icon">&#9993;</div>
                  <div>
                    <p className="support__detail-label">Email</p>
                    <p className="support__detail-value">
                      <a href="mailto:support@mileclear.com">support@mileclear.com</a>
                    </p>
                  </div>
                </div>

                <div className="support__detail">
                  <div className="support__detail-icon">&#9201;</div>
                  <div>
                    <p className="support__detail-label">Response Time</p>
                    <p className="support__detail-value">We aim to respond within 24 hours</p>
                  </div>
                </div>
              </div>

              {/* Contact Form */}
              <div className="support__form-card">
                {submitted ? (
                  <div className="support__success">
                    <p className="support__success-title">Message ready to send</p>
                    <p className="support__success-desc">
                      Your email client should have opened with your message. If not, email us directly at support@mileclear.com
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="support__form">
                    <div className="support__field">
                      <label>Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        className="support__input"
                        placeholder="Your name"
                      />
                    </div>
                    <div className="support__field">
                      <label>Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="support__input"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="support__field">
                      <label>Message</label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        rows={4}
                        className="support__textarea"
                        placeholder="Describe your issue or question..."
                      />
                    </div>
                    <button type="submit" className="support__submit">
                      Send Message
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Legal Links */}
          <div className="support__legal divider">
            <ul className="support__legal-links" style={{ paddingTop: '1.5rem' }}>
              <li><a href="/privacy" className="support__legal-link">Privacy Policy</a></li>
              <li><a href="/terms" className="support__legal-link">Terms of Service</a></li>
              <li><a href="/" className="support__legal-link">Back to MileClear</a></li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
