"use client";

import { useState } from "react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import "../donate.css";

// Client Component because of the form + Stripe redirect. SEO is light
// — marketing surface is in the body copy, not OG tags.

const PRESETS: { pence: number; label: string }[] = [
  { pence: 300, label: "£3" },
  { pence: 500, label: "£5" },
  { pence: 1000, label: "£10" },
  { pence: 2000, label: "£20" },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.mileclear.com";

export default function DonatePage() {
  const [selectedPence, setSelectedPence] = useState<number | "custom">(500);
  const [customPounds, setCustomPounds] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalPence = selectedPence === "custom"
    ? Math.round((parseFloat(customPounds) || 0) * 100)
    : selectedPence;
  const valid = finalPence >= 100 && finalPence <= 100_000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/donations/checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountPence: finalPence,
          name: name.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error?.message ?? body?.error ?? "Couldn't start checkout. Try again.";
        throw new Error(typeof msg === "string" ? msg : "Couldn't start checkout. Try again.");
      }
      const { data } = await res.json();
      if (!data?.url) throw new Error("Checkout URL missing — try again.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="donate">
        <header className="donate__header">
          <h1 className="donate__title">Buy MileClear a coffee</h1>
          <p className="donate__lede">
            MileClear stays free for everyone — mileage tracking, tax calc, HMRC
            categories, all of it. If the app's saved you time or money and you
            want to chip in towards keeping it going, here's the spot.
          </p>
        </header>

        <form className="donate__form" onSubmit={handleSubmit}>
          <label className="donate__label">Amount</label>
          <div className="donate__amounts">
            {PRESETS.map((p) => (
              <button
                key={p.pence}
                type="button"
                className={`donate__amount-btn ${selectedPence === p.pence ? "donate__amount-btn--active" : ""}`}
                onClick={() => setSelectedPence(p.pence)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={`donate__amount-btn ${selectedPence === "custom" ? "donate__amount-btn--active" : ""}`}
              onClick={() => setSelectedPence("custom")}
            >
              Custom
            </button>
          </div>

          {selectedPence === "custom" && (
            <div className="donate__custom-wrap">
              <span className="donate__custom-prefix">£</span>
              <input
                type="number"
                inputMode="decimal"
                className="donate__custom-input"
                placeholder="0.00"
                value={customPounds}
                onChange={(e) => setCustomPounds(e.target.value)}
                min="1"
                max="1000"
                step="0.01"
                autoFocus
              />
            </div>
          )}

          <label className="donate__label" htmlFor="donor-name">Name (optional, for the thank-you message)</label>
          <input
            id="donor-name"
            type="text"
            className="donate__name-input"
            placeholder="Your name or driver tag"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
          />

          {error && <p className="donate__error">{error}</p>}

          <button
            type="submit"
            className="donate__submit"
            disabled={!valid || loading}
          >
            {loading ? "Redirecting to Stripe…" : `Continue to secure checkout${valid ? ` · £${(finalPence / 100).toFixed(2)}` : ""}`}
          </button>
        </form>

        <section className="donate__notes">
          <h2 className="donate__notes-title">A few honest notes</h2>
          <ul className="donate__notes-list">
            <li>
              <strong>MileClear is not a registered charity.</strong> This is a
              voluntary contribution, not a tax-deductible donation. Treat it
              like buying me a coffee, not a gift-aided donation.
            </li>
            <li>
              <strong>No goods or services exchanged.</strong> Your contribution
              doesn't unlock anything in the app or change how MileClear treats
              you. The free tier stays the free tier regardless.
            </li>
            <li>
              <strong>Want ongoing access to Pro features?</strong> You're looking
              for the <a href="https://apps.apple.com/app/mileclear/id6742044832" className="donate__inline-link">subscription</a>{" "}
              instead — £4.99/month or £44.99/year unlocks HMRC quarterly submissions,
              unlimited invoices, business insights, and the rest.
            </li>
            <li>
              <strong>Payments are processed by Stripe.</strong> MileClear never
              sees your card details. UK card processing fees apply (typically
              ~£0.20 + 1.5% per transaction).
            </li>
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
