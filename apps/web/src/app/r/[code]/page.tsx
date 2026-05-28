"use client";

import { use, useEffect } from "react";
import Link from "next/link";

const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6759671005";

/**
 * Referral landing page (mileclear.com/r/CODE). A friend taps an invite link;
 * we stash the code in localStorage (so the web register page pre-fills it)
 * and point them at the App Store or web sign-up. The code is also passed as
 * ?ref= on the register link as a belt-and-braces for private-mode browsers
 * where localStorage may be unavailable.
 */
export default function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = (rawCode || "").trim().toUpperCase().slice(0, 16);

  useEffect(() => {
    try {
      if (code) window.localStorage.setItem("mc_referral_code", code);
    } catch {
      // private mode / storage disabled — the ?ref= param still carries it
    }
  }, [code]);

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <Link href="/" className="auth-card__logo">
          <img src="/branding/logo-120x120.png" alt="" className="auth-card__logo-icon" />
          <span className="auth-card__logo-text">
            Mile<span>Clear</span>
          </span>
        </Link>

        <h1 className="auth-card__heading">A friend invited you to MileClear</h1>
        <p className="auth-card__sub">
          Track every mile and claim your tax back automatically. Unlimited tracking,
          free forever - no drive caps.
        </p>

        <div
          style={{
            margin: "20px 0",
            padding: "16px",
            borderRadius: 14,
            border: "1px dashed rgba(245,166,35,0.4)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: 1, color: "#8494a7", marginBottom: 6 }}>
            YOUR REFERRAL CODE
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, color: "#f0f2f5" }}>
            {code || "—"}
          </div>
          <div style={{ fontSize: 13, color: "#8494a7", marginTop: 8 }}>
            It&apos;s saved - just sign up and it&apos;ll be applied automatically.
          </div>
        </div>

        <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 12 }}>
          <button className="btn btn--primary btn--lg" style={{ width: "100%" }}>
            Download on the App Store
          </button>
        </a>

        <Link href={`/register?ref=${encodeURIComponent(code)}`} style={{ display: "block" }}>
          <button className="btn btn--secondary btn--lg" style={{ width: "100%" }}>
            Or sign up on the web
          </button>
        </Link>

        <p className="auth-card__footer" style={{ marginTop: 20 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
