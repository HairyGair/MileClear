'use client';

import { useState } from 'react';

export default function DeleteAccountForm() {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.mileclear.com';
      const trimmedNote = note.trim();
      const message = [
        'Account deletion request submitted via mileclear.com/delete-account',
        '',
        `Account email: ${email}`,
        '',
        trimmedNote ? `Note from user:\n${trimmedNote}` : 'Note from user: (none)',
      ].join('\n');

      const res = await fetch(`${apiUrl}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Account deletion request', email, message }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || 'Something went wrong. Please try again or email support@mileclear.com.');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again or email support@mileclear.com.');
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <div className="support__form-card">
        <div className="support__success" role="status">
          <p className="support__success-title">Request received</p>
          <p className="support__success-desc">
            We have your deletion request for <strong>{email}</strong>. We will action it within 30 days and
            send a confirmation to that address once it is done. If the request did not come from the email
            address on the account, we will reply asking you to confirm from that address before we proceed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="support__form-card">
      <form onSubmit={handleSubmit} className="support__form">
        <div className="support__field">
          <label htmlFor="delete-email">Account email address</label>
          <input
            id="delete-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="support__input"
            placeholder="The email you signed up with"
          />
        </div>
        <div className="support__field">
          <label htmlFor="delete-note">Note (optional)</label>
          <textarea
            id="delete-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            className="support__textarea"
            placeholder="Anything we should know, for example if you also want your subscription cancelled"
          />
        </div>
        {error && (
          <p className="support__form-error" role="alert" style={{ color: '#ef4444', fontSize: '0.875rem', margin: '0 0 0.25rem' }}>
            {error}
          </p>
        )}
        <button type="submit" className="support__submit" disabled={sending}>
          {sending ? 'Sending...' : 'Request account deletion'}
        </button>
        <p className="legal__text legal__text--small" style={{ margin: 0 }}>
          By sending this you are asking us to permanently delete the MileClear account registered to this
          email address. This cannot be undone.
        </p>
      </form>
    </div>
  );
}
