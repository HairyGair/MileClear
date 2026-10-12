"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, fetchProfile } from "../../../lib/auth";
import { setTokens } from "../../../lib/api";
import { safeRedirectPath } from "../../../lib/safeRedirect";
import { OAuthButtons, OAUTH_NEXT_KEY } from "../../../components/ui/OAuthButtons";

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
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="signin">
      <aside className="signin__panel" aria-label="MileClear">
        <svg className="signin__map" viewBox="0 0 640 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="signin-shade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0.35" stopColor="#070d1a" stopOpacity="0" />
              <stop offset="1" stopColor="#070d1a" stopOpacity="0.95" />
            </linearGradient>
          </defs>
          <g stroke="rgba(255,255,255,0.06)" strokeWidth="14" fill="none" strokeLinecap="round">
            <path d="M-20 160 L660 120" />
            <path d="M-20 420 C200 400 420 460 660 430" />
            <path d="M-20 660 L660 620" />
            <path d="M120 -20 L160 820" />
            <path d="M340 -20 C320 260 380 520 360 820" />
            <path d="M540 -20 L510 820" />
          </g>
          <path d="M120 470 L128 300 C230 292 300 306 352 312 L340 190 L520 110" stroke="rgba(245,166,35,0.22)" strokeWidth="22" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M120 470 L128 300 C230 292 300 306 352 312 L340 190 L520 110" stroke="#f5a623" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="120" cy="470" r="12" fill="#070d1a" stroke="#10b981" strokeWidth="5" />
          <circle cx="520" cy="110" r="14" fill="#f5a623" />
          <circle cx="520" cy="110" r="5" fill="#070d1a" />
          <rect width="640" height="800" fill="url(#signin-shade)" />
        </svg>
        <Link href="/" className="signin__brand">
          <img src="/branding/logo-120x120.png" alt="" />
          <span style={{ color: "inherit" }}>
            Mile<span>Clear</span>
          </span>
        </Link>
        <div className="signin__pitch">
          <h2>
            Every mile,
            <br />
            counted.
          </h2>
          <p>Your trips, earnings and mileage claim, recorded on your phone and ready here on the web.</p>
        </div>
      </aside>

      <main className="signin__main" id="main-content" tabIndex={-1}>
        <div className="signin__form-wrap">
          <h1 className="signin__title">Sign in</h1>
          <p className="signin__lead">
            New to MileClear? <Link href={registerHref}>Create an account</Link>
          </p>

          {error && (
            <div className="signin__error" role="alert">
              {error}
            </div>
          )}

          <OAuthButtons placement="top" onSuccess={() => router.push(next)} onError={(msg) => setError(msg)} />

          <form className="signin__form" onSubmit={handleSubmit}>
            <div className="signin__field">
              <label className="signin__label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="signin__input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="signin__field">
              <div className="signin__label-row">
                <label className="signin__label" htmlFor="password">
                  Password
                </label>
                <Link href="/forgot-password">Forgot your password?</Link>
              </div>
              <div className="signin__input-wrap">
                <input
                  id="password"
                  className="signin__input signin__input--password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="signin__eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M1 1l22 22" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <button type="submit" className="signin__submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
