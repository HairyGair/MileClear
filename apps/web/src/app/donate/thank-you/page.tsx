"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import "../../donate.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.mileclear.com";

interface SessionData {
  status: string;
  amountPence: number;
  donorName: string | null;
}

// Next.js 15 requires useSearchParams() callers to sit inside a Suspense
// boundary so the page can stream the surrounding shell while the query
// string resolves. Split: ThankYouPage is the boundary; ThankYouContent
// reads the params.
export default function ThankYouPage() {
  return (
    <>
      <Navbar />
      <main className="thank-you">
        <Suspense
          fallback={<p className="thank-you__loading">Confirming your payment…</p>}
        >
          <ThankYouContent />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

function ThankYouContent() {
  const params = useSearchParams();
  const sessionId = params?.get("session_id") ?? null;
  const [session, setSession] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing session id. If you completed a payment, drop us an email at support@mileclear.com.");
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/donations/session/${sessionId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Couldn't verify the payment");
        return res.json();
      })
      .then((body) => {
        setSession(body.data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return <p className="thank-you__loading">Confirming your payment…</p>;
  }

  if (error) {
    return (
      <div className="thank-you__card thank-you__card--error">
        <h1 className="thank-you__title">Hmm, we can't find that one</h1>
        <p>{error}</p>
        <Link href="/donate" className="thank-you__cta">Back to donate</Link>
      </div>
    );
  }

  if (session && session.status === "paid") {
    return (
      <div className="thank-you__card">
        <div className="thank-you__sparkle" aria-hidden>✨</div>
        <h1 className="thank-you__title">
          Thanks{session.donorName ? `, ${session.donorName}` : ""}!
        </h1>
        <p className="thank-you__amount">
          £{(session.amountPence / 100).toFixed(2)} received.
        </p>
        <p className="thank-you__body">
          Genuinely - it makes a difference. MileClear gets a few hours more
          of development per donation. The next feature you wish existed has
          a slightly better chance of existing.
        </p>
        <p className="thank-you__small">
          Your receipt's been emailed by Stripe. No further action needed.
        </p>
        <Link href="/" className="thank-you__cta">Back to mileclear.com</Link>
      </div>
    );
  }

  return (
    <div className="thank-you__card thank-you__card--error">
      <h1 className="thank-you__title">Payment didn't complete</h1>
      <p>Status: {session?.status ?? "unknown"}. No charge has been made. Try again any time.</p>
      <Link href="/donate" className="thank-you__cta">Try again</Link>
    </div>
  );
}
