"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { AuthShell, AuthError } from "../../../components/auth/AuthShell";
import { AuthField, AuthPasswordField } from "../../../components/auth/AuthField";

type Step = "email" | "reset" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
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

  const startAgain = () => {
    setStep("email");
    setError("");
    setCode("");
    setNewPassword("");
  };

  if (step === "done") {
    return (
      <AuthShell title="Password changed" lead="You can sign in with your new password now.">
        <button type="button" className="signin__submit" onClick={() => router.push("/login")}>
          Sign in
        </button>
      </AuthShell>
    );
  }

  if (step === "reset") {
    return (
      <AuthShell
        title="Check your email"
        lead={
          <>
            We sent a 6-digit code to <strong>{email}</strong>.
          </>
        }
      >
        <AuthError message={error} />
        <form className="signin__form" onSubmit={handleReset}>
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
          <AuthPasswordField
            id="newPassword"
            label="New password"
            placeholder="At least 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <button type="submit" className="signin__submit" disabled={loading}>
            {loading ? "Changing..." : "Change password"}
          </button>
        </form>
        <p className="signin__fine">
          No code? Check your junk folder, or{" "}
          <button type="button" className="signin__link-btn signin__link-btn--inline" onClick={startAgain}>
            send it again
          </button>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      lead="Enter your email and we'll send you a 6-digit code to set a new one."
    >
      <AuthError message={error} />
      <form className="signin__form" onSubmit={handleSendCode}>
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
        <button type="submit" className="signin__submit" disabled={loading}>
          {loading ? "Sending..." : "Send code"}
        </button>
      </form>
      <p className="signin__fine">
        Remembered it? <Link href="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
}
