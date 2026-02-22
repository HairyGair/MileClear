"use client";

import { useState, type FormEvent } from "react";

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
        <p className="label">Early access</p>
        <h2 className="heading">Be the first to try MileClear</h2>
        <p className="subtext">
          We&apos;re building something drivers can actually rely on. Sign up
          and be the first to know when it&apos;s ready.
        </p>

        {status === "ok" ? (
          <div className="ea__ok">
            You&apos;re in. We&apos;ll let you know as soon as MileClear is ready.
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
              {status === "loading" ? "Joining\u2026" : "Join the waitlist"}
            </button>
            {status === "err" && <p className="ea__err">{errMsg}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
