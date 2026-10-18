"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import MilesheetHeader from "../../../../components/milesheet/MilesheetHeader";

// Milesheet invite landing. A logged-in visitor sees what joining shares,
// including the driving times consent line, and joins with the Accept
// button (never automatically, so the line is always read first). A
// visitor who is not logged in is sent to log in or register with a `next`
// return path pointing straight back here, so nobody has to go and find
// the email again.
//
// The Accept button sends drivingTimesNoticeShown: true, which is what lets
// the server record that this driver was told about driving times.

export default function MilesheetInvitePage() {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === "string" ? params.token : "";
  const [state, setState] = useState<"checking" | "ready" | "accepting" | "accepted" | "needs_login" | "error">(
    "checking"
  );
  const [detail, setDetail] = useState<string>("");

  const returnPath = token ? `/milesheet/invite/${encodeURIComponent(token)}` : "/milesheet";

  useEffect(() => {
    if (!token) { setState("error"); setDetail("This link is incomplete."); return; }
    const authed = typeof window !== "undefined" && !!localStorage.getItem("mc_access_token");
    setState(authed ? "ready" : "needs_login");
  }, [token]);

  const accept = () => {
    setState("accepting");
    api
      .post<{ data: { orgName: string } }>("/team/invites/accept", { token, drivingTimesNoticeShown: true })
      .then((res) => { setDetail(res.data.orgName); setState("accepted"); })
      .catch((err: Error) => { setDetail(err.message); setState("error"); });
  };

  const consent = (
    <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>
      Once you join, your business journeys are shared with your company for mileage claims.
      Your personal journeys stay private to you. Your manager can also see when your business
      drives start and finish each day.
    </p>
  );

  const link: React.CSSProperties = { color: "var(--amber-400)" };

  return (
    <>
      <MilesheetHeader />
      <main className="ms-main">
        <div className="card" style={{ maxWidth: 580, margin: "3rem auto", padding: "2rem", lineHeight: 1.65 }}>
          {state === "checking" && <p>Checking your invitation…</p>}

          {(state === "ready" || state === "accepting") && (
            <>
              <h1 style={{ fontSize: "1.375rem", marginBottom: "0.75rem", color: "var(--text-white)" }}>
                Accept your invitation
              </h1>
              <p style={{ color: "var(--text-secondary)" }}>
                You have been invited to join your company&rsquo;s team on Milesheet, the company side of
                MileClear.
              </p>
              {consent}
              <p style={{ marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={accept}
                  disabled={state === "accepting"}
                >
                  {state === "accepting" ? "Accepting..." : "Accept invitation"}
                </button>
              </p>
            </>
          )}

          {state === "accepted" && (
            <>
              <h1 style={{ fontSize: "1.375rem", marginBottom: "0.75rem", color: "var(--text-white)" }}>
                You are set up with {detail}
              </h1>
              <p style={{ color: "var(--text-secondary)" }}>
                Your business journeys will be recorded automatically, and whoever handles claims at{" "}
                {detail} approves them at the end of each month. Your personal journeys stay private
                to you and never appear in the company&rsquo;s figures. Your manager can also see when
                your business drives start and finish each day.
              </p>
              <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>
                Milesheet is the company side of <strong>MileClear</strong>. Install the MileClear app
                on your phone and sign in with this same email address, and your journeys start
                recording.
              </p>
              <p style={{ marginTop: "1.25rem" }}>
                <Link href="/milesheet/portal" style={link}>Open Milesheet</Link>
              </p>
            </>
          )}

          {state === "needs_login" && (
            <>
              <h1 style={{ fontSize: "1.375rem", marginBottom: "0.75rem", color: "var(--text-white)" }}>
                Accept your invitation
              </h1>
              <p style={{ color: "var(--text-secondary)" }}>
                Log in first, or create a free account if you do not have one. You will be brought
                straight back here to accept.
              </p>
              {consent}
              <p style={{ marginTop: "1.25rem", display: "flex", gap: "1.5rem" }}>
                <Link href={`/login?next=${encodeURIComponent(returnPath)}`} style={link}>Log in</Link>
                <Link href={`/register?next=${encodeURIComponent(returnPath)}`} style={link}>Create an account</Link>
              </p>
            </>
          )}

          {state === "error" && (
            <>
              <h1 style={{ fontSize: "1.375rem", marginBottom: "0.75rem", color: "var(--text-white)" }}>
                That did not work
              </h1>
              <p style={{ color: "var(--text-secondary)" }}>{detail || "The invitation could not be accepted."}</p>
              <p style={{ color: "var(--text-secondary)", marginTop: "0.75rem" }}>
                Invitations expire after 7 days and can only be used once. Ask whoever invited you to
                send a fresh one, or email{" "}
                <a href="mailto:gair@mileclear.com" style={link}>gair@mileclear.com</a>.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
