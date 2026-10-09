"use client";

import type { ActivityHeatmap } from "@mileclear/shared";
import { Heatmap } from "../charts";
import { Card, useData, useMe } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, DAYS_LONG, DAYS_MON_FIRST, Takeaway, withBoundary } from "./ui";

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
// API: 0 = Sunday. Rows are Monday first.
const toRow = (dow: number) => (dow + 6) % 7;

/** When you drive and earn most: 7 days by 24 hours. Work, gig drivers. */
function HeatmapCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement | null {
  const { isGigDriver, mode } = useMe();
  const on = isGigDriver && mode === "work";
  const { data, error, loading, reload } = useData<ActivityHeatmap>(on ? "heatmap" : null, () => getData("/business-insights/heatmap"));

  if (!on) return null;
  if (loading && !data) return <CardLoading title="Activity heatmap" />;
  if (error) return <CardFailed title="Activity heatmap" onRetry={reload} />;
  if (!data || data.cells.length === 0) return null;

  const cells = data.cells.map((c) => ({ row: toRow(c.dayOfWeek), col: c.hour, value: c.tripCount }));
  const best = [...cells].sort((a, b) => b.value - a.value)[0];

  return (
    <Card title="Activity heatmap">
      <Takeaway>
        Your busiest time is {DAYS_LONG[best.row]} at {HOURS[best.col]}:00, over the last {data.weeksAnalyzed} weeks.
      </Takeaway>
      <Heatmap
        rows={DAYS_MON_FIRST}
        cols={HOURS}
        cells={cells}
        colLabelEvery={3}
        label="Trips by day and hour"
        describe={(r, c, v) => `${r} ${c}:00, ${v} ${v === 1 ? "trip" : "trips"}`}
      />
    </Card>
  );
}

export const HeatmapCard = withBoundary(HeatmapCardImpl);
