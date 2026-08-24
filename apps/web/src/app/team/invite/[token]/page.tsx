"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";

// MileClear Teams invite landing (P1, redirect fix P3 24 Aug 2026). If the
// visitor is logged in, accept immediately; if not, send them to log in or
// register with a `next` return path pointing straight back at this page,
// so acceptance completes automatically on return - no re-opening the
// email link required.

export default function TeamInvitePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const [state, setState] = useState<"checking" | "accepted" | "needs_login" | "error">("checking");
  const [detail, setDetail] = useState<string>("");

  const returnPath = token ? `/team/invite/${encodeURIComponent(token)}` : "/team";

  useEffect(() => {
    if (!token) { setState("error"); setDetail("This link is incomplete."); return; }
    const authed = typeof window !== "undefined" && !!localStorage.getItem("mc_access_token");
    if (!authed) { setState("needs_login"); return; }
    api
      .post<{ data: { orgName: string } }>("/team/invites/accept", { token })
      .then((res) => { setDetail(res.data.orgName); setState("accepted"); })
      .catch((err: Error) => { setDetail(err.message); setState("error"); });
  }, [token]);

  const card: React.CSSProperties = {
    maxWidth: 560, margin: "6rem auto", padding: "2rem",
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18, color: "#e2e8f0", lineHeight: 1.65, fontSize: "1rem",
  };

  return (
    <main style={{ background: "#030712", minHeight: "100vh", padding: "0 1rem" }}>
      <div style={card}>
        <h1 style={{ fontSize: "1.375rem", color: "#f9fafb", marginBottom: "0.75rem" }}>MileClear Teams</h1>
        {state === "checking" && <p>Checking your invitation…</p>}
        {state === "accepted" && (
          <>
            <p>You are in — your MileClear account is now connected to <strong>{detail}</strong>.</p>
            <p style={{ color: "#94a3b8" }}>
              Drive as normal and your business mileage records itself in the MileClear app.
              Admins can open the team portal from the dashboard.
            </p>
            <p style={{ marginTop: "1.25rem" }}>
              <Link href="/dashboard/team" style={{ color: "#fbbf24" }}>Go to the dashboard</Link>
            </p>
          </>
        )}
        {state === "needs_login" && (
          <>
            <p>To accept this invitation, log in to MileClear first, or create a free account if you
              don&apos;t have one. You&apos;ll be brought straight back here afterwards.</p>
            <p style={{ marginTop: "1.25rem", display: "flex", gap: "1.5rem" }}>
              <Link href={`/login?next=${encodeURIComponent(returnPath)}`} style={{ color: "#fbbf24" }}>
                Log in
              </Link>
              <Link href={`/register?next=${encodeURIComponent(returnPath)}`} style={{ color: "#fbbf24" }}>
                Create an account
              </Link>
            </p>
          </>
        )}
        {state === "error" && (
          <>
            <p>That didn&apos;t work: {detail || "the invite could not be accepted."}</p>
            <p style={{ color: "#94a3b8" }}>
              Invites expire after 7 days and can only be used once. Ask your team admin to send a fresh
              one, or email <a href="mailto:gair@mileclear.com" style={{ color: "#fbbf24" }}>gair@mileclear.com</a>.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
