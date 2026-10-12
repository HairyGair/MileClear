"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  Icon,
  MoneyField,
  PageHeader,
  SettingsGroup,
  Skeleton,
  StatusChip,
  TextField,
  ToggleRow,
  useData,
  useMe,
  useToast,
} from "@/components/dashboard/kit";
import { messageOf, shortDateYear } from "@/components/dashboard/tax/tax-utils";
import { PracticeMark } from "@/components/practice/PracticeMark";
import { requestActionLabel, PRACTICE_REPLY_MAX } from "@mileclear/shared";
import {
  dayMonth,
  errorText,
  papi,
  type DriverLink,
  type DriverPractice,
  type PracticeRequestRow,
} from "@/lib/practice";
import "@/components/dashboard/tax/tax.css";
import "@/app/practice/practice.css";

// More > Your accountant, on the web (SPEC-UX 2.5). Sharing with an
// accountant is free for every driver. The driver sees what the practice can
// see, every look and download, and can change it or stop at any time.

interface OldAccess {
  id: string;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string | null;
  source: "invite" | "access";
}

const REQUEST_HREF: Record<string, string> = {
  sort_trips: "/dashboard/trips?view=inbox",
  add_earnings: "/dashboard/earnings",
  add_expenses: "/dashboard/expenses",
  check_details: "/dashboard/vehicles",
  other: "/dashboard",
};

function useDriverPractice() {
  return useData<DriverPractice>("practice-links", () => papi.get<DriverPractice>("/practice-links"));
}

