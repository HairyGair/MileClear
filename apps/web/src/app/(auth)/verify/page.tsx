"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

export default function VerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Send verification code on mount
  useEffect(() => {
    let cancelled = false;
    async function send() {
      setSending(true);
      try {
        await api.post("/auth/send-verification");
        if (!cancelled) setSent(true);
      } catch {
        // User may not be authenticated — they'll need to log in first
        if (!cancelled) setError("Please log in first to verify your email.");
      } finally {
        if (!cancelled) setSending(false);
      }
    }
    send();
    return () => { cancelled = true; };
  }, []);

  const handleResend = async () => {
    setError("");
    setSending(true);
    try {
      await api.post("/auth/send-verification");
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send code");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (code.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/verify", { code });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid or expired code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <Link href="/" className="auth-card__logo">
          <img
            src="/branding/logo-120x120.png"
            alt=""
            className="auth-card__logo-icon"
          />
          <span className="auth-card__logo-text">
            Mile<span>Clear</span>
          </span>
        </Link>

        <h1 className="auth-card__heading">Verify your email</h1>
        <p className="auth-card__sub">
          {sending
            ? "Sending verification code..."
            : sent
            ? "We've sent a 6-digit code to your email"
            : "Enter the code sent to your email"}
        </p>

        {error && <div className="alert alert--error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            id="code"
            type="text"
            label="Verification code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
            autoComplete="one-time-code"
            inputMode="numeric"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="auth-form__submit"
            disabled={loading || sending}
            style={{ width: "100%" }}
          >
            {loading ? "Verifying..." : "Verify email"}
          </Button>
        </form>

        <p className="auth-card__footer">
          Didn&apos;t receive a code?{" "}
          <button
            type="button"
            className="auth-card__inline-link"
            onClick={handleResend}
            disabled={sending}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            {sending ? "Sending..." : "Resend code"}
          </button>
        </p>

        <p className="auth-card__footer">
          <Link href="/dashboard">Skip for now</Link>
        </p>
      </div>
    </div>
  );
}
