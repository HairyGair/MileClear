"use client";

import type { CommuteTiming } from "@mileclear/shared";
import { LineChart } from "../charts";
import { Card, ProGate, useData, useMe } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Takeaway, withBoundary } from "./ui";

function Loaded() {
  const { data, error, loading, reload } = useData<CommuteTiming[]>("commute-timing", () => getData("/analytics/commute-timing"));
  if (loading && !data) return <CardLoading title="Driving patterns" />;
  if (error) return <CardFailed title="Driving patterns" onRetry={reload} />;
  const route = data?.[0];
  if (!route || route.byHour.length === 0) return null;
  return (
    <Card title="Driving patterns">
      <Takeaway>
        {route.routeLabel}: {route.bestDepartureLabel}.
      </Takeaway>
      <LineChart
        label={`Average minutes for ${route.routeLabel} by hour you leave`}
        unit="min"
        data={route.byHour.map((h) => ({ label: `${String(h.hour).padStart(2, "0")}:00`, value: Math.round(h.avgMinutes) }))}
      />
    </Card>
  );
}

/** Best time to leave on a route you drive often (Pro). */
function DrivingPatternsCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement | null {
  const { isPro } = useMe();
  if (!isPro) {
    return (
      <ProGate reason="trends" teaser={<p>See the best time to leave on the routes you drive most.</p>}>
        <></>
      </ProGate>
    );
  }
  return <Loaded />;
}

export const DrivingPatternsCard = withBoundary(DrivingPatternsCardImpl);
