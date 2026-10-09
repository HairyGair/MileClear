"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BillingStatus } from "@mileclear/shared";
import {
  Button,
  Card,
  CardError,
  ConfirmDialog,
  Icon,
  PageHeader,
  Skeleton,
  StatusChip,
  formatDay,
  useData,
  useMe,
  useToast,
} from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { proReasonTitle } from "@/lib/dashboard";
import { errMsg, unwrap } from "@/components/dashboard/settings/util";
import styles from "@/components/dashboard/settings/settings.module.css";

// Your plan: the one upgrade page. ?reason= only changes the headline.
function PlanPage() {
  const params = useSearchParams();
  const reason = params?.get("reason");
  const { isPro, premiumSource, team, user, refresh } = useMe();
  const { show } = useToast();

  const status = useData<BillingStatus>(
    "billing-status",
    async () => unwrap<BillingStatus>(await api.get<unknown>("/billing/status")),
    { revalidateOnFocus: true }
  );
  const emsee = useData("assistant-status", () => api.get<{ available?: boolean }>("/assistant/status"));

  // Back from Stripe: the status refetches on focus. Say so once.
  const wasFree = useRef<boolean | null>(null);
  useEffect(() => {
    if (!status.data) return;
    const nowPro = status.data.isPremium;
    if (wasFree.current === null) {
      wasFree.current = !nowPro;
      return;
    }
    if (wasFree.current && nowPro) {
      wasFree.current = false;
      show("You're on Pro");
      void refresh();
    }
  }, [status.data, show, refresh]);

  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  async function upgrade() {
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const res = await api.post<unknown>("/billing/checkout");
      const url = unwrap<{ url?: string }>(res)?.url;
      if (!url) throw new Error("no url");
      window.location.href = url;
    } catch {
      setUpgradeError("Couldn't open checkout. Try again in a moment.");
      setUpgrading(false);
    }
  }

  const [cancelOpen, setCancelOpen] = useState(false);

  const list = [
    "Tax exports: Self Assessment PDF, trip report, CSV, odometer log",
    "Mileage certificate",
    "Unlimited vehicles and saved places",
    "Earnings import from CSV and your bank",
    "Business insights and trends",
    "Ticket defender",
    "Share your records with your accountant",
    "Invoice PDFs, emails and reminders",
    ...(emsee.data?.available === true ? ["EmSee"] : []),
  ];

  const b = status.data;
  const platform = b?.subscriptionPlatform ?? "none";
  const periodEnd = b?.currentPeriodEnd ?? b?.premiumExpiresAt ?? null;
  const bySource = premiumSource === "referral" || premiumSource === "partner";
  const referralEnd = b?.referralProUntil ?? user?.referralProUntil ?? null;

  const everything = (
    <Card title="Everything in Pro">
      <ul className={styles.planList}>
        {list.map((t) => (
          <li key={t}>
            <Icon name="checkmark-circle" size={20} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </Card>
  );

  const upgradeBlock = (
    <div className={styles.fields}>
      <p className={styles.price}>£4.99 a month. Cancel any time.</p>
      {upgradeError && <p className={styles.inlineError} role="alert">{upgradeError}</p>}
      <div className={styles.actions}>
        <Button variant="primary" loading={upgrading} onClick={() => void upgrade()}>
          Upgrade to Pro
        </Button>
        <Button variant="link" href="/dashboard/invite">Or earn free months by inviting friends</Button>
      </div>
    </div>
  );

  let body: React.ReactNode;
  if (status.loading && !b) {
    body = <Skeleton variant="card" count={2} />;
  } else if (status.error && !b) {
    body = <CardError onRetry={status.reload} />;
  } else if (isPro && premiumSource === "team") {
    body = (
      <Card>
        <div className={styles.fields}>
          <StatusChip tone="green" label="Pro" />
          <p className={styles.lead}>Pro through {team?.orgName ?? "your company"}. Your company pays.</p>
        </div>
      </Card>
    );
  } else if (isPro && (platform === "apple" || platform === "google")) {
    body = (
      <Card>
        <div className={styles.fields}>
          <StatusChip tone="green" label="Pro" />
          <p className={styles.lead}>
            You pay through {platform === "apple" ? "the App Store" : "Google Play"}. Manage it on your phone.
          </p>
          {periodEnd && <p className={styles.muted}>Paid until {formatDay(periodEnd)}.</p>}
        </div>
      </Card>
    );
  } else if (isPro && platform === "stripe") {
    const cancelled = !!b?.cancelAtPeriodEnd;
    body = (
      <Card>
        <div className={styles.fields}>
          <StatusChip tone="green" label="Pro" />
          <p className={styles.lead}>
            {periodEnd
              ? cancelled
                ? `Pro until ${formatDay(periodEnd)} (cancelled)`
                : `Pro, renews ${formatDay(periodEnd)}`
              : "Pro"}
          </p>
          {!cancelled && (
            <div className={styles.actions}>
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>Cancel subscription</Button>
            </div>
          )}
        </div>
      </Card>
    );
  } else if (isPro && bySource) {
    body = (
      <>
        <Card>
          <div className={styles.fields}>
            <StatusChip tone="green" label="Pro" />
            <p className={styles.lead}>
              {referralEnd ? `Pro free until ${formatDay(referralEnd)}.` : "Pro is free for you for now."}
            </p>
            <p className={styles.muted}>Upgrade now and Pro carries on after that.</p>
          </div>
        </Card>
        {upgradeBlock}
      </>
    );
  } else if (isPro) {
    body = (
      <Card>
        <div className={styles.fields}>
          <StatusChip tone="green" label="Pro" />
          <p className={styles.lead}>You&apos;re on Pro.</p>
        </div>
      </Card>
    );
  } else {
    body = (
      <>
        <h2 className={styles.h2}>{proReasonTitle(reason)}</h2>
        {upgradeBlock}
        {everything}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Your plan" back={{ href: "/dashboard/settings", label: "Settings" }} />
      <div className={styles.page}>{body}</div>
      <ConfirmDialog
        open={cancelOpen}
        title="Cancel your subscription?"
        body="You keep Pro until the end of the period you've paid for. After that you're on the free plan."
        confirmLabel="Cancel subscription"
        destructive
        onClose={() => setCancelOpen(false)}
        onConfirm={async () => {
          try {
            await api.post("/billing/cancel");
          } catch (e) {
            throw new Error(errMsg(e, "Couldn't cancel. Try again in a moment."));
          }
          status.reload();
          show("Subscription cancelled");
        }}
      />
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PlanPage />
    </Suspense>
  );
}
