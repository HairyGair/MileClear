"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PRACTICE_STAFF_CAP, PROFESSIONAL_BODIES } from "@mileclear/shared";
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Menu,
  SelectField,
  Skeleton,
  StatusChip,
  TextField,
  useToast,
} from "../../../../components/dashboard/kit";
import { PracticeHead, usePractice } from "../../../../components/practice/PracticeShell";
import { PracticeMark } from "../../../../components/practice/PracticeMark";
import { JoinLinkBlock } from "../../../../components/practice/JoinLinkBlock";
import { fetchWithAuth } from "../../../../lib/api";
import { authedObjectUrl, dayMonth, errorText, papi, PracticeError } from "../../../../lib/practice";
import { practiceInitials } from "@mileclear/shared";

interface StaffRow {
  id: string;
  role: "owner" | "staff";
  status: "active" | "invited";
  name: string | null;
  email: string;
  invitedAt: string;
  acceptedAt: string | null;
  inviteExpired: boolean;
  isYou: boolean;
}

function FirmCard() {
  const { me, reload } = usePractice();
  const toast = useToast();
  const p = me.practice;
  const owner = me.member.role === "owner";
  const [form, setForm] = useState({
    name: p.name,
    contactName: p.contactName,
    email: p.email,
    phone: p.phone ?? "",
    professionalBody: p.professionalBody ?? "",
    arn: p.arn ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await papi.patch<{ ok: boolean; recheck: boolean }>("/practice/me", {
        name: form.name,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone || null,
        professionalBody: form.professionalBody || null,
        arn: form.arn || null,
      });
      toast.show(r.recheck ? "Saved. We'll check the new name, so drivers see “Not checked yet” until then." : "Saved");
      reload();
    } catch (err) {
      setError(errorText(err, "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Your firm">
      <p style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {p.checked ? (
          <StatusChip tone="green" icon="checkmark" label={`Checked ${p.checkedAt ? dayMonth(p.checkedAt) : ""}`.trim()} />
        ) : (
          <>
            <StatusChip tone="outline" icon="help-circle-outline" label="Not checked yet" />
            <span className="pc-muted" style={{ fontSize: 13 }}>
              We check new practices within one working day. Your clients see &ldquo;Not checked yet&rdquo; until then.
            </span>
          </>
        )}
      </p>
      <form className="pc-form" onSubmit={(e) => void save(e)}>
        <TextField label="Firm name" value={form.name} onChange={set("name")} maxLength={160} disabled={!owner} hint={owner ? "Changing the name means we check the practice again." : undefined} />
        <TextField label="Contact name" value={form.contactName} onChange={set("contactName")} maxLength={120} disabled={!owner} />
        <TextField label="Work email" type="email" value={form.email} onChange={set("email")} maxLength={255} disabled={!owner} />
        <TextField label="Phone" type="tel" required={false} value={form.phone} onChange={set("phone")} maxLength={40} disabled={!owner} />
        <SelectField
          label="Professional body"
          required={false}
          value={form.professionalBody}
          onChange={set("professionalBody")}
          disabled={!owner}
          options={[{ value: "", label: "Not set" }, ...PROFESSIONAL_BODIES.map((b) => ({ value: b.value, label: b.label }))]}
        />
        <TextField
          label="Agent Reference Number"
          required={false}
          value={form.arn}
          onChange={set("arn")}
          maxLength={20}
          disabled={!owner}
          hint="Only needed later, for quarterly updates as an agent."
        />
        {error && <p className="pc-error" role="alert">{error}</p>}
        {owner ? (
          <div>
            <Button type="submit" variant="primary" loading={saving}>
              Save details
            </Button>
          </div>
        ) : (
          <p className="pc-muted" style={{ fontSize: 13 }}>Only the practice owner can change these.</p>
        )}
      </form>
    </Card>
  );
}

function LogoCard() {
  const { me, reload } = usePractice();
  const toast = useToast();
  const owner = me.member.role === "owner";
  const logo = me.practice.logo;
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!logo) {
      setSrc(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    authedObjectUrl("/practice/logo").then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      url = u;
      setSrc(u);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [logo]);

  async function upload(file: File) {
    if (file.size > 512 * 1024) {
      toast.show("Image too large. Use one under 512 KB.", "error");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.show("The logo must be a PNG, JPEG or WebP image.", "error");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetchWithAuth("/practice/logo", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new PracticeError(res.status, body);
      }
      toast.show("Logo uploaded. Drivers see your initials until we check it.");
      reload();
    } catch (e) {
      toast.show(errorText(e, "Couldn't upload. Try again."), "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await papi.del("/practice/logo");
      toast.show("Logo removed");
      reload();
    } catch (e) {
      toast.show(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Logo">
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <PracticeMark initials={practiceInitials(me.practice.name)} src={src} size={64} />
        <div className="mc-stack mc-stack--tight" style={{ flex: 1, minWidth: 220 }}>
          <p className="pc-muted" style={{ fontSize: 14 }}>
            {logo
              ? logo.checked
                ? "Drivers see this logo when you ask to see their records."
                : "We check every logo before drivers see it. Until then they see your initials."
              : "PNG, JPEG or WebP, up to 512 KB. Drivers see your initials until we've checked the logo."}
          </p>
          {logo && <span>{logo.checked ? <StatusChip tone="green" icon="checkmark" label="Checked" /> : <StatusChip tone="outline" label="Not checked yet" />}</span>}
          {owner && (
            <div style={{ display: "flex", gap: 12 }}>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="mc-sr-only"
                id="pc-logo-file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
              <Button variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>
                {logo ? "Change logo" : "Upload logo"}
              </Button>
              {logo && (
                <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function StaffCard() {
  const { me } = usePractice();
  const toast = useToast();
  const owner = me.member.role === "owner";
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<StaffRow | null>(null);

  const load = useCallback(() => {
    setError(null);
    papi
      .get<StaffRow[]>("/practice/staff")
      .then(setRows)
      .catch((e: unknown) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function invite(addr: string) {
    setInviting(true);
    try {
      await papi.post("/practice/staff", { email: addr });
      toast.show("Invite sent");
      setEmail("");
      load();
    } catch (e) {
      toast.show(errorText(e, "Couldn't send. Try again."), "error");
    } finally {
      setInviting(false);
    }
  }

  return (
    <Card title={`Staff (up to ${PRACTICE_STAFF_CAP})`} footer="Everyone in your practice sees every client. Removing someone keeps their past views in each driver's log, under their name.">
      {error && <ErrorState size="card" title="Couldn't load your staff" onRetry={load} />}
      {!rows && !error && <Skeleton variant="row" count={2} />}
      {rows?.map((r) => (
        <div key={r.id} className="mc-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <span className="mc-avatar" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" }}>
            <span className="mc-avatar__initial">{(r.name || r.email).charAt(0).toUpperCase()}</span>
          </span>
          <span className="mc-row__text">
            <span className="mc-row__label">
              {r.name || r.email}
              {r.isYou && <span className="pc-muted"> (you)</span>}
            </span>
            {r.name && <span className="mc-row__hint">{r.email}</span>}
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {r.status === "invited" ? (
              <StatusChip tone="neutral" label={r.inviteExpired ? "Invite expired" : `Invited ${dayMonth(r.invitedAt)}`} />
            ) : r.role === "owner" ? (
              <span className="mc-status" style={{ background: "var(--mc-amber-dim)", color: "var(--mc-text-1)" }}>
                Owner
              </span>
            ) : (
              <StatusChip tone="neutral" label="Staff" />
            )}
            {owner && r.role !== "owner" && (
              <Menu
                ariaLabel={`Options for ${r.name || r.email}`}
                triggerClassName="mc-iconbtn"
                trigger={<span aria-hidden="true">&middot;&middot;&middot;</span>}
                items={[
                  ...(r.status === "invited" ? [{ label: "Resend", onClick: () => void invite(r.email) }] : []),
                  { label: "Remove", danger: true, onClick: () => setRemoving(r) },
                ]}
              />
            )}
          </span>
        </div>
      ))}
      {owner && (
        <form
          style={{ display: "flex", gap: 12, alignItems: "flex-end", marginTop: 16, flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) void invite(email.trim());
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <TextField label="Invite a colleague" type="email" value={email} onChange={setEmail} placeholder="colleague@yourfirm.co.uk" autoComplete="off" />
          </div>
          <Button type="submit" variant="secondary" icon="add-circle-outline" loading={inviting} disabled={!email.trim()}>
            Invite
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name || removing?.email || ""}?`}
        body="They won't see your clients any more."
        confirmLabel="Remove"
        destructive
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          try {
            await papi.del(`/practice/staff/${removing.id}`);
            toast.show("Removed");
            load();
          } catch (e) {
            toast.show(errorText(e), "error");
          }
        }}
      />
    </Card>
  );
}

export default function PracticeSettingsPage() {
  return (
    <div className="pc-narrow">
      <PracticeHead title="Settings" />
      <div className="mc-stack">
        <FirmCard />
        <LogoCard />
        <StaffCard />
        <Card title="Join link and QR code">
          <JoinLinkBlock />
        </Card>
      </div>
    </div>
  );
}
