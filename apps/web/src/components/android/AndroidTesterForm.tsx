"use client";

import { useState, type FormEvent } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

/** One box, one field. The address goes to the waitlist table and pings
 *  #founder; Anthony adds it to the Play tester list by hand. */
export default function AndroidTesterForm() {
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
        Thanks. We&apos;ll add <strong>{email.trim()}</strong> to the Google Play
        test, usually within a day, and email you when you&apos;re in.
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
          aria-label="Your Google account email address"
          className="ea__input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <button type="submit" className="ea__btn" disabled={status === "loading"}>
          {status === "loading" ? "Sending…" : "Add me to the test"}
        </button>
      </div>
      {status === "err" && <p className="ea__err">{errMsg}</p>}
    </form>
  );
}
