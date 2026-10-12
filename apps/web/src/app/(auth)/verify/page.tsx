"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { safeRedirectPath } from "../../../lib/safeRedirect";
import { AuthShell, AuthError } from "../../../components/auth/AuthShell";
import { AuthField } from "../../../components/auth/AuthField";

export default function VerifyPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // Carried from /register?next=... (e.g. a Teams invite) so verifying
  // lands the user back where they were headed instead of always /dashboard.
  const [next, setNext] = useState("/dashboard");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("next");
    setNext(safeRedirectPath(fromUrl) || "/dashboard");
  }, []);

  // Send verification code on mount
  useEffect(() => {
    let cancelled = false;
    async function send() {
      setSending(true);
      try {
        await api.post("/auth/send-verification");
        if (!cancelled) setSent(true);
      } catch {
        // User may not be authenticated - they'll need to log in first
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
      router.push(next);
    } catch (err: any) {
      setError(err.message || "Invalid or expired code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Check your email"
      lead={
        sending
          ? "Sending your code..."
          : sent
          ? "We've sent a 6-digit code to your email. Enter it to confirm your address."
          : "Enter the 6-digit code from your email."
      }
    >
      <AuthError message={error} />

      <form className="signin__form" onSubmit={handleSubmit}>
        <AuthField
          id="code"
          label="Code"
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
          autoComplete="one-time-code"
          inputMode="numeric"
        />
        <button type="submit" className="signin__submit" disabled={loading || sending}>
          {loading ? "Checking..." : "Confirm email"}
        </button>
      </form>

      <p className="signin__fine">
        No code? Check your junk folder, or{" "}
        <button
          type="button"
          className="signin__link-btn signin__link-btn--inline"
          onClick={handleResend}
          disabled={sending}
        >
          {sending ? "sending..." : "send it again"}
        </button>
        .
      </p>
      <p className="signin__fine">
        <Link href={next}>Skip for now</Link>
      </p>
    </AuthShell>
  );
}
