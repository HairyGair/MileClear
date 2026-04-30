"use client";

import { useState, useEffect } from "react";
import { api, setTokens } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../components/ui/Toast";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { Modal } from "../../../components/ui/Modal";
import type { BillingStatus, WorkType } from "@mileclear/shared";
import { Select } from "../../../components/ui/Select";
import { AVATARS, resolveAvatarFile } from "../../../lib/avatars";

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  // Avatar picker
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);

  // Dashboard mode
  const [dashboardMode, setDashboardMode] = useState<"both" | "work" | "personal">("both");
  const [modeLoading, setModeLoading] = useState(false);

  // Email preferences
  const [marketingEmailsEnabled, setMarketingEmailsEnabled] = useState(true);
  const [marketingLoading, setMarketingLoading] = useState(false);

  // Work settings
  const [workType, setWorkType] = useState<WorkType>("gig");
  const [employerRate, setEmployerRate] = useState("");
  const [workSaving, setWorkSaving] = useState(false);

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Password reset
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Change password (requires current password)
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

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
      setFullName((user as any).fullName || "");
      setEmail(user.email);
      setDashboardMode(user.dashboardMode ?? "both");
      setWorkType((user as any).workType ?? "gig");
      setEmployerRate((user as any).employerMileageRatePence != null ? String((user as any).employerMileageRatePence) : "");
      setAvatarId((user as any).avatarId ?? null);
      setMarketingEmailsEnabled((user as any).marketingEmailsEnabled !== false);
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
        fullName: fullName || null,
        email: email !== user?.email ? email : undefined,
      });
      await refreshUser();
      toast("Profile updated");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setProfileLoading(false);
    }
  };

  // Avatar save - avatarId is a string key (mobile registry), e.g. "sedan-red".
  const handleAvatarSelect = async (id: string) => {
    setAvatarLoading(true);
    try {
      await api.patch("/user/profile", { avatarId: id });
      setAvatarId(id);
      await refreshUser();
      setShowAvatarPicker(false);
      toast("Avatar updated");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setAvatarLoading(false);
    }
  };

  // Marketing email toggle
  const handleMarketingToggle = async (next: boolean) => {
    setMarketingEmailsEnabled(next);
    setMarketingLoading(true);
    try {
      await api.patch("/user/profile", { marketingEmailsEnabled: next });
      await refreshUser();
      toast(next ? "Marketing emails on" : "Unsubscribed from marketing emails");
    } catch (err: any) {
      // Revert on failure
      setMarketingEmailsEnabled(!next);
      toast(err.message, "error");
    } finally {
      setMarketingLoading(false);
    }
  };

  // Dashboard mode
  const handleModeChange = async (mode: "both" | "work" | "personal") => {
    setDashboardMode(mode);
    setModeLoading(true);
    try {
      await api.patch("/user/profile", { dashboardMode: mode });
      await refreshUser();
      toast("Dashboard mode updated");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setModeLoading(false);
    }
  };

  // Work settings
  const handleWorkSettingsSave = async () => {
    setWorkSaving(true);
    setError(null);
    try {
      const rateParsed = employerRate ? parseInt(employerRate, 10) : null;
      await api.patch("/user/profile", {
        workType,
        employerMileageRatePence: rateParsed,
      });
      await refreshUser();
      toast("Work settings saved");
    } catch (err: any) {
      toast(err.message, "error");
    } finally {
      setWorkSaving(false);
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

  // Change password (in-app, no email required)
  const handleChangePassword = async () => {
    setChangeError(null);
    if (newPassword.length < 8) {
      setChangeError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangeError("New password and confirmation do not match");
      return;
    }
    setChangeLoading(true);
    try {
      const res = await api.post<{ data: { accessToken: string; refreshToken: string } }>(
        "/auth/change-password",
        { currentPassword, newPassword }
      );
      const data = (res as any).data ?? res;
      if (data?.accessToken && data?.refreshToken) {
        setTokens(data.accessToken, data.refreshToken);
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast("Password changed. Other devices have been signed out.");
    } catch (err: any) {
      setChangeError(err.message || "Could not change password");
    } finally {
      setChangeLoading(false);
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

      {/* Avatar */}
      <div className="settings-section">
        <h2 className="settings-section__title">Avatar</h2>
        <p className="settings-section__desc">
          Choose a vehicle avatar for your profile.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div
            className="sidebar__avatar"
            style={{ width: 64, height: 64, fontSize: "1.5rem", cursor: "pointer", flexShrink: 0 }}
            onClick={() => setShowAvatarPicker(true)}
          >
            {(() => {
              const file = resolveAvatarFile(avatarId);
              return file ? (
                <img src={file} alt="" className="sidebar__avatar-img" />
              ) : (
                user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "?"
              );
            })()}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setShowAvatarPicker(true)}>
            {avatarId ? "Change avatar" : "Pick an avatar"}
          </Button>
        </div>
      </div>

      {/* Profile */}
      <div className="settings-section">
        <h2 className="settings-section__title">Profile</h2>
        <p className="settings-section__desc">
          Update your profile details. Your full name is used on PDF exports and tax documents.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 400 }}>
          <Input
            id="fullName"
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your legal name (used on exports)"
          />
          <Input
            id="displayName"
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Public nickname (optional)"
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
          </div>
        </div>
      </div>

      {/* Email Preferences */}
      <div className="settings-section">
        <h2 className="settings-section__title">Email preferences</h2>
        <p className="settings-section__desc">
          Choose what you hear from us. Verification, password reset, and billing emails are
          required for your account and aren&apos;t affected by this setting.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "0.85rem 0",
            borderTop: "1px solid var(--border-soft, rgba(255,255,255,0.06))",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 600, color: "var(--text-strong, #f0f2f5)" }}>
              Product updates &amp; tips
            </p>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "var(--text-muted, #94a3b8)" }}>
              Release notes, occasional check-ins, tax-deadline reminders, status updates.
            </p>
          </div>
          <label
            style={{
              position: "relative",
              display: "inline-block",
              width: "44px",
              height: "24px",
              flexShrink: 0,
              cursor: marketingLoading ? "wait" : "pointer",
              opacity: marketingLoading ? 0.6 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={marketingEmailsEnabled}
              onChange={(e) => handleMarketingToggle(e.target.checked)}
              disabled={marketingLoading}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: "absolute",
                inset: 0,
                background: marketingEmailsEnabled ? "#f5a623" : "rgba(148,163,184,0.3)",
                borderRadius: "24px",
                transition: "background 150ms",
              }}
            />
            <span
              style={{
                position: "absolute",
                top: "2px",
                left: marketingEmailsEnabled ? "22px" : "2px",
                width: "20px",
                height: "20px",
                background: "#fff",
                borderRadius: "50%",
                transition: "left 150ms",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            />
          </label>
        </div>
      </div>

      {/* Dashboard Mode */}
      <div className="settings-section">
        <h2 className="settings-section__title">I use MileClear for</h2>
        <p className="settings-section__desc">
          Choose what you use MileClear for. This controls which sections appear in the sidebar.
        </p>
        <div className="mode-selector">
          {([
            { value: "both" as const, label: "Both", desc: "Business mileage tracking and personal driving" },
            { value: "work" as const, label: "Work only", desc: "Tax deductions, shifts, earnings, and exports" },
            { value: "personal" as const, label: "Personal only", desc: "Driving goals, achievements, and recaps" },
          ]).map((opt) => (
            <button
              key={opt.value}
              className={`mode-selector__option${dashboardMode === opt.value ? " mode-selector__option--active" : ""}`}
              onClick={() => handleModeChange(opt.value)}
              disabled={modeLoading}
            >
              <div className="mode-selector__radio">
                {dashboardMode === opt.value && <div className="mode-selector__radio-dot" />}
              </div>
              <div>
                <div className="mode-selector__label">{opt.label}</div>
                <div className="mode-selector__desc">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Work Settings — only for work/both */}
      {(dashboardMode === "work" || dashboardMode === "both") && (
        <div className="settings-section">
          <h2 className="settings-section__title">Work Settings</h2>
          <p className="settings-section__desc">
            Configure your work type and employer mileage reimbursement rate.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 400 }}>
            <Select
              id="workType"
              label="Work type"
              value={workType}
              onChange={(e) => setWorkType(e.target.value as WorkType)}
              options={[
                { value: "gig", label: "Gig / Delivery driver" },
                { value: "employee", label: "Employee using own vehicle" },
                { value: "both", label: "Both gig and employee" },
              ]}
            />
            {(workType === "employee" || workType === "both") && (
              <Input
                id="employerRate"
                label="Employer mileage rate (pence/mile)"
                type="number"
                min="0"
                max="100"
                value={employerRate}
                onChange={(e) => setEmployerRate(e.target.value)}
                placeholder="e.g. 25 (leave empty if none)"
              />
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleWorkSettingsSave}
                disabled={workSaving}
              >
                {workSaving ? "Saving..." : "Save work settings"}
              </Button>
            </div>
            {(workType === "employee" || workType === "both") && employerRate && (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", margin: 0 }}>
                Your employer reimburses {employerRate}p/mi. HMRC allows 45p/mi for cars — you can claim the {Math.max(0, 45 - parseInt(employerRate, 10))}p difference.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Password */}
      <div className="settings-section">
        <h2 className="settings-section__title">Password</h2>
        <p className="settings-section__desc">
          Change your password using your current one. Other devices will be signed out.
        </p>

        {changeError && (
          <div className="alert alert--error" style={{ marginBottom: "0.75rem" }}>
            {changeError}
          </div>
        )}

        <div style={{ display: "grid", gap: "0.75rem", maxWidth: "420px" }}>
          <Input
            type="password"
            label="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter your current password"
          />
          <Input
            type="password"
            label="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
          <Input
            type="password"
            label="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Re-enter new password"
          />
          <div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleChangePassword}
              disabled={changeLoading || !currentPassword || !newPassword || !confirmPassword}
            >
              {changeLoading ? "Changing..." : "Change password"}
            </Button>
          </div>
        </div>

        <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--border-soft, rgba(255,255,255,0.08))" }}>
          <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: "0 0 0.5rem" }}>
            Forgotten your current password? We&apos;ll email you a reset code.
          </p>
          {resetSent ? (
            <div className="alert alert--success">
              Reset email sent to {user?.email}. If it doesn&apos;t arrive within a few minutes, check your spam folder.
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePasswordReset}
              disabled={resetLoading}
            >
              {resetLoading ? "Sending..." : "Send reset email"}
            </Button>
          )}
        </div>
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

      {/* Avatar Picker Modal */}
      <Modal
        open={showAvatarPicker}
        onClose={() => setShowAvatarPicker(false)}
        title="Choose Your Avatar"
      >
        <div className="avatar-picker">
          {AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              className={`avatar-picker__item${avatarId === avatar.id ? " avatar-picker__item--selected" : ""}`}
              onClick={() => handleAvatarSelect(avatar.id)}
              disabled={avatarLoading}
              title={avatar.label}
            >
              <img
                src={avatar.file}
                alt={avatar.label}
                className="avatar-picker__img"
              />
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
