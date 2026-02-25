"use client";

import { useState, useEffect } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import type { BillingStatus } from "@mileclear/shared";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password reset
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Billing
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // GDPR / Delete
  const [exportLoading, setExportLoading] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || "");
      setEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    api
      .get<{ data: BillingStatus }>("/billing/status")
      .then((res) => setBilling((res as any).data ?? res))
      .catch(() => setBilling(null))
      .finally(() => setBillingLoading(false));
  }, []);

  // Profile update
  const handleProfileSave = async () => {
    setProfileLoading(true);
    setError(null);
    try {
      await api.patch("/user/profile", {
        displayName: displayName || undefined,
        email: email !== user?.email ? email : undefined,
      });
      await refreshUser();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  // Password reset
  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setResetLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: user.email });
      setResetSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  // Billing
  const handleUpgrade = async () => {
    setUpgradeLoading(true);
    try {
      const res = await api.post<any>("/billing/checkout");
      window.location.href = (res.data ?? res).url;
    } catch (err: any) {
      setError(err.message);
      setUpgradeLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      await api.post("/billing/cancel");
      const updatedRes = await api.get<any>("/billing/status");
      setBilling((updatedRes as any).data ?? updatedRes);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelLoading(false);
    }
  };

  // GDPR export
  const handleExport = async () => {
    setExportLoading(true);
    try {
      const data = await api.get<any>("/user/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mileclear-data-export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExportLoading(false);
    }
  };

  // Delete account
  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await api.delete("/user/account", deletePassword ? { password: deletePassword } : undefined);
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your account and preferences" />

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Profile */}
      <div className="settings-section">
        <h2 className="settings-section__title">Profile</h2>
        <p className="settings-section__desc">
          Update your display name and email address.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 400 }}>
          <Input
            id="displayName"
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          <Input
            id="settingsEmail"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleProfileSave}
              disabled={profileLoading}
            >
              {profileLoading ? "Saving..." : "Save changes"}
            </Button>
            {profileSuccess && (
              <span style={{ fontSize: "0.875rem", color: "var(--emerald-400)" }}>
                Saved!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Password */}
      <div className="settings-section">
        <h2 className="settings-section__title">Password</h2>
        <p className="settings-section__desc">
          Reset your password via email.
        </p>
        {resetSent ? (
          <div className="alert alert--success">
            Password reset email sent to {user?.email}. Check your inbox.
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePasswordReset}
            disabled={resetLoading}
          >
            {resetLoading ? "Sending..." : "Send reset email"}
          </Button>
        )}
      </div>

      {/* Subscription */}
      <div className="settings-section">
        <h2 className="settings-section__title">Subscription</h2>
        <p className="settings-section__desc">
          Manage your MileClear subscription.
        </p>
        {billingLoading ? (
          <div className="skeleton skeleton--text" style={{ width: "40%" }} />
        ) : billing?.isPremium ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="billing-card">
              <div className="billing-card__status">
                <div className="billing-card__dot billing-card__dot--active" />
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-white)" }}>
                    MileClear Pro{" "}
                    <Badge variant="pro">Active</Badge>
                  </div>
                  {billing.currentPeriodEnd && (
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                      {billing.cancelAtPeriodEnd
                        ? `Access until ${new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB")}`
                        : `Renews ${new Date(billing.currentPeriodEnd).toLocaleDateString("en-GB")}`}
                    </div>
                  )}
                </div>
              </div>
              {!billing.cancelAtPeriodEnd && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={cancelLoading}
                  style={{ color: "var(--dash-red)" }}
                >
                  {cancelLoading ? "Cancelling..." : "Cancel subscription"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: "0.75rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              You&apos;re on the free plan. Upgrade to access tax exports, earnings tracking, and more.
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleUpgrade}
              disabled={upgradeLoading}
            >
              {upgradeLoading ? "Redirecting..." : "Upgrade to Pro — \u00A34.99/mo"}
            </Button>
          </div>
        )}
      </div>

      {/* Data */}
      <div className="settings-section">
        <h2 className="settings-section__title">Your Data</h2>
        <p className="settings-section__desc">
          Export or delete your account data.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            disabled={exportLoading}
          >
            {exportLoading ? "Exporting..." : "Export all data (GDPR)"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteAccount(true)}
          >
            Delete account
          </Button>
        </div>
      </div>

      {/* Delete Account Confirmation */}
      <ConfirmModal
        open={showDeleteAccount}
        onClose={() => {
          setShowDeleteAccount(false);
          setDeletePassword("");
        }}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message="This will permanently delete your account and all associated data. This action cannot be undone."
        confirmLabel="Delete my account"
        loading={deleteLoading}
      />
    </>
  );
}
