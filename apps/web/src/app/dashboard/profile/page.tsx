"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Dialog,
  PageHeader,
  SettingsGroup,
  SettingsRow,
  TextField,
  useMe,
  useToast,
} from "@/components/dashboard/kit";
import { api, clearTokens, setTokens } from "@/lib/api";
import { AVATARS, resolveAvatarFile } from "@/lib/avatars";
import { errMsg, unwrap } from "@/components/dashboard/settings/util";
import styles from "@/components/dashboard/settings/settings.module.css";

// Your profile: avatar, names, email (with the pending-email code step),
// password, plan row and account deletion.
export default function ProfilePage() {
  const { user, isPro, refresh } = useMe();
  const { show } = useToast();

  const [displayName, setDisplayName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? "");
    setFullName(user.fullName ?? "");
    setEmail(user.email);
    // Only reset the form when a different account loads or the saved values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, user?.displayName, user?.fullName, user?.email]);

  const emailChanged = !!user && email.trim().toLowerCase() !== user.email.toLowerCase();

  async function save() {
    if (!user) return;
    setSaveError(null);
    if (emailChanged && !emailPassword) {
      setSaveError("Enter your password to change your email.");
      return;
    }
    setSaving(true);
    try {
      await api.patch("/user/profile", {
        displayName: displayName.trim() || null,
        fullName: fullName.trim() || null,
        ...(emailChanged ? { email: email.trim(), currentPassword: emailPassword } : {}),
      });
      await refresh();
      setEmailPassword("");
      show(emailChanged ? "Check your inbox for a code" : "Saved");
    } catch (e) {
      setSaveError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  // Avatar
  const [pickerOpen, setPickerOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  async function pickAvatar(id: string) {
    setAvatarBusy(true);
    try {
      await api.patch("/user/profile", { avatarId: id });
      await refresh();
      setPickerOpen(false);
      show("Saved");
    } catch (e) {
      show(errMsg(e), "error");
    } finally {
      setAvatarBusy(false);
    }
  }

  // Pending email
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  async function confirmCode() {
    setCodeBusy(true);
    setCodeError(null);
    try {
      await api.post("/auth/verify", { code: code.trim() });
      setCode("");
      await refresh();
      show("Email changed");
    } catch (e) {
      setCodeError(errMsg(e, "That code didn't work."));
    } finally {
      setCodeBusy(false);
    }
  }
  async function resendCode() {
    try {
      await api.post("/auth/send-verification");
      show("We sent a new code");
    } catch (e) {
      show(errMsg(e), "error");
    }
  }
  async function cancelEmailChange() {
    try {
      await api.delete("/user/pending-email");
      await refresh();
      show("Email change cancelled");
    } catch (e) {
      show(errMsg(e), "error");
    }
  }

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  async function changePassword() {
    setPwError(null);
    if (!currentPassword) return setPwError("Enter your current password.");
    if (newPassword.length < 8) return setPwError("Your new password needs at least 8 characters.");
    if (newPassword !== confirmPassword) return setPwError("The new passwords don't match.");
    setPwBusy(true);
    try {
      const res = await api.post<unknown>("/auth/change-password", { currentPassword, newPassword });
      const tokens = unwrap<{ accessToken?: string; refreshToken?: string }>(res);
      if (tokens?.accessToken && tokens?.refreshToken) setTokens(tokens.accessToken, tokens.refreshToken);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      show("Password changed");
    } catch (e) {
      setPwError(errMsg(e, "Couldn't change your password."));
    } finally {
      setPwBusy(false);
    }
  }

  // Delete account
  const [delOpen, setDelOpen] = useState(false);
  const [delPassword, setDelPassword] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  async function deleteAccount() {
    setDelBusy(true);
    setDelError(null);
    try {
      await api.delete("/user/account", delPassword ? { password: delPassword } : undefined);
      clearTokens();
      window.location.href = "/";
    } catch (e) {
      setDelError(errMsg(e, "Couldn't delete your account. Try again in a moment."));
      setDelBusy(false);
    }
  }

  const file = resolveAvatarFile(user?.avatarId);
  const initial = (user?.displayName || user?.email || "?").charAt(0).toUpperCase();

  return (
    <>
      <PageHeader title="Your profile" back={{ href: "/dashboard/more", label: "More" }} />
      <div className={styles.page}>
        <Card title="You">
          <div className={styles.fields}>
            <div className={styles.avatarRow}>
              <span className={styles.avatar} aria-hidden="true">
                {file ? <img src={file} alt="" /> : initial}
              </span>
              <Button variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
                {user?.avatarId ? "Change avatar" : "Pick an avatar"}
              </Button>
            </div>
            <TextField label="Display name" value={displayName} onChange={setDisplayName} maxLength={100} autoComplete="nickname" />
            <TextField
              label="Name for your exports"
              hint="Your legal name. It goes on your tax PDFs and mileage certificates."
              value={fullName}
              onChange={setFullName}
              maxLength={200}
              autoComplete="name"
            />
            <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            {emailChanged && (
              <TextField
                label="Password"
                type="password"
                hint="We need your password to change your email."
                value={emailPassword}
                onChange={setEmailPassword}
                autoComplete="current-password"
              />
            )}
            {saveError && <p className={styles.inlineError} role="alert">{saveError}</p>}
            <div className={styles.actions}>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                Save changes
              </Button>
            </div>
          </div>
        </Card>

        {user?.pendingEmail && (
          <Card title="Confirm your new email" tone="quiet">
            <div className={styles.fields}>
              <p className={styles.muted}>
                We sent a 6 digit code to {user.pendingEmail}. Enter it to finish. You keep signing in with {user.email} until then.
              </p>
              <TextField label="Code" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} error={codeError ?? undefined} autoComplete="one-time-code" />
              <div className={styles.actions}>
                <Button variant="secondary" loading={codeBusy} disabled={code.length !== 6} onClick={() => void confirmCode()}>
                  Confirm email
                </Button>
                <Button variant="link" onClick={() => void resendCode()}>Send a new code</Button>
                <Button variant="link" onClick={() => void cancelEmailChange()}>Cancel change</Button>
              </div>
            </div>
          </Card>
        )}

        <Card title="Change password">
          <div className={styles.fields}>
            <TextField label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" />
            <div className={styles.pair}>
              <TextField label="New password" type="password" hint="At least 8 characters." value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
              <TextField label="Repeat new password" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
            </div>
            {pwError && <p className={styles.inlineError} role="alert">{pwError}</p>}
            <div className={styles.actions}>
              <Button variant="secondary" loading={pwBusy} onClick={() => void changePassword()}>
                Change password
              </Button>
            </div>
            <p className={styles.muted}>Changing it signs you out on your other devices.</p>
          </div>
        </Card>

        <SettingsGroup>
          <SettingsRow icon="card-outline" label="Your plan" hint={isPro ? "Pro" : "Free"} href="/dashboard/settings/plan" />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow icon="trash-outline" label="Delete account" danger onClick={() => { setDelPassword(""); setDelError(null); setDelOpen(true); }} />
        </SettingsGroup>
      </div>

      <Dialog open={pickerOpen} title="Pick an avatar" onClose={() => setPickerOpen(false)} size="lg">
        <div className={styles.avatarGrid}>
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={styles.avatarOpt}
              aria-pressed={user?.avatarId === a.id}
              aria-label={a.label}
              disabled={avatarBusy}
              onClick={() => void pickAvatar(a.id)}
            >
              <img src={a.file} alt="" />
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={delOpen}
        title="Delete your account?"
        size="sm"
        onClose={() => !delBusy && setDelOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDelOpen(false)} disabled={delBusy}>Cancel</Button>
            <Button variant="destructive" loading={delBusy} onClick={() => void deleteAccount()}>Delete my account</Button>
          </>
        }
      >
        <div className={styles.fields}>
          <p className={styles.muted}>
            This removes your trips, earnings and everything else for good. Any Stripe subscription is cancelled. It can&apos;t be undone.
          </p>
          <TextField
            label="Your password"
            type="password"
            hint="Signed in with Apple and never set a password? Leave this blank."
            value={delPassword}
            onChange={setDelPassword}
            autoComplete="current-password"
            error={delError ?? undefined}
          />
        </div>
      </Dialog>
    </>
  );
}
