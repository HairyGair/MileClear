"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/dashboard/kit/Button";
import { Card } from "@/components/dashboard/kit/Card";
import { DataTable } from "@/components/dashboard/kit/DataTable";
import { StatusChip } from "@/components/dashboard/kit/Controls";
import { StatTile } from "@/components/dashboard/kit/Figure";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useMe } from "@/lib/dashboard/useMe";
import { useData } from "@/lib/dashboard/useData";
import { formatDay, formatRange } from "@/lib/dashboard/dates";
import { formatMiles } from "@mileclear/shared";
import { fetchShiftSuggestions, SuggestionRow } from "@/components/dashboard/driving/ShiftSuggestions";
import { durationText, type ShiftListRow } from "@/components/dashboard/driving/shiftUtils";
import styles from "@/components/dashboard/driving/driving.module.css";

interface ShiftsResponse {
  data: ShiftListRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
interface InsightsShift {
  shiftId: string;
  earningsPence: number;
  grade: string;
}

const PAGE_SIZE = 20;

export default function ShiftsPage() {
  const router = useRouter();
  const { isPro } = useMe();
  const first = useData("shifts-1", () => api.get<ShiftsResponse>(`/shifts?page=1&pageSize=${PAGE_SIZE}`));
  const suggestions = useData("shift-suggestions", () => fetchShiftSuggestions().catch(() => []));
  // Grades come from the business insights (Pro). A shift with no earnings gets none, never an F.
  const grades = useData(isPro ? "shift-grades" : null, () =>
    api
      .get<{ data: { recentShifts?: InsightsShift[] } }>("/business-insights")
      .then((r) => r.data?.recentShifts ?? [])
      .catch(() => [] as InsightsShift[])
  );
  const [more, setMore] = useState<ShiftListRow[]>([]);
  const [nextPage, setNextPage] = useState(2);
  const [loadingMore, setLoadingMore] = useState(false);

  const firstRows = first.data?.data ?? [];
  const rows = [...firstRows, ...more];
  const total = first.data?.total ?? 0;
  const canLoadMore = rows.length < total;
  const gradeFor = new Map((grades.data ?? []).filter((g) => g.earningsPence > 0).map((g) => [g.shiftId, g.grade]));
  const showGrades = isPro && gradeFor.size > 0;

  // Stats cover the latest 20 shifts, the page the server returned first, and say so.
  const statRows = firstRows;
  const statTrips = statRows.reduce((s, r) => s + (r.tripCount ?? 0), 0);
  const statMiles = statRows.reduce((s, r) => s + (r.tripMiles ?? 0), 0);
  const done = statRows.filter((r) => r.endedAt);
  const avgMs = done.length ? done.reduce((s, r) => s + (new Date(r.endedAt!).getTime() - new Date(r.startedAt).getTime()), 0) / done.length : 0;
  const statLabel = total > PAGE_SIZE ? `Last ${PAGE_SIZE} shifts` : "All your shifts";

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await api.get<ShiftsResponse>(`/shifts?page=${nextPage}&pageSize=${PAGE_SIZE}`);
      setMore((m) => [...m, ...res.data]);
      setNextPage((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader title="Shifts" back={{ href: "/dashboard/more", label: "More" }} />
      <div className={styles.stack}>
        {(suggestions.data ?? []).length > 0 && (
          <Card title="Is this a shift?">
            <div className={styles.stack}>
              {(suggestions.data ?? []).map((s) => (
                <SuggestionRow
                  key={s.id}
                  s={s}
                  onDone={() => {
                    suggestions.reload();
                    first.reload();
                    setMore([]);
                    setNextPage(2);
                  }}
                />
              ))}
            </div>
          </Card>
        )}

        {first.loading && !first.data ? (
          <Skeleton variant="row" count={5} />
        ) : first.error && !first.data ? (
          <ErrorState title="Couldn't load your shifts" onRetry={first.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title="No shifts yet"
            body="Start a shift in the app when you start work. Your trips are grouped here."
          />
        ) : (
          <>
            <div>
              <p className={styles.hint}>{statLabel}</p>
              <div className={`${styles.statGrid} ${styles.statGrid3}`}>
                <StatTile label="Average length" value={done.length ? durationText(avgMs) : null} />
                <StatTile label="Trips" value={String(statTrips)} />
                <StatTile label="Miles" value={formatMiles(statMiles)} />
              </div>
            </div>
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/dashboard/shifts/${r.id}`)}
              columns={[
                { key: "date", label: "Date", render: (r) => formatDay(r.startedAt) },
                { key: "time", label: "Time", render: (r) => (r.endedAt ? formatRange(r.startedAt, r.endedAt) : "In progress") },
                { key: "duration", label: "Length", hideBelow: 768, render: (r) => (r.endedAt ? durationText(new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) : "In progress") },
                { key: "trips", label: "Trips", align: "right", hideBelow: 768, render: (r) => String(r.tripCount ?? 0) },
                ...(showGrades
                  ? [{ key: "grade", label: "Grade", align: "right" as const, hideBelow: 768 as const, render: (r: ShiftListRow) => gradeFor.get(r.id) ?? "No grade" }]
                  : []),
                { key: "miles", label: "Miles", align: "right", render: (r) => `${formatMiles(r.tripMiles ?? 0)}` },
              ]}
            />
            {rows.some((r) => !r.endedAt) && <StatusChip tone="green" label="A shift is in progress" />}
            {canLoadMore && (
              <div>
                <Button variant="secondary" loading={loadingMore} onClick={loadMore}>Show older shifts</Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
