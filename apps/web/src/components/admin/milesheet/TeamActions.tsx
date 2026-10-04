"use client";

// Admin actions on a Milesheet team (4 Oct 2026). Every action asks for
// confirmation first; move and merge show the server's preview of exactly
// what changes, and the apply sends back the preview's planKey so the server
// refuses if anything changed in between. Every action is logged on the
// server as admin.milesheet.<action>.

import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import {
  Checkbox,
  ChoiceChips,
  Dialog,
  Notice,
  SelectInput,
  Spinner,
  TextInput,
  formatNumber,
  useAdminData,
} from "@/components/admin/ui";
import { roleLabel, shortDate } from "./labels";
import type { MergePreview, MilesheetJourney, MovePreview, TeamDetail, TeamMember } from "./types";

function errText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Shared confirm dialog for the small one-step actions. */
function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  onClose,
  run,
  onDone,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
  run: () => Promise<string | null>;
  onDone: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const msg = await run();
      onDone(msg ?? "Done.");
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      danger={danger}
      title={title}
      footer={
        <>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`adm-btn ${danger ? "adm-btn--danger" : "adm-btn--primary"}`} onClick={go} disabled={busy}>
            {busy ? <><Spinner /> Working</> : confirmLabel}
          </button>
        </>
      }
    >
      {children}
      {error && <Notice tone="bad" title="That didn't work">{error}</Notice>}
    </Dialog>
  );
}

export type InviteAction = { kind: "resend" | "cancel" | "extend7" | "extend14"; member: TeamMember };

export function InviteActionDialog({
  action,
  orgName,
  nominated,
  onClose,
  onDone,
}: {
  action: InviteAction | null;
  orgName: string;
  /** The team came from a driver nominating their manager. */
  nominated: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const m = action?.member;
  const kind = action?.kind;
  const days = kind === "extend7" ? 7 : 14;
  const title =
    kind === "resend" ? "Resend this invite?" : kind === "cancel" ? "Cancel this invite?" : `Extend this invite by ${days} days?`;
  const wording = m?.role === "admin" && nominated ? "the manager nomination email (\"... has asked you to handle their mileage claims\")" : `the ${m?.role === "admin" ? "manager" : "driver"} invite email`;
  return (
    <ConfirmDialog
      open={!!action}
      title={title}
      danger={kind === "cancel"}
      confirmLabel={kind === "resend" ? "Send a fresh link" : kind === "cancel" ? "Cancel the invite" : `Add ${days} days`}
      onClose={onClose}
      onDone={onDone}
      run={async () => {
        if (!m || !kind) return null;
        if (kind === "resend") {
          const r = await api.post<{ data: { emailSent: boolean; inviteExpiresAt: string } }>(`/admin/milesheet/memberships/${m.id}/resend`, {});
          return r.data.emailSent
            ? `Fresh link sent to ${m.invitedEmail}, valid until ${shortDate(r.data.inviteExpiresAt)}.`
            : `Link renewed but the email failed. Try resending again.`;
        }
        if (kind === "cancel") {
          await api.post(`/admin/milesheet/memberships/${m.id}/cancel`, {});
          return `Invite for ${m.invitedEmail} cancelled.`;
        }
        const r = await api.post<{ data: { inviteExpiresAt: string } }>(`/admin/milesheet/memberships/${m.id}/extend`, { days });
        return `Invite for ${m.invitedEmail} now runs until ${shortDate(r.data.inviteExpiresAt)}.`;
      }}
    >
      {m && (
        <>
          <p className="adm-text">
            <strong>{m.invitedEmail}</strong>, {roleLabel(m.role).toLowerCase()} of {orgName}. Invited {shortDate(m.invitedAt)}
            {m.inviteExpiresAt ? `, link ${m.inviteState === "expired" ? "expired" : "runs until"} ${shortDate(m.inviteExpiresAt)}` : ""}.
          </p>
          {kind === "resend" && (
            <p className="adm-note">
              Makes a new link valid for 7 days and emails it with {wording}. The old link stops working at once.
            </p>
          )}
          {kind === "cancel" && <p className="adm-note">The link stops working at once and the place is freed. To undo, invite them again.</p>}
          {(kind === "extend7" || kind === "extend14") && (
            <p className="adm-note">No email is sent. The link they already have keeps working {days} days longer (an expired link works again).</p>
          )}
        </>
      )}
    </ConfirmDialog>
  );
}

export function SeatCapDialog({ open, org, occupied, onClose, onDone }: { open: boolean; org: TeamDetail["org"]; occupied: number; onClose: () => void; onDone: (m: string) => void }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) setValue(org.seatCap == null ? "" : String(org.seatCap));
  }, [open, org.seatCap]);
  const parsed = value.trim() === "" ? null : Number(value);
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 1);
  return (
    <ConfirmDialog
      open={open}
      title="Change the member limit?"
      confirmLabel={parsed === null ? "Remove the limit" : `Set the limit to ${parsed}`}
      onClose={onClose}
      onDone={onDone}
      run={async () => {
        if (invalid) throw new Error("Enter a whole number, or leave it empty for no limit.");
        await api.post(`/admin/milesheet/teams/${org.id}/seat-cap`, { seatCap: parsed });
        return parsed === null ? "Member limit removed." : `Member limit set to ${parsed}.`;
      }}
    >
      <p className="adm-text">
        Now: {org.seatCap == null ? "no limit" : formatNumber(org.seatCap)}. In use: {formatNumber(occupied)} (active members and open invites, any role).
      </p>
      <TextInput label="New limit" hint="Leave empty for no limit. It cannot go below the places in use." inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
      {org.pilotFree && parsed === null && <Notice tone="warn">This is a free pilot. With no limit, every driver the manager invites gets Pro for free.</Notice>}
    </ConfirmDialog>
  );
}