function FeeCard({ linked }: { linked: DriverLink | null }) {
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
        ...(linked
          ? {}
          : { accountantName: name.trim() || null, accountantContact: contact.trim() || null }),
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
    <Card title="Your accountant's fee">
      <form
        className="mc-tax-fields"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {linked ? (
          <p className="mc-tax-text">
            {linked.practice.name}
            {linked.practice.contactName ? `, ${linked.practice.contactName}` : ""}
          </p>
        ) : (
          <div className="mc-tax-fields mc-tax-fields--2">
            <TextField label="Name" value={name} onChange={setName} maxLength={120} autoComplete="off" />
            <TextField label="Email or phone" value={contact} onChange={setContact} maxLength={255} autoComplete="off" />
          </div>
        )}
        <MoneyField label="Annual fee" hint="We add a weekly share of the fee to your set-aside amount." value={fee} onChange={setFee} />
        {error && (
          <p className="mc-tax-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" variant="secondary" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LinkedCard({ link, isEmployee, onChange }: { link: DriverLink; isEmployee: boolean; onChange: () => void }) {
  const toast = useToast();
  const [stopping, setStopping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hideRenewal, setHideRenewal] = useState(false);
  const p = link.practice;

  async function setScope(k: "shareEarnings" | "shareExpenses" | "sharePersonalTrips", v: boolean) {
    setBusy(true);
    try {
      await papi.patch(`/practice-links/${link.id}/scopes`, {
        shareEarnings: link.shareEarnings,
        shareExpenses: link.shareExpenses,
        sharePersonalTrips: link.sharePersonalTrips,
        [k]: v,
      });
      onChange();
    } catch (e) {
      toast.show(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    setBusy(true);
    try {
      await papi.post(`/practice-links/${link.id}/keep-sharing`);
      toast.show("Sharing for another year");
      onChange();
    } catch (e) {
      toast.show(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const header = (
    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 12 }}>
      <PracticeMark initials={p.initials} logoPath={p.logoPath} size={48} name={p.name} />
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</p>
        <p className="pc-muted" style={{ fontSize: 13 }}>
          {[p.contactName, p.professionalBody].filter(Boolean).join(" · ")}
        </p>
      </div>
    </div>
  );

  if (link.state === "asking") {
    return (
      <Card tone="amber">
        {header}
        {!p.checked && <p style={{ marginBottom: 8 }}><StatusChip tone="outline" icon="help-circle-outline" label="Not checked yet" /></p>}
        <p className="mc-tax-text" style={{ marginBottom: 12 }}>
          {p.name} would like to see your records. Nothing is shared until you say yes.
        </p>
        <Button variant="primary" href={`/dashboard/tax/accountant/accept?linkId=${link.id}`}>
          Review
        </Button>
      </Card>
    );
  }

  if (link.state === "waiting_for_practice") {
    return (
      <Card>
        {header}
        <p className="mc-tax-text">
          {link.awaitingSignup
            ? "We've emailed them an invite to MileClear. It's free for accountants. You'll see them here when they join."
            : `We've asked ${p.name} to accept you. Nothing is shared until they do.`}
        </p>
        <div style={{ marginTop: 12 }}>
          <Button variant="ghost" size="sm" onClick={() => setStopping(true)}>
            Cancel
          </Button>
        </div>
        <ConfirmDialog
          open={stopping}
          title="Cancel this request?"
          body="Nothing has been shared yet."
          confirmLabel="Cancel request"
          destructive
          onClose={() => setStopping(false)}
          onConfirm={async () => {
            await papi.post(`/practice-links/${link.id}/stop`);
            onChange();
          }}
        />
      </Card>
    );
  }

  if (link.state === "ended" || link.state === "stopped") {
    return (
      <Card>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <PracticeMark initials={p.initials} logoPath={p.logoPath} size={32} />
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600 }}>
              {link.state === "stopped"
                ? `You stopped sharing with ${p.name}${link.endedAt ? ` on ${dayMonth(link.endedAt)}` : ""}.`
                : `Sharing with ${p.name} ended${link.endedAt ? ` on ${dayMonth(link.endedAt)}` : ""}.`}
            </p>
            <p className="pc-muted" style={{ fontSize: 13 }}>They can&apos;t see anything new.</p>
          </div>
          {p.id && (
            <Button variant="link" href={`/dashboard/tax/accountant/accept?linkId=${link.id}`}>
              Share again
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <>
      {link.renewalDue && !hideRenewal && link.endsAt && (
        <Card tone="amber">
          <p style={{ fontWeight: 700, marginBottom: 4 }}>Keep sharing with {p.name}?</p>
          <p className="mc-tax-text" style={{ marginBottom: 12 }}>
            Sharing ends on {dayMonth(link.endsAt)}. Keep it going for another year.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <Button variant="primary" loading={busy} onClick={() => void keep()}>
              Keep sharing
            </Button>
            <Button variant="ghost" onClick={() => setHideRenewal(true)}>
              Stop on {dayMonth(link.endsAt)}
            </Button>
          </div>
        </Card>
      )}
      <Card>
        {header}
        <p style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          {link.state === "paused" ? (
            <>
              <StatusChip tone="neutral" label="Paused" />
              <span className="pc-muted" style={{ fontSize: 13 }}>{p.name}&apos;s account is paused. Nothing is being shared.</span>
            </>
          ) : (
            <>
              <StatusChip tone="green" icon="checkmark" label="Sharing" />
              {link.endsAt && <span className="pc-muted" style={{ fontSize: 13 }}>Until {dayMonth(link.endsAt, true)}</span>}
            </>
          )}
        </p>
        <SettingsGroup title="What they can see" footer={link.sharePersonalTrips ? "Turn on if your accountant works out your business-use percentage. They see dates, miles and places." : "Personal trips stay private unless you turn them on."}>
          <div className="mc-row">
            <span className="mc-row__icon"><Icon name="car-outline" size={18} /></span>
            <span className="mc-row__text"><span className="mc-row__label">Business trips</span></span>
            <span className="mc-row__right">Always</span>
          </div>
          <div className="mc-row">
            <span className="mc-row__icon"><Icon name="briefcase-outline" size={18} /></span>
            <span className="mc-row__text"><span className="mc-row__label">Vehicles and mileage claim</span></span>
            <span className="mc-row__right">Always</span>
          </div>
          {!isEmployee && <ToggleRow label="Earnings" checked={link.shareEarnings} disabled={busy} onChange={(v) => void setScope("shareEarnings", v)} />}
          <ToggleRow label="Expenses" checked={link.shareExpenses} disabled={busy} onChange={(v) => void setScope("shareExpenses", v)} />
          <ToggleRow label="Personal trips" checked={link.sharePersonalTrips} disabled={busy} onChange={(v) => void setScope("sharePersonalTrips", v)} />
        </SettingsGroup>
        <Button variant="destructive" icon="close" onClick={() => setStopping(true)}>
          {`Stop sharing with ${p.name}`}
        </Button>
        <p className="pc-muted" style={{ fontSize: 13, marginTop: 8 }}>
          They won&apos;t see anything new. Anything they&apos;ve already downloaded stays with them.
        </p>
      </Card>
      <ConfirmDialog
        open={stopping}
        title={`Stop sharing with ${p.name}?`}
        body="They won't see anything new from now on. Anything they've already downloaded stays with them."
        confirmLabel="Stop sharing"
        destructive
        onClose={() => setStopping(false)}
        onConfirm={async () => {
          await papi.post(`/practice-links/${link.id}/stop`);
          toast.show("Stopped sharing");
          onChange();
        }}
      />
    </>
  );
}

function RequestCard({ r, onChange }: { r: PracticeRequestRow & { practiceName: string }; onChange: () => void }) {
  const toast = useToast();
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  if (r.status === "done") {
    return (
      <Card>
        <p style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
          <Icon name="checkmark-circle" size={20} className="mc-toast__icon--ok" />
          Done. {r.practiceName} can see it.
        </p>
      </Card>
    );
  }

  async function post(path: string, body?: unknown, ok?: string) {
    setBusy(true);
    try {
      await papi.post(path, body);
      if (ok) toast.show(ok);
      setReplying(false);
      setText("");
      onChange();
    } catch (e) {
      toast.show(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ borderColor: "var(--mc-amber-glow)" }}>
      <p className="pc-muted" style={{ fontSize: 13 }}>Asked by {r.practiceName}</p>
      <p style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 700, fontSize: 16, margin: "4px 0" }}>
        <Icon name="document-text-outline" size={20} />
        {r.title}
      </p>
      {r.note && <p style={{ fontSize: 14 }}>&ldquo;{r.note}&rdquo;{r.dueDate ? ` Due ${dayMonth(r.dueDate)}.` : ""}</p>}
      {!r.note && r.dueDate && <p className="pc-muted" style={{ fontSize: 14 }}>Due {dayMonth(r.dueDate)}</p>}
      {r.driverReply && <p className="pc-muted" style={{ fontSize: 13, marginTop: 4 }}>You replied: &ldquo;{r.driverReply}&rdquo;</p>}
      {replying ? (
        <form
          style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void post(`/practice-links/requests/${r.id}/reply`, { text: text.trim() }, "Reply sent");
          }}
        >
          <input className="mc-input" style={{ flex: 1, minWidth: 200 }} maxLength={PRACTICE_REPLY_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="One line back to your accountant" aria-label="Reply" />
          <Button type="submit" variant="secondary" loading={busy} disabled={!text.trim()}>
            Send
          </Button>
        </form>
      ) : (
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 12 }}>
          <Button variant="primary" size="sm" href={REQUEST_HREF[r.type] ?? "/dashboard"}>
            {requestActionLabel(r.type)}
          </Button>
          <button type="button" className="mc-textlink" style={{ color: "var(--mc-text-2)" }} onClick={() => setReplying(true)}>
            Reply
          </button>
          <button type="button" className="mc-textlink" style={{ color: "var(--mc-text-2)" }} disabled={busy} onClick={() => void post(`/practice-links/requests/${r.id}/done`, undefined, "Marked as done")}>
            Done
          </button>
        </div>
      )}
    </Card>
  );
}

function AccessLog({ first }: { first: DriverPractice["log"] }) {
  const [more, setMore] = useState<DriverPractice["log"]>([]);
  const [done, setDone] = useState(first.length < 10);
  const [loading, setLoading] = useState(false);
  const all = [...first, ...more];

  async function loadMore() {
    const last = all[all.length - 1];
    if (!last) return;
    setLoading(true);
    try {
      const rows = await papi.get<DriverPractice["log"]>(`/practice-links/log?before=${encodeURIComponent(last.at)}`);
      setMore((m) => [...m, ...rows]);
      if (rows.length < 50) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  const icon = (a: string) =>
    a.startsWith("exported") ? "download-outline" : a === "sent_request" ? "paper-plane-outline" : a === "started_sharing" ? "checkmark" : a === "kept_sharing" ? "refresh-outline" : a === "stopped_sharing" ? "close" : a === "changed_sharing" ? "create-outline" : "eye-outline";

  return (
    <SettingsGroup title="What they've looked at">
      {all.length === 0 && <div className="mc-row"><span className="pc-muted" style={{ fontSize: 14 }}>They haven&apos;t looked yet.</span></div>}
      {all.map((l) => (
        <div className="mc-row" key={l.id}>
          <span className="mc-row__icon"><Icon name={icon(l.action)} size={18} /></span>
          <span className="mc-row__text">
            <span className="mc-row__label">{l.sentence}</span>
            <span className="mc-row__hint">
              {dayMonth(l.at, true)}, {new Date(l.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}
            </span>
          </span>
        </div>
      ))}
      {!done && all.length >= 10 && (
        <div className="mc-row" style={{ justifyContent: "center" }}>
          <button type="button" className="mc-textlink" disabled={loading} onClick={() => void loadMore()}>
            {loading ? "Loading..." : "See all"}
          </button>
        </div>
      )}
    </SettingsGroup>
  );
}

function InviteCard({ onChange }: { onChange: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await papi.post<{ outcome: string; practiceName?: string; linkId?: string }>("/practice-links/invite", { value: value.trim() });
      if (r.outcome === "practice_asked_you" && r.linkId) {
        window.location.href = `/dashboard/tax/accountant/accept?linkId=${r.linkId}`;
        return;
      }
      const text =
        r.outcome === "emailed_accountant"
          ? "We've emailed them an invite to MileClear. It's free for accountants."
          : r.outcome === "already_sharing"
            ? `You already share with ${r.practiceName}.`
            : `${r.practiceName} uses MileClear. We've asked them to accept you.`;
      setMsg(text);
      toast.show(text);
      setValue("");
      onChange();
    } catch (e) {
      setMsg(errorText(e, "Couldn't send. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mc-empty mc-empty--card" style={{ paddingBottom: 8 }}>
        <span className="mc-empty__icon" aria-hidden="true">
          <Icon name="people-outline" size={24} />
        </span>
        <h2 className="mc-empty__title">Share your records with your accountant</h2>
        <p className="mc-empty__body">Your accountant sees your business trips, earnings and expenses. Read only. You can stop any time.</p>
      </div>
      <form
        className="pc-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) void send();
        }}
      >
        <TextField label="Their email or practice code" value={value} onChange={setValue} autoComplete="off" maxLength={255} />
        <Button type="submit" variant="primary" fullWidth loading={busy} disabled={!value.trim()}>
          Send
        </Button>
        {msg && <p className="pc-muted" role="status">{msg}</p>}
      </form>
      <p className="pc-muted" style={{ fontSize: 13, marginTop: 12 }}>
        Free for every driver. Your accountant gets a free practice account if they don&apos;t have one.
      </p>
    </Card>
  );
}

function OldLinks() {
  const toast = useToast();
  const [revoking, setRevoking] = useState<OldAccess | null>(null);
  const { data, reload } = useData<OldAccess[]>("accountant-access", () =>
    api.get<{ data: OldAccess[] }>("/accountant/access").then((r) => r.data)
  );
  const live = (data ?? []).filter(
    (a) => (a.status === "accepted" || a.status === "pending") && (!a.expiresAt || new Date(a.expiresAt).getTime() > Date.now())
  );
  if (live.length === 0) return null;
  return (
    <SettingsGroup title="Old accountant links" footer="These links work until they end or you revoke them. Your accountant can move you to their practice account, and you'll be asked to say yes first.">
      {live.map((a) => (
        <div className="mc-row" key={a.id}>
          <span className="mc-row__icon"><Icon name="link-outline" size={18} /></span>
          <span className="mc-row__text">
            <span className="mc-row__label">{a.email}</span>
            <span className="mc-row__hint">
              {a.status === "pending" ? "Invited, not opened" : `Old link${a.expiresAt ? `, ends ${shortDateYear(a.expiresAt)}` : ""}`}
            </span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => setRevoking(a)} aria-label={`Revoke access for ${a.email}`}>
            Revoke
          </Button>
        </div>
      ))}
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
    </SettingsGroup>
  );
}

export default function AccountantPage() {
  const { user } = useMe();
  const { data, error, loading, reload } = useDriverPractice();
  const links = data?.links ?? [];
  const live = links.find((l) => l.state === "sharing" || l.state === "paused") ?? null;
  const showInvite = !links.some((l) => ["sharing", "paused", "waiting_for_practice", "asking"].includes(l.state));

  return (
    <>
      <PageHeader title="Your accountant" back={{ href: "/dashboard/tax", label: "Tax" }} />
      <div className="mc-tax-page">
        {loading && !data && <Skeleton variant="card" count={2} />}
        {error && !data && <ErrorState title="Couldn't load" body="Check your connection and try again." onRetry={reload} size="card" />}
        {data && (
          <>
            {links.map((l) => (
              <LinkedCard key={l.id} link={l} isEmployee={data.isEmployee} onChange={reload} />
            ))}
            {data.requests.length > 0 && (
              <div className="mc-stack mc-stack--tight">
                {data.requests.map((r) => (
                  <RequestCard key={r.id} r={r} onChange={reload} />
                ))}
              </div>
            )}
            {links.some((l) => l.state !== "asking" && l.state !== "waiting_for_practice") && <AccessLog first={data.log} />}
            {showInvite && <InviteCard onChange={reload} />}
          </>
        )}
        <OldLinks />
        {user && <FeeCard linked={live} />}
      </div>
    </>
  );
}
