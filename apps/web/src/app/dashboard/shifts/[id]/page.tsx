"use client";

import { use } from "react";
import Link from "next/link";
import type { ShiftScorecard } from "@mileclear/shared";
import { formatMiles, formatPence } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Card } from "@/components/dashboard/kit/Card";
import { StatusChip } from "@/components/dashboard/kit/Controls";
import { StatTile } from "@/components/dashboard/kit/Figure";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { ProGate } from "@/components/dashboard/kit/Pro";
import { CardError, EmptyState, ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useData } from "@/lib/dashboard/useData";
import { formatDay, formatRange, formatTime } from "@/lib/dashboard/dates";
import { durationText } from "@/components/dashboard/driving/shiftUtils";
import { noDashes } from "@/components/dashboard/driving/api";
import styles from "@/components/dashboard/driving/driving.module.css";

interface ShiftPnl {
  grossEarningsPence: number;
  expensesPence: number;
  fuelPence: number;
  netPence: number;
}
interface ShiftTrip {
  id: string;
  startedAt: string;
  endedAt: string | null;
  startAddress: string | null;
  endAddress: string | null;
  distanceMiles: number;
  classification: string;
}

const CLASS_WORD: Record<string, string> = { business: "Business", personal: "Personal" };

export default function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const shift = useData(`shift-${id}`, () => api.get<{ data: { id: string; startedAt: string; endedAt: string | null } }>(`/shifts/${id}`));
  const card = useData(`shift-score-${id}`, () =>
    api.get<{ data: ShiftScorecard }>(`/gamification/scorecard?shiftId=${id}`).then((r) => r.data).catch(() => null)
  );
  const trips = useData(`shift-trips-${id}`, () => api.get<{ data: ShiftTrip[] }>(`/trips?shiftId=${id}&pageSize=100`));
  const s = shift.data?.data;

  return (
    <>
      <PageHeader title="Shift" back={{ href: "/dashboard/shifts", label: "Shifts" }}>
        {s && (
          <span className={styles.muted}>
            {formatDay(s.startedAt)}, {s.endedAt ? formatRange(s.startedAt, s.endedAt) : `from ${formatTime(s.startedAt)}`}
          </span>
        )}
      </PageHeader>
      {shift.loading && !shift.data ? (
        <Skeleton variant="card" count={2} />
      ) : shift.error && !shift.data ? (
        /not found/i.test(shift.error.message) ? (
          <EmptyState icon="time-outline" title="Shift not found" body="It may have been deleted." action={{ label: "Back to shifts", href: "/dashboard/shifts" }} />
        ) : (
          <ErrorState title="Couldn't load this shift" onRetry={shift.reload} />
        )
      ) : (
        <div className={styles.stack}>
          {card.data && (
            <Card title="Scorecard">
              <div className={`${styles.statGrid} ${styles.statGrid4}`}>
                <StatTile label="Length" value={durationText(card.data.durationSeconds * 1000)} />
                <StatTile label="Trips" value={String(card.data.tripsCompleted)} />
                <StatTile label="Miles" value={formatMiles(card.data.totalMiles)} />
                <StatTile label="Business miles" value={formatMiles(card.data.businessMiles)} />
              </div>
              {(card.data.isPersonalBestMiles || card.data.isPersonalBestTrips) && (
                <div className={`${styles.chipRow} ${styles.mt}`}>
                  {card.data.isPersonalBestMiles && <StatusChip tone="green" icon="trophy-outline" label="Most miles in a shift" />}
                  {card.data.isPersonalBestTrips && <StatusChip tone="green" icon="trophy-outline" label="Most trips in a shift" />}
                </div>
              )}
              {card.data.newAchievements.length > 0 && (
                <p className={`${styles.muted} ${styles.mt}`}>
                  New badge{card.data.newAchievements.length > 1 ? "s" : ""}: {card.data.newAchievements.map((a) => noDashes(a.label)).join(", ")}
                </p>
              )}
            </Card>
          )}

          <ProGate reason="insights" teaser={<p className={styles.muted}>What you earned, spent and kept on this shift.</p>}>
            <ShiftPnlCard id={id} />
          </ProGate>

          <Card title="Trips in this shift" padded={false}>
            {trips.loading && !trips.data ? (
              <Skeleton variant="row" count={3} />
            ) : trips.error && !trips.data ? (
              <div className={styles.pad}><CardError onRetry={trips.reload} /></div>
            ) : (trips.data?.data ?? []).length === 0 ? (
              <div className={styles.pad}><p className={styles.muted}>No trips in this shift.</p></div>
            ) : (
              <ul className={styles.list}>
                {trips.data!.data.map((t) => (
                  <li key={t.id}>
                    <Link href={`/dashboard/trips/${t.id}`} className={styles.listRow}>
                      <span className={styles.listMain}>
                        <span className={styles.listTitle}>
                          {t.startAddress ?? "Start"} to {t.endAddress ?? "end"}
                        </span>
                        <span className={styles.listSub}>
                          {t.endedAt ? formatRange(t.startedAt, t.endedAt) : formatTime(t.startedAt)} · {CLASS_WORD[t.classification] ?? "Not sorted"}
                        </span>
                      </span>
                      <span className={styles.listFig}>{formatMiles(t.distanceMiles)} mi</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function ShiftPnlCard({ id }: { id: string }) {
  const pnl = useData(`shift-pnl-${id}`, () => api.get<{ data: ShiftPnl }>(`/business-insights/shift-pnl/${id}`).then((r) => r.data));
  return (
    <Card title="Profit and loss">
      {pnl.loading && !pnl.data ? (
        <Skeleton variant="text" />
      ) : pnl.error ? (
        <CardError onRetry={pnl.reload} />
      ) : pnl.data ? (
        pnl.data.grossEarningsPence === 0 ? (
          <p className={styles.muted}>Add what you were paid to see your profit for this shift.</p>
        ) : (
          <div className={`${styles.statGrid} ${styles.statGrid4}`}>
            <StatTile label="Earned" value={formatPence(pnl.data.grossEarningsPence)} />
            <StatTile label="Fuel" value={formatPence(pnl.data.fuelPence)} />
            <StatTile label="Expenses" value={formatPence(pnl.data.expensesPence)} />
            <StatTile label="Kept" value={formatPence(pnl.data.netPence)} />
          </div>
        )
      ) : null}
    </Card>
  );
}
