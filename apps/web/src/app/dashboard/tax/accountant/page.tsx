"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  MoneyField,
  PageHeader,
  ProGate,
  Skeleton,
  StatusChip,
  TextField,
  useData,
  useMe,
  useToast,
} from "@/components/dashboard/kit";
import { messageOf, shortDateYear } from "@/components/dashboard/tax/tax-utils";
import "@/components/dashboard/tax/tax.css";

interface AccessItem {
  id: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  permissions: string;
  lastAccessedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  source: "invite" | "access";
}

function Details() {
  const { user, refresh } = useMe();
  const toast = useToast();
  const [name, setName] = useState(user?.accountantName ?? "");
  const [contact, setContact] = useState(user?.accountantContact ?? "");
  const [fee, setFee] = useState<number | null>(user?.accountantAnnualFeePence ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch("/user/profile", {
        accountantName: name.trim() || null,
        accountantContact: contact.trim() || null,
        accountantAnnualFeePence: fee,
      });
      await refresh();
      toast.show("Saved");
    } catch (e) {
      setError(messageOf(e, "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Your accountant's details">
      <form
        className="mc-tax-fields"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="mc-tax-fields mc-tax-fields--2">
          <TextField label="Name" value={name} onChange={setName} maxLength={120} autoComplete="off" />
          <TextField label="Email or phone" value={contact} onChange={setContact} maxLength={255} autoComplete="off" />
        </div>
        <MoneyField
          label="Annual fee"
          hint="We add a weekly share of the fee to your set-aside amount."
          value={fee}
          onChange={setFee}
        />
        {error && (
          <p className="mc-tax-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" loading={saving}>
            Save details
          </Button>
        </div>
      </form>
    </Card>
  );
}

const STATUS: Record<AccessItem["status"], { tone: "green" | "amber" | "neutral"; label: string }> = {
  accepted: { tone: "green", label: "Has access" },
  pending: { tone: "amber", label: "Invited" },
  revoked: { tone: "neutral", label: "Revoked" },
  expired: { tone: "neutral", label: "Expired" },
};

function Sharing() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<AccessItem | null>(null);
  const { data, error, loading, reload } = useData<AccessItem[]>("accountant-access", () =>
    api.get<{ data: AccessItem[] }>("/accountant/access").then((r) => r.data)
  );

  async function invite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setInviting(true);
    setInviteError(null);
    try {
      await api.post("/accountant/invite", { email: trimmed });
      setEmail("");
      toast.show("Invite sent");
      reload();
    } catch (e) {
      setInviteError(messageOf(e, "Couldn't send the invite. Try again."));
    } finally {
      setInviting(false);
    }
  }

  const active = (data ?? []).filter((a) => a.status === "accepted" || a.status === "pending");

  return (
    <Card title="Share your records">
      <div className="mc-tax-stack">
        <p className="mc-tax-text">Your accountant gets a read-only view of your records for 12 months.</p>
        <form
          className="mc-tax-fields"
          onSubmit={(e) => {
            e.preventDefault();
            void invite();
          }}
        >
          <TextField label="Accountant's email" type="email" value={email} onChange={setEmail} error={inviteError ?? undefined} autoComplete="off" />
          <div>
            <Button type="submit" variant="secondary" loading={inviting} disabled={!email.trim()}>
              Send invite
            </Button>
          </div>
        </form>

        {loading && !data && <Skeleton variant="row" count={2} />}
        {error && !data && <ErrorState title="Couldn't load who has access" onRetry={reload} size="card" />}
        {data && active.length === 0 && (
          <EmptyState size="card" icon="people-outline" title="Nobody has access yet" body="Invite your accountant above." />
        )}
        {active.length > 0 && (
          <ul className="mc-tax-kv" aria-label="People with access">
            {active.map((a) => (
              <li key={a.id}>
                <span className="mc-tax-kv__label">
                  {a.email}
                  <span className="mc-tax-kv__sub">
                    {a.status === "accepted"
                      ? a.lastAccessedAt
                        ? `Last looked ${shortDateYear(a.lastAccessedAt)}`
                        : "Has not looked yet"
                      : `Invited ${shortDateYear(a.createdAt)}`}
                  </span>
                </span>
                <span className="mc-tax-inline">
                  <StatusChip tone={STATUS[a.status].tone} label={STATUS[a.status].label} />
                  <Button size="sm" variant="ghost" onClick={() => setRevoking(a)} aria-label={`Revoke access for ${a.email}`}>
                    Revoke
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={revoking !== null}
        title="Revoke access?"
        body={revoking ? `${revoking.email} will no longer be able to see your records.` : undefined}
        confirmLabel="Revoke"
        destructive
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          await api.delete(`/accountant/access/${revoking.id}`);
          toast.show("Access revoked");
          reload();
        }}
      />
    </Card>
  );
}

export default function AccountantPage() {
  const { user } = useMe();
  return (
    <>
      <PageHeader title="Your accountant" back={{ href: "/dashboard/tax", label: "Tax" }} />
      <div className="mc-tax-page">
        {user && <Details />}
        <ProGate reason="accountant_share" teaser={<p className="mc-tax-text">Invite your accountant to see your records, read only.</p>}>
          <Sharing />
        </ProGate>
      </div>
    </>
  );
}