export function PilotDialog({ open, org, onClose, onDone }: { open: boolean; org: TeamDetail["org"]; onClose: () => void; onDone: (m: string) => void }) {
  const to = !org.pilotFree;
  return (
    <ConfirmDialog
      open={open}
      danger={!to}
      title={to ? "Make this a free pilot?" : "End the free pilot?"}
      confirmLabel={to ? "Make it a free pilot" : "End the free pilot"}
      onClose={onClose}
      onDone={onDone}
      run={async () => {
        await api.post(`/admin/milesheet/teams/${org.id}/pilot`, { pilotFree: to });
        return to ? "Now a free pilot." : "Free pilot ended.";
      }}
    >
      {to ? (
        <p className="adm-text">Everyone active in {org.name} gets Pro through the team for free. Seat billing stops syncing while it is a pilot.</p>
      ) : (
        <p className="adm-text">
          {org.stripeSubscriptionId
            ? `${org.name} has a Stripe subscription, so its members keep team Pro and seats start syncing to Stripe again.`
            : `${org.name} has no Stripe subscription, so every member who has no Pro of their own loses it straight away.`}
        </p>
      )}
      {org.stripeSubscriptionId && (
        <Notice tone="warn" title="This team has a Stripe subscription">
          {to
            ? "Making it a pilot does not cancel the subscription: they would keep being charged for a free pilot. Cancel it in Stripe if that is the intent."
            : "Check the subscription is active in Stripe before ending the pilot."}
        </Notice>
      )}
    </ConfirmDialog>
  );
}

// ── Move a person into this team ─────────────────────────────────────────

