"use client";

import { useState } from "react";

// "MileClear for teams" interest register. Five short answers, one minute.
// Posts to /team-interest on the API; the row is the record, the email to
// the founder is the notification. Inline styles on purpose: this sits on
// the dark SEO pages, which style inline rather than through globals.

const DRIVER_BANDS = [
  { value: "1-5", label: "1 to 5" },
  { value: "6-20", label: "6 to 20" },
  { value: "21-50", label: "21 to 50" },
  { value: "50+", label: "50 or more" },
] as const;

const APPROVALS = [
  { value: "monthly_signoff", label: "A monthly sign-off per driver" },
  { value: "line_by_line", label: "Approve or reject each trip" },
  { value: "view_only", label: "Just see everyone's mileage in one place" },
] as const;

const DESTINATIONS = [
  { value: "payroll", label: "Payroll" },
  { value: "expenses_system", label: "An expenses system" },
  { value: "spreadsheet", label: "A spreadsheet" },
  { value: "accountant", label: "Our accountant" },
  { value: "other", label: "Somewhere else" },
] as const;

const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.5rem" };
const legend: React.CSSProperties = {
  color: "#e2e8f0",
  fontSize: "0.9375rem",
  fontWeight: 600,
};
const input: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  color: "#f9fafb",
  fontSize: "0.9375rem",
  padding: "0.7rem 0.9rem",
  width: "100%",
  outline: "none",
};
const chipRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0.5rem" };
const chip = (on: boolean): React.CSSProperties => ({
  background: on ? "#fbbf24" : "rgba(255,255,255,0.04)",
  color: on ? "#030712" : "#e2e8f0",
  border: `1px solid ${on ? "#fbbf24" : "rgba(255,255,255,0.12)"}`,
  borderRadius: 9999,
  padding: "0.5rem 0.95rem",
  fontSize: "0.875rem",
  fontWeight: 600,
  cursor: "pointer",
});

export default function TeamInterestForm({ source }: { source: "teams" | "employee-mileage-tracker" }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [drivers, setDrivers] = useState<string | null>(null);
  const [approval, setApproval] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [destinationDetail, setDestinationDetail] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = email.trim().length > 3 && drivers && approval && destination;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) {
      setError("Your email plus the three quick picks are all we need.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.mileclear.com";
      const res = await fetch(`${apiUrl}/team-interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          company,
          drivers,
          approval,
          destination,
          destinationDetail,
          notes,
          source,
          website,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong. Email gair@mileclear.com and it will reach me.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Email gair@mileclear.com and it will reach me.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div
        role="status"
        style={{
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.35)",
          borderRadius: 14,
          padding: "1.5rem",
          color: "#e2e8f0",
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "#10b981", display: "block", marginBottom: "0.35rem" }}>Thank you, that is genuinely useful.</strong>
        I read every one of these myself. If a team version gets built, the people on this list hear first, and if I have a
        question about what you have told me I will email you directly.
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }} noValidate>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        <label style={field}>
          <span style={legend}>Work email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.co.uk"
            style={input}
          />
        </label>
        <label style={field}>
          <span style={legend}>
            Company <span style={{ color: "#64748b", fontWeight: 400 }}>(optional)</span>
          </span>
          <input
            type="text"
            autoComplete="organization"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Your company"
            style={input}
          />
        </label>
      </div>

      {/* Honeypot - hidden from people, visible to bots. */}
      <div style={{ position: "absolute", left: -9999, width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      <fieldset style={{ ...field, border: 0, padding: 0, margin: 0 }}>
        <legend style={{ ...legend, marginBottom: "0.5rem" }}>How many drivers claim mileage?</legend>
        <div style={chipRow} role="radiogroup">
          {DRIVER_BANDS.map((b) => (
            <button
              key={b.value}
              type="button"
              role="radio"
              aria-checked={drivers === b.value}
              onClick={() => setDrivers(b.value)}
              style={chip(drivers === b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ ...field, border: 0, padding: 0, margin: 0 }}>
        <legend style={{ ...legend, marginBottom: "0.5rem" }}>What does approval need to look like?</legend>
        <div style={chipRow} role="radiogroup">
          {APPROVALS.map((a) => (
            <button
              key={a.value}
              type="button"
              role="radio"
              aria-checked={approval === a.value}
              onClick={() => setApproval(a.value)}
              style={chip(approval === a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset style={{ ...field, border: 0, padding: 0, margin: 0 }}>
        <legend style={{ ...legend, marginBottom: "0.5rem" }}>Where do the approved figures need to end up?</legend>
        <div style={chipRow} role="radiogroup">
          {DESTINATIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={destination === d.value}
              onClick={() => setDestination(d.value)}
              style={chip(destination === d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
        {(destination === "payroll" || destination === "expenses_system" || destination === "other") && (
          <input
            type="text"
            value={destinationDetail}
            onChange={(e) => setDestinationDetail(e.target.value)}
            placeholder={destination === "other" ? "Where?" : "Which system? (Sage, Xero, Pleo, ...)"}
            style={{ ...input, marginTop: "0.5rem", maxWidth: 420 }}
          />
        )}
      </fieldset>

      <label style={field}>
        <span style={legend}>
          Anything else? <span style={{ color: "#64748b", fontWeight: 400 }}>(optional)</span>
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What you use today, what is painful about it, what would make you switch."
          style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
        />
      </label>

      {error && (
        <p role="alert" style={{ color: "#fca5a5", fontSize: "0.875rem", margin: 0 }}>
          {error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={sending}
          style={{
            background: "#fbbf24",
            color: "#030712",
            fontWeight: 700,
            fontSize: "0.9375rem",
            padding: "0.8rem 1.9rem",
            borderRadius: 9999,
            border: 0,
            cursor: sending ? "wait" : "pointer",
            opacity: sending ? 0.7 : 1,
          }}
        >
          {sending ? "Sending..." : "Register interest"}
        </button>
        <p style={{ color: "#64748b", fontSize: "0.8125rem", marginTop: "0.75rem" }}>
          No list, no marketing. One person reads these.
        </p>
      </div>
    </form>
  );
}
