"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

// MileClear Teams Phase 3 (24 Aug 2026) self-serve entry point on /teams.
// Anonymous visitors never see this - they keep the interest-register form
// that was already on the page. A logged-in visitor gets either "you're
// already in a team" or a one-field org creation form, checked client-side
// against /team/me so this stays a plain addition, not a rewrite of the
// public page.

const card: React.CSSProperties = {
  background: "rgba(234,179,8,0.05)",
  border: "1px solid rgba(234,179,8,0.18)",
  borderRadius: 18,
  padding: "clamp(1.25rem, 4vw, 2rem)",
  marginBottom: "3rem",
};
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
const btn: React.CSSProperties = {
  display: "inline-block",
  marginTop: "1rem",
  padding: "0.7rem 1.25rem",
  background: "#fbbf24",
  color: "#030712",
  fontWeight: 700,
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  fontSize: "0.9375rem",
};

interface Me {
  orgId: string;
  orgName: string;
  role: string;
}

export default function TeamSelfServeGate() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const hasToken = typeof window !== "undefined" && !!localStorage.getItem("mc_access_token");
    setAuthed(hasToken);
    if (!hasToken) {
      setChecking(false);
      return;
    }
    api
      .get<{ data: Me | null }>("/team/me")
      .then((res) => setMe(res.data))
      .catch(() => setMe(null))
      .finally(() => setChecking(false));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (name.trim().length < 2) {
      setError("Give your team a name (at least 2 characters).");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/team/self-serve", { name: name.trim() });
      window.location.href = "/dashboard/team";
    } catch (err: any) {
      setError(err.message || "Could not create your team");
      setSubmitting(false);
    }
  };

  if (!authed || checking) return null;

  if (me) {
    return (
      <div style={card}>
        <p style={{ color: "#e2e8f0", fontSize: "0.9375rem", margin: 0 }}>
          You are already part of <strong>{me.orgName}</strong> on MileClear Teams.
        </p>
        <Link href="/dashboard/team" style={{ ...btn, textDecoration: "none", display: "inline-block" }}>
          Go to your team dashboard
        </Link>
      </div>
    );
  }

  return (
    <div style={card}>
      <p style={{ color: "#f9fafb", fontSize: "1.0625rem", fontWeight: 700, margin: "0 0 0.5rem" }}>
        Set up your team now
      </p>
      <p style={{ color: "#94a3b8", fontSize: "0.9375rem", lineHeight: 1.6, margin: "0 0 1rem" }}>
        You are signed in, so you can skip the form below and start your own MileClear Teams organisation
        straight away. You will be its admin and can invite drivers from the team dashboard.
      </p>
      {error && (
        <div style={{ color: "#f87171", fontSize: "0.875rem", marginBottom: "0.5rem" }}>{error}</div>
      )}
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", color: "#e2e8f0", fontSize: "0.875rem", fontWeight: 600 }}>
          Team name
          <input
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Charlotte's Deliveries"
            maxLength={160}
            required
          />
        </label>
        <button type="submit" style={{ ...btn, opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
          {submitting ? "Creating..." : "Create my team"}
        </button>
      </form>
    </div>
  );
}
