"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import MilesheetHeader from "../../../../components/milesheet/MilesheetHeader";

// Milesheet (Oct 2026): "Stop these emails" from the monthly approval email
// sent to a manager who has not signed up. Deliberately a page with buttons
// rather than a link that acts on its own: mail scanners open every link in
// an email, and this switches the manager off for good. Mail clients that
// support one-click unsubscribe POST to the API directly instead.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

export default function MilesheetStopPage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const [state, setState] = useState<"ready" | "sending" | "done" | "expired" | "error">("ready");

  const stop = async (reason: "stop_emails" | "not_my_team") => {
    setState("sending");
    try {
      const res = await fetch(`${API_URL}/team/approval-links/${encodeURIComponent(token)}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        referrerPolicy: "no-referrer",
      });
      if (res.ok) setState("done");
      else if (res.status === 404) setState("expired");
      else setState("error");
    } catch {
      setState("error");
    }
  };

  const muted: React.CSSProperties = { color: "var(--text-secondary)" };

  return (
    <>
      <MilesheetHeader />
      <main className="ms-main">
        <div className="card" style={{ maxWidth: 580, margin: "3rem auto", padding: "2rem", lineHeight: 1.65 }}>
          {(state === "ready" || state === "sending" || state === "error") && (
            <>
              <h1 style={{ fontSize: "1.375rem", marginBottom: "0.75rem", color: "var(--text-white)" }}>
                Stop these emails?
              </h1>
              <p style={muted}>
                A driver asked us to send you their monthly mileage to approve on Milesheet. If you stop, we
                won&rsquo;t email you about this team again and your approval links will stop working.
              </p>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  disabled={state === "sending"}
                  onClick={() => stop("stop_emails")}
                >
                  Stop these emails
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  disabled={state === "sending"}
                  onClick={() => stop("not_my_team")}
                >
                  This isn&rsquo;t my team
                </button>
              </div>
              {state === "error" && (
                <p style={{ color: "var(--dash-red, #ef4444)", fontSize: "0.875rem", marginTop: "0.75rem" }}>
                  That didn&rsquo;t work. Please try again, or reply to the email and we&rsquo;ll stop them for you.
                </p>
              )}
            </>
          )}

          {state === "done" && (
            <>
              <h1 style={{ fontSize: "1.375rem", marginBottom: "0.75rem", color: "var(--text-white)" }}>Done</h1>
              <p style={muted}>We won&rsquo;t email you about this team again.</p>
            </>
          )}

          {state === "expired" && (
            <>
              <h1 style={{ fontSize: "1.375rem", marginBottom: "0.75rem", color: "var(--text-white)" }}>
                This link no longer works
              </h1>
              <p style={muted}>
                It may have expired, or these emails were already stopped. If you are still getting them, email{" "}
                <a href="mailto:support@mileclear.com" style={{ color: "var(--amber-400)" }}>
                  support@mileclear.com
                </a>{" "}
                and we&rsquo;ll stop them.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
