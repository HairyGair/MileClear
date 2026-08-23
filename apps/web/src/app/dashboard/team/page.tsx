"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";

// MileClear Teams portal (P1, TPS360 pilot). Admin-only: members with
// month-to-date business mileage, invites, disable/re-enable. Drivers see
// a short "you're in <org>" note instead - their experience is the app.

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

export default function TeamPage() {
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
  useEffect(load, [load]);

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

  if (me === undefined) return <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  if (error) return <div className="alert alert--error">{error}</div>;
  if (me === null)
    return (
      <div className="glass-card" style={{ padding: "1.5rem", maxWidth: 640 }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>MileClear Teams</h1>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
          You are not part of a team. If your company uses MileClear Teams, ask your admin to invite you —
          the invitation arrives by email.
        </p>
      </div>
    );
  if (me.role !== "admin")
    return (
      <div className="glass-card" style={{ padding: "1.5rem", maxWidth: 640 }}>
        <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>{me.orgName}</h1>
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
          You are part of <strong>{me.orgName}</strong> on MileClear Teams. Just drive — your business
          mileage records automatically and your admin handles the monthly report. Your personal trips
          stay private to you.
        </p>
      </div>
    );

  const active = members?.filter((m) => m.status === "active") ?? [];
  const invited = members?.filter((m) => m.status === "invited") ?? [];
  const disabled = members?.filter((m) => m.status === "disabled") ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: 1000 }}>
      <div>
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>{me.orgName}</h1>
        <p style={{ color: "var(--text-secondary)", margin: "0.25rem 0 0" }}>
          {active.length} active driver{active.length === 1 ? "" : "s"} · {invited.length} invited ·
          month to date {Math.round(active.reduce((s, m) => s + m.monthBusinessMiles, 0) * 10) / 10} business miles
        </p>
      </div>

      <form onSubmit={invite} className="glass-card" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Invite drivers</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
          Email addresses, separated by commas or new lines. Each person gets a link; accepting connects
          their MileClear account to {me.orgName}.
        </p>
        <textarea
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
          {notice && <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>{notice}</span>}
        </div>
      </form>

      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.75rem" }}>Members</h2>
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
          Disabling someone removes their team access and Pro cover immediately; their personal account and
          data stay theirs. Monthly approval and the combined payroll report arrive in the next update.
        </p>
      </div>
    </div>
  );
}
