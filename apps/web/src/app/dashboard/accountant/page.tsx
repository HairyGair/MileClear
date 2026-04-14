"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";

interface AccountantAccess {
  id: string;
  email: string;
  status: "pending" | "active" | "revoked";
  lastAccessedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

function StatusBadge({ status }: { status: AccountantAccess["status"] }) {
  if (status === "active") {
    return <span className="badge badge--success">Active</span>;
  }
  if (status === "pending") {
    return <span className="badge badge--warning">Pending</span>;
  }
  return <span className="badge badge--source">Revoked</span>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AccountantPage() {
  const { user } = useAuth();
  const [accessList, setAccessList] = useState<AccountantAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAccess = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: AccountantAccess[] }>("/accountant/access");
      setAccessList(res.data);
    } catch (err: any) {
      setError(err.message || "Failed to load accountant access.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.isPremium) {
      loadAccess();
    } else {
      setLoading(false);
    }
  }, [user, loadAccess]);

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setInviting(true);
    try {
      await api.post("/accountant/invite", { email: trimmed });
      setEmail("");
      showToast("success", `Invite sent to ${trimmed}`);
      await loadAccess();
    } catch (err: any) {
      showToast("error", err.message || "Failed to send invite.");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (id: string, email: string) => {
    setRevoking(id);
    try {
      await api.delete(`/accountant/access/${id}`);
      showToast("success", `Access revoked for ${email}`);
      await loadAccess();
    } catch (err: any) {
      showToast("error", err.message || "Failed to revoke access.");
    } finally {
      setRevoking(null);
    }
  };

  if (!user?.isPremium && !loading) {
    return (
      <>
        <PageHeader
          title="Accountant Access"
          subtitle="Share your mileage data securely with your accountant"
        />
        <div className="premium-gate">
          <div className="premium-gate__icon">&#9888;</div>
          <h2 className="premium-gate__title">Upgrade to Pro</h2>
          <p className="premium-gate__text">
            Accountant access - including secure read-only dashboards with trip summaries, HMRC deductions, and earnings - is available with a MileClear Pro subscription.
          </p>
          <a href="/dashboard/settings" className="btn btn--primary btn--md">
            Manage Subscription
          </a>
        </div>
      </>
    );
  }

  const activeCount = accessList.filter((a) => a.status === "active").length;
  const pendingCount = accessList.filter((a) => a.status === "pending").length;

  return (
    <>
      <PageHeader
        title="Accountant Access"
        subtitle="Share a secure, read-only view of your mileage and tax data with your accountant"
      />

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1.25rem" }}>
          {error}
        </div>
      )}

      {/* Invite form */}
      <div className="settings-section" style={{ marginBottom: "var(--dash-gap)" }}>
        <div className="settings-section__title">Invite your Accountant</div>
        <div className="settings-section__desc">
          Your accountant will receive a secure link giving them read-only access to your trip summaries, HMRC deductions, and earnings for any tax year.
        </div>
        <form className="invite-form" onSubmit={handleInvite}>
          <input
            type="email"
            className="form-input"
            placeholder="accountant@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={inviting}
          />
          <button
            type="submit"
            className="btn btn--primary btn--md"
            disabled={inviting || !email.trim()}
          >
            {inviting ? "Sending..." : "Send Invite"}
          </button>
        </form>
      </div>

      {/* Access list */}
      <div className="settings-section">
        <div className="card__header" style={{ marginBottom: "1rem" }}>
          <div className="settings-section__title" style={{ marginBottom: 0 }}>
            Current Access
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {activeCount > 0 && (
              <span className="badge badge--success">{activeCount} active</span>
            )}
            {pendingCount > 0 && (
              <span className="badge badge--warning">{pendingCount} pending</span>
            )}
          </div>
        </div>

        {loading ? (
          <LoadingSkeleton variant="row" count={3} />
        ) : accessList.length === 0 ? (
          <div className="empty-state" style={{ padding: "2rem" }}>
            <div className="empty-state__icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="empty-state__title">No accountants added yet</p>
            <p className="empty-state__desc">
              Send an invite above and your accountant will receive a secure link to view your data.
            </p>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Last Accessed</th>
                  <th>Invited</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accessList.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 500 }}>{item.email}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {formatDate(item.lastAccessedAt)}
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>
                      {formatDate(item.createdAt)}
                    </td>
                    <td>
                      {item.status !== "revoked" && (
                        <button
                          className="table__action-btn table__action-btn--danger"
                          onClick={() => handleRevoke(item.id, item.email)}
                          disabled={revoking === item.id}
                        >
                          {revoking === item.id ? "Revoking..." : "Revoke"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info callout */}
      <div
        className="alert alert--warning"
        style={{ marginTop: "var(--dash-gap)", display: "flex", alignItems: "flex-start", gap: "0.625rem" }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>
          Accountants receive read-only access. They cannot modify your trips, earnings, or account settings. Access links expire after 90 days and can be revoked at any time.
        </span>
      </div>

      {toast && (
        <div className={`toast toast--${toast.type}`}>{toast.message}</div>
      )}
    </>
  );
}
