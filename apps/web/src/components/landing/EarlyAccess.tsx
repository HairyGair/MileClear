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
  { value: "courier", label: "Courier" },
  { value: "other", label: "Other" },
];

const features = [
  "Auto trip recording - detects driving and logs trips in the background",
  "Live Activities on lock screen and Dynamic Island during trips",
  "HMRC tax deduction calculator (45p/25p rates, updated per tax year)",
  "Shift mode for gig workers - group trips, see scorecards, track platforms",
  "Fuel price finder - 8,300+ UK stations from government-mandated feeds",
  "Earnings tracking - manual, CSV import, or Open Banking",
  "Business insights - earnings/mile, platform comparison, golden hours, weekly P&L",
  "43 achievements, streaks, and personal driving records",
  "HMRC-ready PDF and CSV exports for Self Assessment",
  "Saved locations with geofencing - auto-classify trips near home, work, or depots",
  "Offline-first - trips saved locally, synced when online",
  "Full GDPR controls - export or delete your data any time",
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
        <img
          src="/branding/logo-120x120.png"
          alt="MileClear"
          className="ea__logo"
          width={56}
          height={56}
        />
        <p className="label">Available on the App Store</p>
        <h2 className="heading">Start tracking your miles today</h2>
        <p className="subtext">
          Free to download. Unlimited trip tracking, shift management, and HMRC
          deduction calculations. Upgrade to Pro for exports, Open Banking, and
          unlimited saved locations.
        </p>

        <Reveal delay="reveal-d1">
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="ea__appstore-link">
            <img
              src="/branding/app-store-badge.svg"
              alt="Download on the App Store"
              className="ea__appstore-badge"
              width={180}
              height={60}
            />
          </a>
        </Reveal>

        <Reveal delay="reveal-d2">
          <div className="ea__features">
            <p className="ea__features-label">Everything included:</p>
            <ul className="ea__features-list">
              {features.map((f) => (
                <li key={f} className="ea__features-item">
                  <svg className="ea__features-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay="reveal-d3">
          <div className="ea__notify">
            <p className="ea__notify-label">Not on iOS? Get notified when Android launches.</p>
            {status === "ok" ? (
              <div className="ea__ok">
                You&apos;re on the list! We&apos;ll let you know when MileClear is available on Android.
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
                <button type="submit" className="ea__btn" disabled={status === "loading"}>
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
