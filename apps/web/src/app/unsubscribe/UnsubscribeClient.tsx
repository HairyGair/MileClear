"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.mileclear.com";

type Status = "ok" | "invalid" | "error" | "pending" | "resubscribed";

export default function UnsubscribeClient({
  initialStatus,
  token,
}: {
  initialStatus: "ok" | "invalid" | "error" | null;
  token: string | null;
}) {
  // If the API redirected here with ?status=..., that's the source of truth.
  // If we landed here from a direct link with just ?token=..., POST to
  // /unsubscribe ourselves so the unsubscribe takes effect on first visit.
  const [status, setStatus] = useState<Status>(
    initialStatus ?? (token ? "pending" : "invalid")
  );
  const [busy, setBusy] = useState(false);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    if (status !== "pending" || !token) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/unsubscribe?token=${encodeURIComponent(token)}`, {
          method: "POST",
        });
        if (res.ok) {
          setStatus("ok");
        } else {
          const payload = (await res.json().catch(() => null)) as { error?: string } | null;
          setStatus(payload?.error === "Invalid token" ? "invalid" : "error");
        }
      } catch {
        setStatus("error");
      }
    })();
  }, [status, token]);

  async function resubscribe() {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${API_URL}/unsubscribe/resubscribe?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      if (res.ok) {
        setStatus("resubscribed");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  if (status === "pending") {
    return (
      <div style={{ padding: "1rem 0" }}>
        <p style={{ color: "var(--text-muted, #94a3b8)", fontSize: "0.95rem" }}>
          Updating your preferences&hellip;
        </p>
      </div>
    );
  }

  if (status === "ok") {
    return (
      <div style={containerStyle}>
        <p style={leadStyle}>
          You&apos;ve been unsubscribed from MileClear marketing emails.
        </p>
        <p style={mutedStyle}>
          You&apos;ll still receive transactional emails (verification codes, password resets,
          billing receipts) because those are required for your account to work.
        </p>
        <p style={mutedStyle}>
          Changed your mind? You can reverse this in one click.
        </p>
        <div style={{ marginTop: "1.25rem" }}>
          <button
            type="button"
            onClick={resubscribe}
            disabled={busy || !token}
            style={primaryButtonStyle(busy)}
          >
            {busy ? "Resubscribing&hellip;" : "Resubscribe"}
          </button>
        </div>
        <p style={{ ...mutedStyle, marginTop: "1.5rem" }}>
          For finer control, manage email preferences from your{" "}
          <a href="/dashboard/settings" style={linkStyle}>account settings</a>.
        </p>
      </div>
    );
  }

  if (status === "resubscribed") {
    return (
      <div style={containerStyle}>
        <p style={leadStyle}>
          You&apos;re back on the list. Welcome back.
        </p>
        <p style={mutedStyle}>
          You&apos;ll get product updates, tips, and occasional check-ins again. You can
          opt out at any time from your{" "}
          <a href="/dashboard/settings" style={linkStyle}>account settings</a> or any
          email footer.
        </p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div style={containerStyle}>
        <p style={leadStyle}>
          That unsubscribe link isn&apos;t valid.
        </p>
        <p style={mutedStyle}>
          The link may have been corrupted in transit. To opt out, sign in and toggle
          marketing emails off in{" "}
          <a href="/dashboard/settings" style={linkStyle}>account settings</a>, or
          email <a href="mailto:gair@mileclear.com" style={linkStyle}>gair@mileclear.com</a>{" "}
          and we&apos;ll do it for you.
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <p style={leadStyle}>
        Something went wrong on our end.
      </p>
      <p style={mutedStyle}>
        Please try again in a moment. If it keeps failing, email{" "}
        <a href="mailto:gair@mileclear.com" style={linkStyle}>gair@mileclear.com</a>{" "}
        and I&apos;ll opt you out manually.
      </p>
    </div>
  );
}

// Inline styles - avoids touching the global legal.css; the unsubscribe page
// is rare enough that one-off inline styles are cleaner than a new stylesheet.
const containerStyle: React.CSSProperties = {
  padding: "0.5rem 0 1rem",
  maxWidth: "520px",
};
const leadStyle: React.CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 600,
  color: "var(--text-strong, #f0f2f5)",
  margin: "0 0 0.75rem",
  lineHeight: 1.5,
};
const mutedStyle: React.CSSProperties = {
  color: "var(--text-muted, #94a3b8)",
  fontSize: "0.95rem",
  lineHeight: 1.65,
  margin: "0 0 0.75rem",
};
const linkStyle: React.CSSProperties = {
  color: "#f5a623",
  textDecoration: "underline",
};
const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "0.6rem 1.1rem",
  borderRadius: "8px",
  background: "linear-gradient(90deg, #f5a623, #e8950f)",
  color: "#0a1120",
  fontWeight: 600,
  fontSize: "0.95rem",
  border: "none",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.6 : 1,
});