export function MoveDialog({ open, org, onClose, onDone }: { open: boolean; org: TeamDetail["org"]; onClose: () => void; onDone: (m: string) => void }) {
  const [who, setWho] = useState("");
  const [role, setRole] = useState<"driver" | "admin">("driver");
  const [deleteEmptied, setDeleteEmptied] = useState(false);
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWho("");
    setRole("driver");
    setDeleteEmptied(false);
    setPreview(null);
    setError(null);
  }, [open]);

  const body = (del: boolean) => {
    const v = who.trim();
    return { ...(v.includes("@") ? { email: v } : { userId: v }), role, deleteEmptiedTeams: del };
  };

  const runPreview = async (del = deleteEmptied) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ data: MovePreview }>(`/admin/milesheet/teams/${org.id}/move/preview`, body(del));
      setPreview(r.data);
    } catch (e) {
      setPreview(null);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ data: { deletedOrgIds: string[] } }>(`/admin/milesheet/teams/${org.id}/move`, { ...body(deleteEmptied), planKey: preview.planKey });
      onDone(`${preview.person.email} is now an active ${roleLabel(role).toLowerCase()} of ${org.name}.${r.data.deletedOrgIds.length ? ` ${r.data.deletedOrgIds.length} emptied team deleted.` : ""}`);
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const plan = preview?.plan;
  const canApply = !!plan && plan.blockers.length === 0 && !busy;
  const anyDeletable = plan?.emptiedTeams.some((t) => t.deletable) ?? false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      wide
      danger={!!plan && (plan.deactivate.length > 0 || plan.emptiedTeams.some((t) => t.willDelete))}
      title={`Move someone into ${org.name}`}
      footer={
        <>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="adm-btn" onClick={() => runPreview()} disabled={busy || !who.trim()}>
            {busy && !preview ? <><Spinner /> Checking</> : preview ? "Check again" : "Preview the move"}
          </button>
          <button type="button" className="adm-btn adm-btn--danger" onClick={apply} disabled={!canApply}>
            {busy && preview ? <><Spinner /> Moving</> : "Make these changes"}
          </button>
        </>
      }
    >
      <div className="adm-form">
        <TextInput
          label="Email or user id"
          hint="They must already have a MileClear account. For someone new, the team's manager invites them from the portal."
          value={who}
          onChange={(e) => {
            setWho(e.target.value);
            setPreview(null);
          }}
          placeholder="name@company.co.uk"
        />
        <ChoiceChips
          label="Role in this team"
          value={role}
          onChange={(v) => {
            setRole(v);
            setPreview(null);
          }}
          options={[
            { value: "driver", label: "Driver" },
            { value: "admin", label: "Manager" },
          ]}
        />
      </div>

      {plan && preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s3)" }}>
          <p className="adm-text">
            <strong>{preview.person.email}</strong>
            {preview.person.displayName ? ` (${preview.person.displayName})` : ""}. What changes:
          </p>
          <ul className="adm-text" style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {plan.target.action === "create" && <li>New active {roleLabel(role).toLowerCase()} membership in {org.name}.</li>}
            {plan.target.action === "update" && plan.target.from && (
              <li>
                Their {plan.target.from.status} {roleLabel(plan.target.from.role).toLowerCase()} row in {org.name} becomes an active {roleLabel(role).toLowerCase()}.
              </li>
            )}
            {plan.target.action === "none" && <li>Already active in {org.name} with that role.</li>}
            {plan.deactivate.map((d) => (
              <li key={d.membershipId}>
                Switched off in <strong>{d.orgName}</strong> (was an active {roleLabel(d.role).toLowerCase()}).
              </li>
            ))}
            {plan.cancelInvites.map((c) => (
              <li key={c.membershipId}>Open invite to {c.orgName} cancelled.</li>
            ))}
            {plan.emptiedTeams
              .filter((t) => t.willDelete)
              .map((t) => (
                <li key={t.orgId}>
                  <strong>{t.orgName}</strong> deleted ({t.otherMemberships} other row{t.otherMemberships === 1 ? "" : "s"} go with it
                  {t.approvalsMoved ? `, ${t.approvalsMoved} of their monthly approvals move across` : ""}
                  {t.approvalsLost ? `, ${t.approvalsLost} approval${t.approvalsLost === 1 ? "" : "s"} lost` : ""}).
                </li>
              ))}
          </ul>
          {anyDeletable && (
            <Checkbox
              checked={deleteEmptied}
              onChange={(v) => {
                setDeleteEmptied(v);
                void runPreview(v);
              }}
              disabled={busy}
            >
              Also delete the team they leave, as nobody active will be left in it
            </Checkbox>
          )}
          {plan.blockers.map((b) => (
            <Notice key={b} tone="bad" title="Can't do this yet">
              {b}
            </Notice>
          ))}
          {plan.warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
        </div>
      )}
      {error && <Notice tone="bad" title="That didn't work">{error}</Notice>}
    </Dialog>
  );
}

