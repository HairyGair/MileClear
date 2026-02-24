"use client";

import { useState, type FormEvent } from "react";
import Reveal from "./Reveal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

const types = [
  { value: "", label: "What do you drive for? (optional)" },
  { value: "uber", label: "Uber / Uber Eats" },
  { value: "deliveroo", label: "Deliveroo" },
  { value: "just_eat", label: "Just Eat" },
  { value: "amazon_flex", label: "Amazon Flex" },
  { value: "courier", label: "Courier" },
  { value: "other", label: "Other" },
];

const liveFeatures = [
  "GPS mileage tracking with shift mode",
  "Smart drive detection when off-shift",
  "HMRC tax deduction calculator (45p/25p rates)",
  "Offline-first — trips saved locally, synced when online",
  "Cheapest fuel prices from 13 UK retailers",
  "Earnings tracking across gig platforms",
  "Milestones, streaks & shift scorecards",
  "HMRC-ready PDF & CSV exports",
  "Community suggestions board — shape the app",
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
        <p className="label">Early access — live now</p>
        <h2 className="heading">MileClear is ready to try</h2>
        <p className="subtext">
          We&apos;re not just collecting emails anymore. The app is live and being
          used by real drivers. Join early access to get in first and help shape
          what we build next.
        </p>

        <Reveal delay="reveal-d1">
          <div className="ea__features">
            <p className="ea__features-label">What&apos;s already working:</p>
            <ul className="ea__features-list">
              {liveFeatures.map((f) => (
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

        {status === "ok" ? (
          <div className="ea__ok">
            You&apos;re in! We&apos;ll send you an invite to download MileClear shortly.
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
              {status === "loading" ? "Joining\u2026" : "Get early access"}
            </button>
            {status === "err" && <p className="ea__err">{errMsg}</p>}
            <p className="ea__note">
              Free during early access. Premium features unlocked. No card required.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
