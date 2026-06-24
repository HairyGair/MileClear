"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6759671005";

/**
 * Referral landing page (mileclear.com/r/CODE). A friend taps an invite link.
 *
 * Two paths:
 *  - WEB sign-up: the code is stashed in localStorage + passed as ?ref=, and the
 *    web /register page reads both and applies it automatically. Seamless.
 *  - APP STORE install: there's no automatic way to carry the code through an
 *    App Store install on iOS (that needs deferred deep linking — a follow-up).
 *    So we COPY the code to the clipboard and tell the friend to paste it into
 *    the "invite code" box at sign-up. iOS shares the clipboard between Safari
 *    and the app, so the code is right there waiting — one paste.
 *
 * The previous version claimed the App Store path applied "automatically" — it
 * didn't, which is why the referral funnel had zero conversions.
 */
export default function ReferralLandingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = use(params);
  const code = (rawCode || "").trim().toUpperCase().slice(0, 16);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      if (code) window.localStorage.setItem("mc_referral_code", code);
    } catch {
      // private mode — the ?ref= param still carries it to the web register
    }
    // Best-effort auto-copy so the code is already on the clipboard when they
    // reach the app sign-up. The button below is the reliable fallback.
    if (code && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => setCopied(true)).catch(() => {});
    }
  }, [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // ignore — the code is shown on screen to type manually
    }
  };

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
          free forever - no drive caps. Sign up with this code and you both get a free
          month of Pro.
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
            YOUR INVITE CODE
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, color: "#f0f2f5" }}>
            {code || "—"}
          </div>
          <button
            type="button"
            onClick={copy}
            className="btn btn--secondary"
            style={{ marginTop: 12 }}
          >
            {copied ? "✓ Code copied" : "Copy code"}
          </button>
        </div>

        <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginBottom: 8 }}>
          <button className="btn btn--primary btn--lg" style={{ width: "100%" }}>
            Get MileClear on the App Store
          </button>
        </a>
        <p style={{ fontSize: 13, color: "#8494a7", textAlign: "center", margin: "0 0 16px" }}>
          When you open the app, sign up and paste your code{copied ? " (it's on your clipboard)" : ` (${code || "above"})`} in the <strong>invite code</strong> box.
        </p>

        <Link href={`/register?ref=${encodeURIComponent(code)}`} style={{ display: "block" }}>
          <button className="btn btn--secondary btn--lg" style={{ width: "100%" }}>
            Or sign up on the web - code applied for you
          </button>
        </Link>

        <p className="auth-card__footer" style={{ marginTop: 20 }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
