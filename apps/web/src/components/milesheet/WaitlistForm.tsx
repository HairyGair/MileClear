"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../lib/api";

// Milesheet waiting list (4 Oct 2026). While MILESHEET_NEW_TEAMS is not
// "open" on the API, starting a company is paused for a small pilot and this
// form takes its place. Signed in, it posts to /team/self-serve (the account
// email is the contact); signed out, to /team/waitlist with an email field.
// Either way the API stores the request and emails a short confirmation.
// The copy must not promise dates or prices.

export type NewTeamsMode = "open" | "waitlist";

/** Asks the API whether new companies can be started. Null until known. */
export function useNewTeamsMode(): NewTeamsMode | null {
  const [mode, setMode] = useState<NewTeamsMode | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .get<{ data: { newTeams: NewTeamsMode } }>("/team/availability")
      .then((res) => {
        if (alive) setMode(res.data.newTeams === "open" ? "open" : "waitlist");
      })
      // Unknown: the API's own default is the waiting list, so say that.
      .catch(() => {
        if (alive) setMode("waitlist");
      });
    return () => {
      alive = false;
    };
  }, []);
  return mode;
}

const DRIVER_BANDS = [
  { value: "1-5", label: "1 to 5" },
  { value: "6-20", label: "6 to 20" },
  { value: "21-50", label: "21 to 50" },
  { value: "50+", label: "50 or more" },
] as const;

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  color: "#f9fafb",
  fontSize: "0.9375rem",
  padding: "0.7rem 0.9rem",
  width: "100%",
  marginTop: "0.5rem",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  fontWeight: 600,
  marginBottom: "0.85rem",
};
const chip = (on: boolean): React.CSSProperties => ({
  background: on ? "#fbbf24" : "rgba(255,255,255,0.04)",
  color: on ? "#030712" : "#e2e8f0",
  border: `1px solid ${on ? "#fbbf24" : "rgba(255,255,255,0.12)"}`,
  borderRadius: 9999,
  padding: "0.45rem 0.9rem",
  fontSize: "0.8125rem",
  fontWeight: 600,
  cursor: "pointer",
});
const btn: React.CSSProperties = {
  display: "inline-block",
  marginTop: "0.25rem",
  padding: "0.7rem 1.25rem",
  background: "#fbbf24",
  color: "#030712",
  fontWeight: 700,
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontSize: "0.9375rem",
};

export const WAITLIST_HEADLINE = "Milesheet is in a small pilot";
export const WAITLIST_LEDE = "Join the waiting list and we'll be in touch.";

/**
 * `signedInEmail` set: the visitor is signed in and their account email is
 * the contact. Unset: they type one.
 */
export default function WaitlistForm({ signedInEmail }: { signedInEmail?: string | null }) {
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [drivers, setDrivers] = useState<string | null>(null);
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (company.trim().length < 2) {
      setError("Enter your company's name.");
      return;
    }
    if (!signedInEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid work email.");
      return;
    }
    setSubmitting(true);
    try {
      const body = { contactName: contactName.trim(), ...(drivers ? { drivers } : {}) };
      if (signedInEmail) {
        await api.post("/team/self-serve", { name: company.trim(), ...body });
        setDone(signedInEmail);
      } else {
        await api.post("/team/waitlist", { company: company.trim(), email: email.trim(), website, ...body });
        setDone(email.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div role="status">
        <p style={{ color: "var(--text-white)", fontSize: "1.0625rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
          You&rsquo;re on the waiting list
        </p>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem", lineHeight: 1.6, margin: 0 }}>
          Thanks. We&rsquo;ve sent a short confirmation to {done}, and we&rsquo;ll be in touch when there&rsquo;s a
          place for your company.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ textAlign: "left" }}>
      {error && (
        <div role="alert" style={{ color: "var(--red-400, #f87171)", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
          {error}
        </div>
      )}
      <label style={labelStyle}>
        Company name
        <input style={inputStyle} value={company} onChange={(e) => setCompany(e.target.value)} maxLength={160} placeholder="e.g. Hartley & Sons Ltd" required />
      </label>
      <label style={labelStyle}>
        Your name
        <input style={inputStyle} value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={120} autoComplete="name" />
      </label>
      {!signedInEmail && (
        <label style={labelStyle}>
          Work email
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" required />
        </label>
      )}
      <fieldset style={{ border: "none", padding: 0, margin: "0 0 1rem" }}>
        <legend style={{ ...labelStyle, marginBottom: "0.5rem" }}>How many drivers? (optional)</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {DRIVER_BANDS.map((b) => (
            <button
              key={b.value}
              type="button"
              style={chip(drivers === b.value)}
              aria-pressed={drivers === b.value}
              onClick={() => setDrivers(drivers === b.value ? null : b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </fieldset>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px", width: 1, height: 1, opacity: 0 }}
      />
      {signedInEmail && (
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: "0 0 0.75rem" }}>
          We&rsquo;ll contact you at {signedInEmail}.
        </p>
      )}
      <button type="submit" style={{ ...btn, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
        {submitting ? "Joining…" : "Join the waiting list"}
      </button>
    </form>
  );
}
