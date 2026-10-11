'use client';

import { useState } from 'react';
import Navbar from '@/components/landing/Navbar';
import Footer from '@/components/landing/Footer';
import BreadcrumbsJsonLd from '@/components/seo/BreadcrumbsJsonLd';
import './support.css';
import { getHelpEntry } from '@mileclear/shared';

// The FAQ is a chosen set of the app's own help answers, read from
// @mileclear/shared (data/help.ts): the same words the app's Help and
// how-tos screen and EmSee use, so this page can't drift from the app. Each
// `q` is mirrored in the FAQPage schema below.
const FAQ_IDS: { title: string; ids: string[] }[] = [
  { title: 'Getting started', ids: ['what-it-does', 'first-steps', 'automatic-trips', 'work-personal-mode', 'you-drive-for'] },
  { title: 'Tax and claims', ids: ['rates', 'claim-meaning', 'tax-tab', 'sa-wizard', 'exports', 'accountant', 'other-income', 'employee', 'mtd', 'hmrc-approved'] },
  { title: 'Trips', ids: ['missing-trip', 'add-past-trip', 'start-trip', 'pause-recording', 'merge-trips', 'wrong-distance', 'saved-places'] },
  { title: 'Money and subscription', ids: ['free-vs-pro', 'price', 'invoices', 'cancel', 'restore'] },
  { title: 'Privacy and data', ids: ['privacy', 'my-data', 'delete-account'] },
  { title: 'Troubleshooting', ids: ['live-activity', 'web-missing', 'sign-in', 'battery', 'permissions'] },
];

const faqSections = FAQ_IDS.map(({ title, ids }) => ({
  title,
  faqs: ids.map((id) => {
    const e = getHelpEntry(id);
    if (!e) throw new Error(`support page: no help answer "${id}"`);
    return { q: e.q, a: e.android ? `${e.a}\n\nOn Android: ${e.android}` : e.a };
  }),
}));

// Flatten for the FAQPage schema (Google indexes the full set in one block).
const faqs = faqSections.flatMap((s) => s.faqs);

export default function SupportPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.mileclear.com';
      const res = await fetch(`${apiUrl}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || "Something went wrong. Please email support@mileclear.com directly."
        );
      }
      setSubmitted(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't send your message. Please email support@mileclear.com directly."
      );
    } finally {
      setSending(false);
    }
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

          {/* FAQ - grouped by section */}
          {faqSections.map((section) => (
            <section key={section.title} className="support__faq-section">
              <h2 className="support__faq-section-title">{section.title}</h2>
              <div className="support__faq-list">
                {section.faqs.map((faq, i) => (
                  <details key={`${section.title}-${i}`} className="support__faq">
                    <summary>{faq.q}</summary>
                    <p className="support__faq-answer" style={{ whiteSpace: 'pre-line' }}>{faq.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <div className="divider" />

          {/* Contact */}
          <div id="contact" style={{ paddingTop: 'clamp(3rem, 6vw, 4.5rem)' }}>
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
                    <p className="support__success-title">Message sent</p>
                    <p className="support__success-desc">
                      Thanks for getting in touch - we&apos;ve got your message and aim to reply within 24 hours.
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
                    {error && (
                      <p className="support__form-error" role="alert" style={{ color: '#ef4444', fontSize: '0.875rem', margin: '0 0 0.25rem' }}>
                        {error}
                      </p>
                    )}
                    <button type="submit" className="support__submit" disabled={sending}>
                      {sending ? 'Sending...' : 'Send Message'}
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
