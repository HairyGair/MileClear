"use client";

import { useState } from "react";
import type { RoadAlertItem } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/dashboard/kit/Button";
import { Card, SectionHeader } from "@/components/dashboard/kit/Card";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { EmptyState, Skeleton } from "@/components/dashboard/kit/States";
import { useToast } from "@/components/dashboard/kit/Toast";
import { useData } from "@/lib/dashboard/useData";
import { bodyLine, dismissBody, fetchRoadAlerts, whenText, whereText } from "@/components/dashboard/driving/roadAlerts";
import styles from "@/components/dashboard/driving/driving.module.css";

function AlertList({ title, items, onDismiss, busy }: { title: string; items: RoadAlertItem[]; onDismiss: (i: RoadAlertItem) => void; busy: string | null }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className={styles.stack}>
      <SectionHeader title={title} />
      <Card padded={false}>
        <ul className={styles.list}>
          {items.map((i) => (
            <li key={i.id} className={`${styles.listRow} ${styles.alignTop}`}>
              <div className={styles.listMain}>
                <p className={styles.alertTitle}>{i.headline}</p>
                {bodyLine(i) && <p className={styles.alertBody}>{bodyLine(i)}</p>}
                {whenText(i) && <p className={styles.alertMeta}>{whenText(i)}</p>}
                {whereText(i) && <p className={styles.alertMeta}>{whereText(i)}</p>}
              </div>
              <Button variant="ghost" size="sm" loading={busy === i.id} onClick={() => onDismiss(i)} aria-label={`Dismiss ${i.headline}`}>
                Dismiss
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

export default function RoadAlertsPage() {
  const { show } = useToast();
  const { data, loading, reload } = useData("road-alerts", fetchRoadAlerts);
  const [busy, setBusy] = useState<string | null>(null);

  async function dismiss(item: RoadAlertItem) {
    setBusy(item.id);
    try {
      await api.post("/road-alerts/dismiss", dismissBody(item));
      show("Dismissed");
      reload();
    } catch (e) {
      show(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  const on = data?.enabled ?? false;
  const current = on ? data!.current.filter((i) => !i.ongoing) : [];
  const planned = on
    ? [...data!.upcoming, ...(data!.weekAhead ?? []).filter((w) => !data!.upcoming.some((u) => u.id === w.id))]
    : [];
  const ongoing = on ? data!.ongoing ?? [] : [];
  const none = current.length === 0 && planned.length === 0 && ongoing.length === 0;

  return (
    <>
      <PageHeader title="Road alerts" back={{ href: "/dashboard/more", label: "More" }} />
      {loading && !data ? (
        <Skeleton variant="row" count={3} />
      ) : none ? (
        <EmptyState icon="navigate-outline" title="No alerts on your roads" body="We'll show closures and delays on routes you drive often." />
      ) : (
        <div className={styles.stack}>
          <AlertList title="On your roads" items={current} onDismiss={dismiss} busy={busy} />
          <AlertList title="Planned" items={planned} onDismiss={dismiss} busy={busy} />
          <AlertList title="In place for a while" items={ongoing} onDismiss={dismiss} busy={busy} />
          {(data?.attribution ?? []).map((a) => (
            <p key={a} className={styles.hint}>{a}</p>
          ))}
        </div>
      )}
    </>
  );
}
