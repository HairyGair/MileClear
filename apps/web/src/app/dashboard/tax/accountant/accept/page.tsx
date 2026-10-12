"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Icon,
  PageHeader,
  SettingsGroup,
  Skeleton,
  StatusChip,
  ToggleRow,
  useToast,
} from "@/components/dashboard/kit";
import { PracticeMark } from "@/components/practice/PracticeMark";
import { dayMonth, errorText, papi, PracticeError, type DriverLink, type PracticeForDriver } from "@/lib/practice";
import "@/components/dashboard/tax/tax.css";
import "@/app/practice/practice.css";

// The consent screen on the web (SPEC-UX 2.1, SPEC-VISUAL 6.7). Nothing is
// shared until the driver presses "Share with <firm>" here or in the app.

interface Lookup {
  isEmployee: boolean;
  link: DriverLink | null;
  practice?: PracticeForDriver;
  endsAt?: string;
}

export default function AcceptPage() {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState<string | null>(null);
  const [data, setData] = useState<Lookup | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [earnings, setEarnings] = useState(true);
  const [expenses, setExpenses] = useState(true);
  const [personal, setPersonal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const linkId = sp.get("linkId");
    const invite = sp.get("invite");
    const code = sp.get("code");
    const q = linkId ? `linkId=${encodeURIComponent(linkId)}` : invite ? `invite=${encodeURIComponent(invite)}` : code ? `code=${encodeURIComponent(code)}` : null;
    setQuery(q);
    if (!q) {
      setProblem("This request is not recognised.");
      return;
    }
    papi
      .get<Lookup>(`/practice-links/lookup?${q}`)
      .then((d) => {
        setData(d);
        if (d.link) {
          setEarnings(d.link.shareEarnings);
          setExpenses(d.link.shareExpenses);
          setPersonal(d.link.sharePersonalTrips);
        }
      })
      .catch((e: unknown) => setProblem(e instanceof PracticeError ? e.message : errorText(e)));
  }, []);

  const practice = data?.link?.practice ?? data?.practice ?? null;
  const state = data?.link?.state ?? null;
  const endsAt = data?.link?.endsAt ?? data?.endsAt ?? null;
  const codeParam = query?.startsWith("code=") ? decodeURIComponent(query.slice(5)) : null;

  async function share() {
    if (!data || !practice) return;
    setSharing(true);
    try {
      const r = await papi.post<{ state: string; practiceName: string }>("/practice-links/consent", {
        ...(data.link ? { linkId: data.link.id } : { code: codeParam }),
        shareEarnings: data.isEmployee ? false : earnings,
        shareExpenses: expenses,
        sharePersonalTrips: personal,
      });
      toast.show(
        r.state === "sharing"
          ? `Shared with ${r.practiceName}. You can see what they look at in Your accountant.`
          : `We've asked ${r.practiceName} to accept you. Nothing is shared until they do.`
      );
      router.push("/dashboard/tax/accountant");
    } catch (e) {
      toast.show(errorText(e, "Couldn't share. Try again."), "error");
    } finally {
      setSharing(false);
    }
  }

  let body: React.ReactNode;
  if (problem) {
    body = <EmptyState size="card" icon="close-circle-outline" title={problem} body="Ask your accountant to send a new one." action={{ label: "Your accountant", href: "/dashboard/tax/accountant" }} />;
  } else if (!data || !practice) {
    body = <Skeleton variant="row" count={4} />;
  } else if (state === "asking_expired") {
    body = <EmptyState size="card" icon="time-outline" title="This request has expired." body="Ask your accountant to send a new one." />;
  } else if (state === "sharing" || state === "paused") {
    body = <EmptyState size="card" icon="checkmark-circle-outline" title={`You already share with ${practice.name}.`} action={{ label: "Your accountant", href: "/dashboard/tax/accountant" }} />;
  } else if (state === "waiting_for_practice") {
    body = <EmptyState size="card" icon="time-outline" title={`Waiting for ${practice.name} to accept you.`} body="Nothing is shared until they do." />;
  } else {
    body = (
      <div className="pc-form">
        <Card>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <PracticeMark initials={practice.initials} logoPath={practice.logoPath} size={52} name={practice.name} />
            <div>
              <p style={{ fontWeight: 700, fontSize: 18 }}>{practice.name}</p>
              <p className="pc-muted" style={{ fontSize: 14 }}>{[practice.contactName, practice.professionalBody].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          {!practice.checked && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--mc-hairline)" }}>
              <StatusChip tone="outline" icon="help-circle-outline" label="Not checked yet" />
              <p className="pc-muted" style={{ fontSize: 12, marginTop: 6 }}>We haven&apos;t checked this practice yet. Only share if you know them.</p>
            </div>
          )}
        </Card>

        <SettingsGroup
          title="They'll be able to see"
          footer={personal ? "Turn on if your accountant works out your business-use percentage. They'll see dates, miles and places." : "Personal trips stay private unless you turn them on."}
        >
          <div className="mc-row">
            <span className="mc-row__icon"><Icon name="car-outline" size={18} /></span>
            <span className="mc-row__text"><span className="mc-row__label">Business trips</span></span>
            <span className="mc-row__right">Always</span>
          </div>
          {!data.isEmployee && <ToggleRow label="Earnings" checked={earnings} onChange={setEarnings} />}
          <ToggleRow label="Expenses" checked={expenses} onChange={setExpenses} />
          <div className="mc-row">
            <span className="mc-row__icon"><Icon name="briefcase-outline" size={18} /></span>
            <span className="mc-row__text"><span className="mc-row__label">Vehicles and mileage claim</span></span>
            <span className="mc-row__right">Always</span>
          </div>
          <ToggleRow label="Personal trips" checked={personal} onChange={setPersonal} />
        </SettingsGroup>

        <div>
          <p className="mc-group__title">They can&apos;t</p>
          <p className="pc-muted" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <Icon name="lock-closed-outline" size={16} /> Change or delete anything
          </p>
          <p className="pc-muted" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, marginTop: 4 }}>
            <Icon name="lock-closed-outline" size={16} /> See where you went on personal trips
          </p>
        </div>

        <p className="pc-muted" style={{ fontSize: 13 }}>
          {endsAt ? `Until ${dayMonth(endsAt, true)}. We'll ask you before it ends.` : "We'll ask you before it ends."} Stop any time in Your accountant.
        </p>

        <Button variant="primary" size="lg" fullWidth loading={sharing} onClick={() => void share()}>
          {`Share with ${practice.name}`}
        </Button>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <Button variant="ghost" href="/dashboard/tax/accountant">
            Not now
          </Button>
          {data.link && (
            <button type="button" className="mc-textlink" style={{ color: "var(--mc-text-2)" }} onClick={() => setReporting(true)}>
              Don&apos;t know them? Report this
            </button>
          )}
        </div>
        {data.link && (
          <ConfirmDialog
            open={reporting}
            title="Report this request?"
            body="We'll end the request and look at this practice. Nothing has been shared."
            confirmLabel="Report"
            destructive
            onClose={() => setReporting(false)}
            onConfirm={async () => {
              await papi.post(`/practice-links/${data.link!.id}/report`, {});
              toast.show("Reported. Thanks, we'll look into it.");
              router.push("/dashboard/tax/accountant");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Share with your accountant" back={{ href: "/dashboard/tax/accountant", label: "Your accountant" }} />
      <div className="mc-narrow" style={{ margin: "0 auto" }}>{body}</div>
    </>
  );
}
