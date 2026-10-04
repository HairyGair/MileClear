// Shared words and badges for the admin Milesheet pages.

import { Badge, type Tone } from "@/components/admin/ui";
import type { AttentionKind, InviteState, TeamFlag, TeamSource } from "./types";

export const MILESHEET_ROOT = "/dashboard/admin/milesheet";

export const SOURCE_LABEL: Record<TeamSource, string> = {
  nomination: "Driver nomination",
  self_serve: "Self-serve",
  admin: "Set up by us",
  unknown: "Not known",
};

export const FLAG_LABEL: Record<TeamFlag, { text: string; tone: Tone; title: string }> = {
  no_active_manager: { text: "No active manager", tone: "bad", title: "Nobody can run this team's portal" },
  duplicate: { text: "Possible duplicate", tone: "warn", title: "Same manager or a very similar name as another team" },
  stale_invites: { text: "Old invites", tone: "warn", title: "An invite sent more than 7 days ago is still not accepted" },
};

export const ATTENTION_LABEL: Record<AttentionKind, string> = {
  stale_invite: "Invite waiting over 7 days",
  no_active_manager: "No active manager",
  duplicate: "Possible duplicate team",
  month_not_approved: "Last month not approved",
  driver_no_trips: "Drivers with no trips this month",
  payment_failed: "Payment failed",
};

export function FlagBadges({ flags }: { flags: TeamFlag[] }) {
  if (flags.length === 0) return <span style={{ color: "var(--adm-text-3)" }}>None</span>;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "var(--adm-s1)" }}>
      {flags.map((f) => (
        <Badge key={f} tone={FLAG_LABEL[f].tone} title={FLAG_LABEL[f].title} dot>
          {FLAG_LABEL[f].text}
        </Badge>
      ))}
    </span>
  );
}

export function BillingBadge({ status }: { status: "pilot" | "paying" | "none" }) {
  if (status === "pilot") return <Badge tone="info">Free pilot</Badge>;
  if (status === "paying") return <Badge tone="good" dot>Paying</Badge>;
  return <Badge tone="neutral">Not paying</Badge>;
}

export function MemberStatusBadge({ status, inviteState }: { status: string; inviteState: InviteState }) {
  if (status === "active") return <Badge tone="good" dot>Active</Badge>;
  if (status === "disabled") return <Badge tone="neutral">Disabled</Badge>;
  if (inviteState === "expired") return <Badge tone="bad" dot>Invite expired</Badge>;
  if (inviteState === "waiting_on_manager") return <Badge tone="info">Waiting on manager</Badge>;
  return <Badge tone="warn" dot>Invited</Badge>;
}

export function roleLabel(role: string): string {
  return role === "admin" ? "Manager" : "Driver";
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRate(rate: number | null): string {
  return rate === null ? "-" : `${Math.round(rate * 100)}%`;
}

export function formatMiles(miles: number): string {
  return `${miles.toLocaleString("en-GB", { maximumFractionDigits: 1 })} mi`;
}

/** Plain-words line for a timeline event. */
export function eventLabel(type: string): string {
  const map: Record<string, string> = {
    "team.org_created": "Team set up by us",
    "team.self_serve_org_created": "Team set up by the manager",
    "team.manager_nominated": "Driver nominated their manager",
    "team.invites_sent": "Invites sent by the manager",
    "team.invite_accepted": "Invite accepted",
    "team.invite_cancelled": "Invite cancelled by the manager",
    "team.member_status_changed": "Member switched on or off",
    "team.month_approved": "Month approved",
    "team.month_queried": "Month queried",
    "team.export": "Payroll file downloaded",
    "team.checkout_created": "Started paying (checkout opened)",
    "team.billing_portal_opened": "Opened billing settings",
    "team.invites_bulk_resent": "Invites resent by us",
    "team.subscription_updated": "Subscription updated",
    "team.subscription_cancelled": "Subscription cancelled",
    "team.payment_failed": "Payment failed",
    "team.seats_synced": "Seats billed changed",
    "team.month_ready_email": "Month ready email sent",
    "admin.milesheet.resend_invite": "Admin: invite resent",
    "admin.milesheet.cancel_invite": "Admin: invite cancelled",
    "admin.milesheet.extend_invite": "Admin: invite extended",
    "admin.milesheet.move_person": "Admin: person moved in",
    "admin.milesheet.merge": "Admin: teams merged",
    "admin.milesheet.seat_cap": "Admin: member limit changed",
    "admin.milesheet.pilot": "Admin: free pilot switched",
  };
  return map[type] ?? type;
}
