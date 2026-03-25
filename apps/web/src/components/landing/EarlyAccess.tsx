"use client";

import { useState, type FormEvent } from "react";
import Reveal from "./Reveal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";
const APP_STORE_URL = "https://apps.apple.com/app/mileclear/id6742500648";

const types = [
  { value: "", label: "What do you drive for? (optional)" },
  { value: "uber", label: "Uber / Uber Eats" },
  { value: "deliveroo", label: "Deliveroo" },
  { value: "just_eat", label: "Just Eat" },
  { value: "amazon_flex", label: "Amazon Flex" },
  { value: "courier", label: "Courier / logistics" },
  { value: "personal", label: "Personal driving" },
  { value: "other", label: "Other" },
];

const AppleIcon = () => (
  <svg width="20" height="24" viewBox="0 0 17 20" fill="currentColor" aria-hidden="true">
    <path d="M13.545 10.239c-.022-2.234 1.823-3.306 1.906-3.358-.037-.058-1.499-1.559-3.036-1.559-1.294-.131-2.53.764-3.186.764-.671 0-1.687-.748-2.781-.726A4.107 4.107 0 003.03 7.417c-1.48 2.565-.378 6.352 1.058 8.432.712 1.018 1.553 2.158 2.657 2.118 1.073-.044 1.475-.687 2.77-.687 1.28 0 1.651.687 2.767.663 1.15-.02 1.876-1.03 2.572-2.054.822-1.176 1.155-2.327 1.172-2.387-.025-.01-2.243-.86-2.268-3.414l-.213.151zm-2.12-6.273A3.68 3.68 0 0012.285.37a3.752 3.752 0 00-2.427 1.256 3.51 3.51 0 00-.88 2.544 3.107 3.107 0 002.447-1.204z"/>
  </svg>
);

const stats = [
  { value: "8,300+", label: "UK fuel stations" },
  { value: "43", label: "achievements" },
  { value: "45p", label: "per mile HMRC rate" },
];

export default function EarlyAccess() {
  const [email, setEmail] = useState("");
  const [driverType, setDriverType] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("loading");
    setErrMsg("");

    try {
      const res = await fetch(`${API_URL}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          driverType: driverType || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || "Something went wrong. Try again.");
      }
      setStatus("ok");
    } catch (err) {
      setStatus("err");
      setErrMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <section id="early-access" className="section ea">
      <div className="container ea__wrap">
        {/* Decorative orb */}
        <div className="ea__orb" aria-hidden="true" />

        <Reveal>
          <div className="ea__hero-block">
            <img
              src="/branding/logo-120x120.png"
              alt="MileClear"
              className="ea__logo"
              width={64}
              height={64}
            />
            <p className="label">Available on the App Store</p>
            <h2 className="heading ea__heading">
              Ready to claim what you&apos;re owed?
            </h2>
            <p className="subtext ea__subtext">
              Download MileClear for free. No credit card, no trial period, no trip limits.
              Just open it, drive, and watch your HMRC deduction grow.
            </p>
          </div>
        </Reveal>

        <Reveal delay="reveal-d1">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ea__download-btn"
          >
            <span className="ea__download-icon">
              <AppleIcon />
            </span>
            <span className="ea__download-text">
              <span className="ea__download-sub">Download on the</span>
              <span className="ea__download-main">App Store</span>
            </span>
          </a>
          <p className="ea__download-note">Free on iPhone and iPad</p>
        </Reveal>

        <Reveal delay="reveal-d2">
          <div className="ea__stats">
            {stats.map((s) => (
              <div key={s.label} className="ea__stat">
                <span className="ea__stat-value">{s.value}</span>
                <span className="ea__stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay="reveal-d3">
          <div className="ea__notify">
            <div className="ea__notify-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </div>
            <p className="ea__notify-label">Not on iPhone? Get notified when Android launches.</p>
            {status === "ok" ? (
              <div className="ea__ok">
                You&apos;re on the list. We&apos;ll email you when MileClear is available on Android.
              </div>
            ) : (
              <form className="ea__form" onSubmit={submit}>
                <div className="ea__row">
                  <input
                    type="email"
                    required
                    placeholder="Your email address"
                    className="ea__input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                  <select
                    className="ea__select"
                    value={driverType}
                    onChange={(e) => setDriverType(e.target.value)}
                  >
                    {types.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <button type="submit" className="ea__btn ea__btn--secondary" disabled={status === "loading"}>
                  {status === "loading" ? "Joining..." : "Notify me"}
                </button>
                {status === "err" && <p className="ea__err">{errMsg}</p>}
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
