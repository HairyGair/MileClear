"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

type Step = "email" | "reset" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.post("/auth/forgot-password", { email });
      setStep("reset");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", {
        email,
        code,
        newPassword,
      });
      setStep("done");
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

        {step === "email" && (
          <>
            <h1 className="auth-card__heading">Reset your password</h1>
            <p className="auth-card__sub">
              Enter your email and we&apos;ll send you a 6-digit code
            </p>

            {error && <div className="alert alert--error">{error}</div>}

            <form className="auth-form" onSubmit={handleSendCode}>
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
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="auth-form__submit"
                disabled={loading}
                style={{ width: "100%" }}
              >
                {loading ? "Sending..." : "Send reset code"}
              </Button>
            </form>
          </>
        )}

        {step === "reset" && (
          <>
            <h1 className="auth-card__heading">Check your email</h1>
            <p className="auth-card__sub">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>

            {error && <div className="alert alert--error">{error}</div>}

            <form className="auth-form" onSubmit={handleReset}>
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
              <Input
                id="newPassword"
                type="password"
                label="New password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
              <Input
                id="confirmPassword"
                type="password"
                label="Confirm new password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="auth-form__submit"
                disabled={loading}
                style={{ width: "100%" }}
              >
                {loading ? "Resetting..." : "Reset password"}
              </Button>
            </form>

            <p className="auth-card__footer">
              Didn&apos;t receive a code?{" "}
              <button
                type="button"
                className="auth-card__inline-link"
                onClick={() => {
                  setStep("email");
                  setError("");
                  setCode("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                Try again
              </button>
            </p>
          </>
        )}

        {step === "done" && (
          <>
            <h1 className="auth-card__heading">Password reset</h1>
            <p className="auth-card__sub">
              Your password has been updated. You can now sign in with your new
              password.
            </p>

            <Button
              variant="primary"
              size="lg"
              style={{ width: "100%", marginTop: "1rem" }}
              onClick={() => router.push("/login")}
            >
              Sign in
            </Button>
          </>
        )}

        {step !== "done" && (
          <p className="auth-card__footer">
            Remember your password? <Link href="/login">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
