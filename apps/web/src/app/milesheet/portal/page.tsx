"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import MilesheetHeader from "../../../components/milesheet/MilesheetHeader";
import SeatBillingCard from "../../../components/milesheet/SeatBillingCard";
import SelfServeGate from "../../../components/milesheet/SelfServeGate";
import { MonthView } from "./MonthView";

// The Milesheet manager portal. Lives outside /dashboard on purpose: that
// shell is built for a sole trader (shifts, earnings, self assessment,
// personal trips) and none of it belongs in front of a company approving
// staff expenses.

interface Me { orgId: string; orgName: string; role: string }
interface Member {
  id: string; role: string; status: string; email: string; displayName: string | null;
  invitedAt: string; acceptedAt: string | null; lastTripAt: string | null;
  monthBusinessTrips: number; monthBusinessMiles: number;
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

export default function MilesheetPortalPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteText, setInviteText] = useState("");
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ data: Me | null }>("/team/me")
      .then((res) => {
        setMe(res.data);
        if (res.data?.role === "admin") {
          return api.get<{ data: Member[] }>("/team/members").then((m) => setMembers(m.data));
        }
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=%2Fmilesheet%2Fportal");
      return;
    }
    load();
  }, [loading, user, router, load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    const emails = inviteText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (emails.length === 0) return;
    setInviting(true);
    setNotice(null);
    try {
      const res = await api.post<{ data: Array<{ email: string; status: string }> }>("/team/invites", { emails });
      setNotice(res.data.map((r) => `${r.email}: ${r.status}`).join(" · "));
      setInviteText("");
      load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  };

  const setStatus = async (id: string, status: "active" | "disabled") => {
    try {
      await api.patch(`/team/members/${id}`, { status });
      load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Update failed");
    }
  };

  const frame = (children: React.ReactNode) => (
    <>
      <MilesheetHeader authed />
      <main className="ms-main">
        <div className="ms-container">{children}</div>
      </main>
    </>
  );

  if (loading || me === undefined) {
    return frame(<p style={{ color: "var(--text-secondary)" }}>Loading…</p>);
  }
  if (error) return frame(<div className="alert alert--error">{error}</div>);

  // No company yet: offer to create one rather than dead-ending them.
  if (me === null) return frame(<SelfServeGate />);

  // A driver who lands here does not need a portal. Their product is the app.
  if (me.role !== "admin") {
    return frame(
      <div className="glass-card" style={{ padding: "1.5rem", maxWidth: 640 }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>{me.orgName}</h1>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
          You are set up with <strong>{me.orgName}</strong>. There is nothing for you to do here.
          Just drive: your business mileage records itself, and whoever manages the claims at
          {" "}{me.orgName} approves it at the end of the month. Your personal journeys stay
          private to you and never appear in the company&rsquo;s figures.
        </p>
      </div>
    );
  }

  const active = members?.filter((m) => m.status === "active") ?? [];
  const invited = members?.filter((m) => m.status === "invited") ?? [];
  const disabled = members?.filter((m) => m.status === "disabled") ?? [];

  return frame(
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{me.orgName}</h1>
        <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
          {active.length} active driver{active.length === 1 ? "" : "s"} · {invited.length} invited ·
          month to date {Math.round(active.reduce((s, m) => s + m.monthBusinessMiles, 0) * 10) / 10} business miles
        </p>
      </div>

      <MonthView />

      <form onSubmit={invite} id="invite-drivers" className="glass-card" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Invite drivers</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
          Email addresses, separated by commas or new lines. Each person gets a link that connects
          their account to {me.orgName}.
        </p>
        <label htmlFor="ms-invite-emails" className="sr-only">
          Driver email addresses
        </label>
        <textarea
          id="ms-invite-emails"
          value={inviteText}
          onChange={(e) => setInviteText(e.target.value)}
          rows={2}
          placeholder="driver1@company.co.uk, driver2@company.co.uk"
          style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "inherit", padding: "0.6rem 0.8rem", fontFamily: "inherit", fontSize: "0.9375rem" }}
        />
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <button type="submit" className="btn btn--primary" disabled={inviting}>
            {inviting ? "Inviting…" : "Send invites"}
          </button>
          {notice && (
            <span aria-live="polite" style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
              {notice}
            </span>
          )}
        </div>
      </form>

      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem" }}>People</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th><th>Status</th><th>Last trip</th>
                <th style={{ textAlign: "right" }}>Business trips (month)</th>
                <th style={{ textAlign: "right" }}>Business miles (month)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...active, ...invited, ...disabled].map((m) => (
                <tr key={m.id} style={m.status === "disabled" ? { opacity: 0.5 } : undefined}>
                  <td>
                    <div>{m.displayName || m.email}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {m.email}{m.role === "admin" ? " · admin" : ""}
                    </div>
                  </td>
                  <td>{m.status === "invited" ? `invited ${ago(m.invitedAt)}` : m.status}</td>
                  <td>{ago(m.lastTripAt)}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.monthBusinessTrips}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.monthBusinessMiles.toFixed(1)}</td>
                  <td style={{ textAlign: "right" }}>
                    {m.status === "active" && m.role !== "admin" && (
                      <button className="btn btn--ghost" onClick={() => setStatus(m.id, "disabled")}>Disable</button>
                    )}
                    {m.status === "disabled" && (
                      <button className="btn btn--ghost" onClick={() => setStatus(m.id, "active")}>Re-enable</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginTop: "0.75rem" }}>
          Disabling someone removes their access to {me.orgName} straight away. Their own account and
          their own journeys stay theirs.
        </p>
      </div>

      <SeatBillingCard />
    </div>
  );
}
