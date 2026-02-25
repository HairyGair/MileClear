"use client";

import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, fetchProfile } from "../../../lib/auth";
import { setTokens } from "../../../lib/api";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { OAuthButtons } from "../../../components/ui/OAuthButtons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        fetchProfile()
          .then(() => router.push("/dashboard"))
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
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid email or password");
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

        <h1 className="auth-card__heading">Welcome back</h1>
        <p className="auth-card__sub">Sign in to your dashboard</p>

        {error && <div className="alert alert--error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <Input
            id="email"
            type="email"
            label="Email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <Input
            id="password"
            type="password"
            label="Password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="auth-form__submit"
            disabled={loading}
            style={{ width: "100%" }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <OAuthButtons
          onSuccess={() => router.push("/dashboard")}
          onError={(msg) => setError(msg)}
        />

        <p className="auth-card__footer">
          Don&apos;t have an account? <Link href="/register">Create one</Link>
        </p>
      </div>
    </div>
  );
}
