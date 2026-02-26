'use client';

import { useState } from 'react';

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
    <div className="min-h-screen bg-[#030712] text-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-b from-[#030712] to-[#0a0f1a] border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-4xl font-bold text-white mb-2">Support</h1>
          <p className="text-gray-400">Get help with MileClear</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Quick Help */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
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
                a: 'MileClear Pro (£4.99/month) adds HMRC-ready PDF and CSV exports, accounting software integration (Xero, FreeAgent, QuickBooks), and advanced analytics.',
              },
              {
                q: 'How do I cancel my subscription?',
                a: 'Go to Profile in the app and scroll to the Subscription section. Tap "Cancel subscription". You\'ll keep access to Pro features until the end of your current billing period.',
              },
              {
                q: 'Is my data safe?',
                a: 'Yes. Your location data is stored locally on your device and only synced when you choose. We use encrypted connections, secure token storage, and never sell your data. You can export or delete your data at any time under Profile.',
              },
              {
                q: 'How do I delete my account?',
                a: 'Go to Profile, scroll to the bottom, and tap "Delete Account". This permanently removes all your data from our servers. This action cannot be undone.',
              },
            ].map((faq, i) => (
              <details key={i} className="bg-gray-900 border border-gray-800 rounded-lg group">
                <summary className="px-6 py-4 cursor-pointer text-white font-medium hover:text-[#f5a623] transition-colors">
                  {faq.q}
                </summary>
                <p className="px-6 pb-4 text-gray-300 text-sm leading-relaxed">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">Contact Us</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <p className="text-gray-300 mb-6">
                Can't find what you're looking for? Get in touch and we'll get back to you as soon as possible.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-[#f5a623] text-lg">&#9993;</span>
                  <div>
                    <p className="text-white font-medium">Email</p>
                    <a href="mailto:support@mileclear.com" className="text-[#f5a623] hover:underline text-sm">
                      support@mileclear.com
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-[#f5a623] text-lg">&#9201;</span>
                  <div>
                    <p className="text-white font-medium">Response Time</p>
                    <p className="text-gray-400 text-sm">We aim to respond within 24 hours</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Form */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
              {submitted ? (
                <div className="text-center py-8">
                  <p className="text-[#f5a623] text-lg font-medium mb-2">Message ready to send</p>
                  <p className="text-gray-400 text-sm">Your email client should have opened with your message. If not, email us directly at support@mileclear.com</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-[#0a0f1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-[#f5a623] transition-colors"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-[#0a0f1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-[#f5a623] transition-colors"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Message</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      rows={4}
                      className="w-full px-3 py-2 bg-[#0a0f1a] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-[#f5a623] transition-colors resize-none"
                      placeholder="Describe your issue or question..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#f5a623] text-[#030712] font-semibold rounded-lg hover:bg-[#e6991a] transition-colors text-sm"
                  >
                    Send Message
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Legal Links */}
        <section className="border-t border-gray-800 pt-8">
          <div className="flex flex-wrap gap-6 text-sm">
            <a href="/privacy" className="text-[#f5a623] hover:underline">Privacy Policy</a>
            <a href="/terms" className="text-[#f5a623] hover:underline">Terms of Service</a>
            <a href="/" className="text-[#f5a623] hover:underline">Back to MileClear</a>
          </div>
          <p className="text-gray-500 text-xs mt-4">MileClear &copy; {new Date().getFullYear()}</p>
        </section>
      </div>
    </div>
  );
}
