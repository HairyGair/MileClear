"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register } from "../../../lib/auth";
import { safeRedirectPath } from "../../../lib/safeRedirect";
import { AuthShell, AuthError } from "../../../components/auth/AuthShell";
import { AuthField, AuthPasswordField } from "../../../components/auth/AuthField";
import { OAuthButtons } from "../../../components/ui/OAuthButtons";
import StoreButtons from "../../../components/StoreButtons";

export default function RegisterPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [showReferral, setShowReferral] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Where to land after email verification - e.g. a Teams invite link.
  // Carried through register -> /verify -> next so an invitee never has to
  // re-open the email link.
  const [next, setNext] = useState<string | null>(null);

  // Pre-fill the referral code from a ?ref= param or the value the /r/[code]
  // landing page stashed in localStorage when the friend arrived via a link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("ref");
    const stored = (() => {
      try {
        return window.localStorage.getItem("mc_referral_code");
      } catch {
        return null;
      }
    })();
    const code = (fromUrl || stored || "").trim().toUpperCase();
    if (code) {
      setReferralCode(code);
      setShowReferral(true);
    }
    setNext(safeRedirectPath(params.get("next")));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      await register(
        email,
        password,
        displayName || undefined,
        true,
        referralCode.trim().toUpperCase() || undefined
      );
      try {
        window.localStorage.removeItem("mc_referral_code");
      } catch {
        // ignore
      }
      router.push(next ? `/verify?next=${encodeURIComponent(next)}` : "/verify");
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <AuthShell
      title="Create your account"
      lead={
        <>
          Already have an account? <Link href={loginHref}>Sign in</Link>
        </>
      }
    >
      <AuthError message={error} />

      <OAuthButtons
        placement="top"
        intent="signup"
        onSuccess={() => router.push(next || "/dashboard")}
        onError={(msg) => setError(msg)}
      />

      <form className="signin__form" onSubmit={handleSubmit}>
        <AuthField
          id="displayName"
          label="Your name"
          placeholder="What should we call you?"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="given-name"
        />
        <AuthField
          id="email"
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <AuthPasswordField
          id="password"
          label="Password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
        />
        {showReferral ? (
          <AuthField
            id="referralCode"
            label="Referral code"
            placeholder="From a friend"
            value={referralCode}
            onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
            maxLength={16}
            autoComplete="off"
          />
        ) : (
          <button type="button" className="signin__link-btn" onClick={() => setShowReferral(true)}>
            Got a referral code?
          </button>
        )}
        <button type="submit" className="signin__submit" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </button>
        <p className="signin__fine">
          By creating an account you agree to our{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Privacy Policy
          </a>
          .
        </p>
      </form>

      {/* Four people in ten days signed up here, added a vehicle and waited
          for trips that could never arrive, because the tracker is the app
          and this is the dashboard. One of them asked us to delete the
          account. Say it before they wait. */}
      <div className="signin__app">
        <p>
          Trips are recorded by the MileClear app. This account is where you see them on the web, so get the app on
          the phone you drive with.
        </p>
        <StoreButtons size="sm" align="start" />
      </div>
    </AuthShell>
  );
}
