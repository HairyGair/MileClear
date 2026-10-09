"use client";

import type { LocalBenchmark } from "@mileclear/shared";
import { Card, useData } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Row, Takeaway, miles, withBoundary } from "./ui";
import s from "./insights.module.css";

function groupName(d: LocalBenchmark): string {
  if (d.level === "area") return "Drivers near you";
  if (d.level === "region" && d.scopeLabel) return `Drivers in ${d.scopeLabel}`;
  return "Drivers across the UK";
}

/** "Drivers near you": your postcode area, then region, then the UK. Hidden when there is no postcode area or too few drivers. */
function LocalBenchmarkCardImpl({ mode }: { mode: "work" | "personal" }): React.ReactElement | null {
  const { data, error, loading, reload } = useData<LocalBenchmark>(`local-benchmark-${mode}`, () => getData(`/business-insights/benchmarks/local?mode=${mode}`));

  if (loading && !data) return <CardLoading title="Drivers near you" />;
  if (error) return <CardFailed title="Drivers near you" onRetry={reload} />;
  if (!data || !data.available || !data.weeklyMiles) return null;

  const w = data.weeklyMiles;
  const ahead = w.youAheadOfPerTen;
  return (
    <Card title={groupName(data)}>
      <Takeaway>
        {data.peerCount} drivers{data.scopeLabel ? ` in ${data.scopeLabel}` : ""}, the last {data.window.weeks} full weeks.
      </Takeaway>
      <Row main={`Your typical week, last ${data.window.weeks} full weeks`} sub={mode === "work" ? "Business miles" : "All miles"} figure={w.you === null ? "Not ranked yet" : miles(w.you)} />
      <Row main="Typical driver nearby" sub={w.low !== null && w.high !== null ? `Middle half: ${miles(w.low)} to ${miles(w.high)}` : undefined} figure={miles(w.median)} />
      {ahead !== null && (
        <>
          <div className={s.dots} aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={`${s.dotItem} ${i < ahead ? s.on : ""}`} />
            ))}
          </div>
          <p className={s.note}>You are ahead of {ahead} in 10 drivers.</p>
        </>
      )}
    </Card>
  );
}

export const LocalBenchmarkCard = withBoundary(LocalBenchmarkCardImpl);
