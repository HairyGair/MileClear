"use client";

import { useState } from "react";
import type { ReferralSummary } from "@mileclear/shared";
import {
  Button,
  Card,
  CardError,
  Figure,
  PageHeader,
  Skeleton,
  TextField,
  formatDay,
  useData,
  useMe,
  useToast,
} from "@/components/dashboard/kit";
import { api } from "@/lib/api";
import { errMsg, unwrap } from "@/components/dashboard/settings/util";
import styles from "@/components/dashboard/settings/settings.module.css";

// Invite a friend: your code and link, how many joined, and a field for a friend's code.
export default function InvitePage() {
  const { show } = useToast();
  const { refresh } = useMe();
  const summary = useData<ReferralSummary>("referrals", async () => unwrap<ReferralSummary>(await api.get<unknown>("/referrals")));

  async function copy() {
    const url = summary.data?.shareUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      show("Link copied");
    } catch {
      show("Couldn't copy. Select the link and copy it.", "error");
    }
  }

  const [friendCode, setFriendCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  async function apply() {
    setApplying(true);
    setApplyError(null);
    try {
      await api.post("/referrals/apply", { code: friendCode.trim() });
      setFriendCode("");
      show("Code applied");
      summary.reload();
      void refresh();
    } catch (e) {
      setApplyError(errMsg(e, "That code didn't work."));
    } finally {
      setApplying(false);
    }
  }

  const s = summary.data;
  return (
    <>
      <PageHeader title="Invite a friend" back={{ href: "/dashboard/settings", label: "Settings" }}>
        You both get a month of Pro free when a friend records their first trip.
      </PageHeader>
      <div className={styles.page}>
        {summary.loading && !s ? (
          <Skeleton variant="card" count={2} />
        ) : summary.error && !s ? (
          <CardError onRetry={summary.reload} />
        ) : s ? (
          <>
            <Card title="Your code">
              <div className={styles.fields}>
                <p className={styles.code}>{s.code}</p>
                <p className={styles.muted}>{s.shareUrl}</p>
                <div className={styles.actions}>
                  <Button variant="primary" icon="share-outline" onClick={() => void copy()}>Copy link</Button>
                </div>
              </div>
            </Card>

            <div className={styles.stats}>
              <Card>
                <Figure value={String(s.earnedMonths)} label="Months earned" sub={`Up to ${s.maxRewards}`} />
              </Card>
              <Card>
                <Figure value={String(s.pendingCount)} label="Friends waiting" sub="Waiting for a first trip" />
              </Card>
            </div>
            {s.referralProUntil && <p className={styles.muted}>Your free Pro runs until {formatDay(s.referralProUntil)}.</p>}
          </>
        ) : null}

        <Card title="Have a friend's code?">
          <div className={styles.fields}>
            <TextField label="Code" value={friendCode} onChange={(v) => setFriendCode(v.toUpperCase())} maxLength={16} error={applyError ?? undefined} autoComplete="off" />
            <div className={styles.actions}>
              <Button variant="secondary" loading={applying} disabled={!friendCode.trim()} onClick={() => void apply()}>
                Apply
              </Button>
            </div>
            <p className={styles.muted}>You can add a code in your first week.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