// ── Merge another team into this one ────────────────────────────────────

export function MergeDialog({
  open,
  org,
  suggestedSourceId,
  onClose,
  onDone,
}: {
  open: boolean;
  org: TeamDetail["org"];
  suggestedSourceId: string | null;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const teams = useAdminData<MilesheetJourney>(open ? "/admin/milesheet/journey" : null);
  const [sourceId, setSourceId] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSourceId(suggestedSourceId ?? "");
    setPreview(null);
    setError(null);
  }, [open, suggestedSourceId]);

  const options = [
    { value: "", label: "Pick the team to merge in" },
    ...(teams.data?.teams ?? [])
      .filter((t) => t.orgId !== org.id)
      .map((t) => ({ value: t.orgId, label: `${t.name} (${t.orgId.slice(0, 8)})` })),
  ];

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ data: MergePreview }>(`/admin/milesheet/teams/${org.id}/merge/preview`, { sourceOrgId: sourceId });
      setPreview(r.data);
    } catch (e) {
      setPreview(null);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/milesheet/teams/${org.id}/merge`, { sourceOrgId: sourceId, planKey: preview.planKey });
      onDone(`${preview.source.name} merged into ${org.name} and deleted.`);
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const plan = preview?.plan;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      wide
      danger={!!plan}
      title={`Merge another team into ${org.name}`}
      footer={
        <>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="adm-btn" onClick={runPreview} disabled={busy || !sourceId}>
            {busy && !preview ? <><Spinner /> Checking</> : preview ? "Check again" : "Preview the merge"}
          </button>
          <button type="button" className="adm-btn adm-btn--danger" onClick={apply} disabled={!plan || plan.blockers.length > 0 || busy}>
            {busy && preview ? <><Spinner /> Merging</> : "Merge and delete the other team"}
          </button>
        </>
      }
    >
      <SelectInput
        label="Team to merge in (it is deleted afterwards)"
        hint={`Its people and monthly approvals move into ${org.name}. ${org.name} keeps its name, billing and settings.`}
        options={options}
        value={sourceId}
        onChange={(e) => {
          setSourceId(e.target.value);
          setPreview(null);
        }}
        disabled={teams.loading && !teams.data}
      />
      {teams.error && <Notice tone="bad">Couldn&apos;t load the list of teams: {teams.error}</Notice>}

      {plan && preview && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s3)" }}>
          <p className="adm-text">
            Merging <strong>{preview.source.name}</strong> into <strong>{preview.target.name}</strong>:
          </p>
          <ul className="adm-text" style={{ margin: 0, paddingLeft: "1.2rem" }}>
            <li>
              {plan.move.length} membership{plan.move.length === 1 ? "" : "s"} move across
              {plan.move.length > 0 ? `: ${plan.move.map((m) => `${m.email} (${m.status} ${roleLabel(m.role).toLowerCase()})`).join(", ")}` : ""}.
            </li>
            {plan.conflicts.map((c) => (
              <li key={c.sourceMembershipId}>
                {c.email} is in both: keeps the {c.keep === "source" ? `${c.source.status} row from ${preview.source.name}` : `${c.target.status} row already here`}, as {roleLabel(c.resultRole).toLowerCase()}.
              </li>
            ))}
            <li>
              Monthly approvals: {plan.approvalsMove.length} move, {plan.approvalsReplace.length} replace a pending one here, {plan.approvalsDrop.length} dropped.
            </li>
            <li>
              {preview.target.name} ends with {plan.occupiedAfter} member{plan.occupiedAfter === 1 ? "" : "s"} or open invites.
            </li>
            <li>{preview.source.name} is deleted.</li>
          </ul>
          {plan.blockers.map((b) => (
            <Notice key={b} tone="bad" title="Can't merge">
              {b}
            </Notice>
          ))}
          {plan.warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
          <p className="adm-note">This cannot be undone from here. Every change is recorded in the timeline.</p>
        </div>
      )}
      {error && <Notice tone="bad" title="That didn't work">{error}</Notice>}
    </Dialog>
  );
}
