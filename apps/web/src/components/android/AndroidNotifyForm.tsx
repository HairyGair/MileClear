"use client";

// The gap between "the release is with Google" and "the listing is live".
// One field, one submit: the address lands in the waitlist table and pings
// #founder with a link straight to the Play tester list, so a driver who wants
// it today can be added to the test track, and everyone else gets an email the
// day the public release lands. Rendered only while PLAY_LIVE is false.

import { useState, type FormEvent } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

export default function AndroidNotifyForm() {
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ email: email.trim(), source: "android" }),
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

  if (status === "ok") {
    return (
      <div className="ea__ok" style={{ marginTop: "1rem" }}>
        Got it. <strong>{email.trim()}</strong> will hear from us the day the Play listing
        goes live. If you would rather have it today, reply to that email and we will add you
        to the test track.
      </div>
    );
  }

  return (
    <form className="ea__form" style={{ marginTop: "1rem" }} onSubmit={submit}>
      <div className="ea__row">
        <input
          type="email"
          required
          placeholder="The Gmail your phone is signed in with"
          aria-label="Your email address"
          className="ea__input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <button type="submit" className="ea__btn" disabled={status === "loading"}>
          {status === "loading" ? "Sending" : "Tell me when it lands"}
        </button>
      </div>
      {status === "err" && <p className="ea__err">{errMsg}</p>}
    </form>
  );
}
