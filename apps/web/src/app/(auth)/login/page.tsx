"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, fetchProfile } from "../../../lib/auth";
import { setTokens } from "../../../lib/api";
import { safeRedirectPath } from "../../../lib/safeRedirect";
import { OAuthButtons, OAUTH_NEXT_KEY } from "../../../components/ui/OAuthButtons";
import { AuthShell, AuthError } from "../../../components/auth/AuthShell";
import { AuthField, AuthPasswordField } from "../../../components/auth/AuthField";

export default function LoginPage() {
  const router = useRouter();
  // Read from window.location rather than useSearchParams() - matches the
  // ?ref= handling on /register and avoids a Suspense boundary requirement
  // for a value only needed after mount anyway.
  const [next, setNext] = useState("/dashboard");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("next");
    setNext(safeRedirectPath(fromUrl) || "/dashboard");
  }, []);

  // Handle Apple Sign-In redirect (tokens in URL hash)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("apple_token=")) {
      const params = new URLSearchParams(hash.slice(1));
      const accessToken = params.get("apple_token");
      const refreshToken = params.get("apple_refresh");
      // Clear hash from URL
      window.history.replaceState(null, "", window.location.pathname);
      if (accessToken && refreshToken) {
        setTokens(accessToken, refreshToken);
        // The Apple redirect drops ?next, so it was parked in sessionStorage.
        let target = next;
        try {
          const parked = safeRedirectPath(window.sessionStorage.getItem(OAUTH_NEXT_KEY));
          if (parked) target = parked;
          window.sessionStorage.removeItem(OAUTH_NEXT_KEY);
        } catch {
          // fall back to the dashboard
        }
        fetchProfile()
          .then(() => router.push(target))
          .catch(() => setError("Apple sign-in failed"));
      }
    }
    // Handle Apple error
    const searchParams = new URLSearchParams(window.location.search);
    const appleError = searchParams.get("apple_error");
    if (appleError) {
      setError(appleError);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [router, next]);

  const registerHref = next === "/dashboard" ? "/register" : `/register?next=${encodeURIComponent(next)}`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      router.push(next);
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      lead={
        <>
          New to MileClear? <Link href={registerHref}>Create an account</Link>
        </>
      }
    >
      <AuthError message={error} />

      <OAuthButtons placement="top" onSuccess={() => router.push(next)} onError={(msg) => setError(msg)} />

      <form className="signin__form" onSubmit={handleSubmit}>
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
          aside={<Link href="/forgot-password">Forgot your password?</Link>}
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <button type="submit" className="signin__submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
