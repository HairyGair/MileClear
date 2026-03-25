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
          <div className="ea__download-row">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ea__appstore-link"
            >
              <img
                src="/branding/app-store-badge.svg"
                alt="Download on the App Store"
                className="ea__appstore-badge"
              />
            </a>
            <div className="ea__qr">
              <img
                src="/branding/qr-code.png"
                alt="Scan to download MileClear"
                className="ea__qr-img"
                width={100}
                height={100}
              />
              <span className="ea__qr-label">Scan to download</span>
            </div>
          </div>
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
