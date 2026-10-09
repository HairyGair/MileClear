"use client";

import type { BenchmarkSnapshot } from "@mileclear/shared";
import { Card, useData } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Row, Takeaway, miles, withBoundary } from "./ui";

/** How you compare with other MileClear drivers across the UK. Nothing is shown when too few drivers. */
function BenchmarkCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement | null {
  const { data, error, loading, reload } = useData<BenchmarkSnapshot>("benchmarks", () => getData("/business-insights/benchmarks"));

  if (loading && !data) return <CardLoading title="How you compare" />;
  if (error) return <CardFailed title="How you compare" onRetry={reload} />;
  const m = data?.national.weeklyMiles;
  const t = data?.national.weeklyTrips;
  if (!data || !m || !m.available || m.yourValue === null) return null;

  return (
    <Card title="How you compare">
      <Takeaway>
        {m.yourPercentile !== null
          ? `You drive more miles each week than ${Math.round(m.yourPercentile)}% of MileClear drivers.`
          : "Your weekly miles against other MileClear drivers."}
      </Takeaway>
      <Row main="Your miles a week" figure={miles(m.yourValue)} />
      <Row main="Typical driver" sub={`Middle half: ${miles(m.p25)} to ${miles(m.p75)}`} figure={miles(m.median)} />
      {t && t.available && t.yourValue !== null && <Row main="Your trips a week" sub={`Typical: ${Math.round(t.median)}`} figure={String(Math.round(t.yourValue))} />}
    </Card>
  );
}

export const BenchmarkCard = withBoundary(BenchmarkCardImpl);
