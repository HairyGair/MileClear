'use client';

import { useState } from 'react';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import './support.css';

const faqs = [
  {
    q: 'How does automatic mileage tracking work?',
    a: 'MileClear uses your phone\'s GPS to track your journeys in the background. Start a shift to begin tracking, or enable drive detection to automatically recognise when you\'re driving. Your location data stays on your device until you choose to sync.',
  },
  {
    q: 'How do I switch between Work and Personal mode?',
    a: 'Tap the mode toggle at the top of the Dashboard. Work mode tracks business mileage for tax purposes, while Personal mode lets you monitor your everyday driving and set personal goals.',
  },
  {
    q: 'What are the HMRC mileage rates?',
    a: 'For cars and vans, you can claim 45p per mile for the first 10,000 business miles in a tax year, and 25p per mile after that. Motorbikes are 24p per mile flat rate. MileClear calculates this automatically for you.',
  },
  {
    q: 'How do I export my mileage for my tax return?',
    a: 'Go to Tax Exports in the app (Pro feature). You can export your mileage log as a PDF or CSV, ready for your self-assessment tax return. Exports are also compatible with Xero, FreeAgent, and QuickBooks.',
  },
  {
    q: 'What\'s included in the free plan?',
    a: 'Free includes unlimited trip tracking, automatic drive detection, business/personal trip classification, fuel price comparison, earnings tracking by platform, achievements, and weekly mileage summaries.',
  },
  {
    q: 'What does Pro include?',
    a: 'MileClear Pro (\u00a34.99/month) adds HMRC-ready PDF and CSV exports, accounting software integration (Xero, FreeAgent, QuickBooks), and advanced analytics.',
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'Go to Profile in the app and scroll to the Subscription section. Tap "Cancel subscription". You\'ll keep access to Pro features until the end of your current billing period.',
  },
  {
    q: 'What is trip merging?',
    a: 'If your journey gets split into multiple trips (for example, if you stop at a petrol station or get stuck in traffic), you can merge them back together. Long-press a trip to enter selection mode, pick 2 to 20 trips, and merge them into one. You\'ll choose the classification (business or personal) and optionally a platform. Merging is permanent — it can\'t be undone.',
  },
  {
    q: 'What are Smart Alerts?',
    a: 'Smart Alerts appear at the top of your dashboard with personalised insights based on your driving data. They might remind you about unclassified trips, celebrate a streak, or let you know you\'re approaching the HMRC 10,000-mile threshold. You can dismiss any alert and it won\'t return for 24 hours.',
  },
  {
    q: 'What does Driving Analytics show me?',
    a: 'The Analytics screen shows six insights computed from your existing data: a weekly report with business/personal split, your most frequent routes, the best shift length for earnings (work mode), fuel cost per mile by vehicle, which days of the week you earn most, and commute timing between your saved locations.',
  },
  {
    q: 'How does route intelligence work?',
    a: 'MileClear groups your trips by start and end location (within about 500 metres). If you regularly drive the same route, it shows you how many times you\'ve done it, your average and fastest journey times, and which days you drive it most. No extra tracking is needed — it uses trips you\'ve already logged.',
  },
  {
    q: 'How do saved locations and geofencing work?',
    a: 'You can save locations like Home, Work, or Depot with a custom geofence radius. When you enter or leave a geofenced area, MileClear can automatically suggest starting or ending a trip. Free users get 2 saved locations; Pro users get unlimited.',
  },
  {
    q: 'How does Bluetooth auto-trip detection work?',
    a: 'If you add your car\'s Bluetooth name in vehicle settings, MileClear can detect when you connect to your car and prompt you to start tracking. It only checks for the specific device name you configured — it doesn\'t scan for or connect to other Bluetooth devices.',
  },
  {
    q: 'What notifications does MileClear send?',
    a: 'MileClear can send weekly driving summaries, streak reminders (if your tracking streak is at risk), subscription expiry alerts, and tax deadline reminders. You can control which notifications you receive in the app\'s notification settings under Profile.',
  },
  {
    q: 'What\'s the difference between the weekly report and the daily recap?',
    a: 'The daily recap shows today\'s driving stats (miles, trips, deduction). The weekly report in Driving Analytics is more comprehensive — it compares your business and personal driving side by side, shows percentage changes from the previous week, and highlights any achievements you earned.',
  },
  {
    q: 'Is my data safe?',
    a: 'Yes. Your location data is stored locally on your device and only synced when you choose. We use encrypted connections, secure token storage, and never sell your data. You can export or delete your data at any time under Profile.',
  },
  {
    q: 'How do I delete my account?',
    a: 'Go to Profile, scroll to the bottom, and tap "Delete Account". This permanently removes all your data from our servers. This action cannot be undone.',
  },
];

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

  return (
    <>
      <Navbar />
      <main className="support">
        <div className="container">
          {/* Header */}
          <div className="support__header">
            <span className="label">Help Centre</span>
            <h1 className="heading">Support</h1>
            <p className="subtext">
              Find answers to common questions or get in touch with our team.
            </p>
          </div>

          {/* FAQ */}
          <div className="support__faq-list">
            {faqs.map((faq, i) => (
              <details key={i} className="support__faq">
                <summary>{faq.q}</summary>
                <p className="support__faq-answer">{faq.a}</p>
              </details>
            ))}
          </div>

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
