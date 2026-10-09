"use client";

import { useEffect, useState } from "react";
import type {
  CommuteTiming, EarningsDayPattern, FrequentRoute, FuelCostBreakdown, ShiftSweetSpot, WeeklyReport,
} from "@mileclear/shared";
import { BarChart, BarList, LineChart } from "../charts";
import { Button, Card, EmptyState, Figure, ProGate, Skeleton, useData, useMe } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Row, Takeaway, DAYS_LONG, DAYS_MON_FIRST, miles, pounds, withBoundary } from "./ui";
import s from "./insights.module.css";

type Status = "loading" | "empty" | "ready";
type Report = (id: string, status: Status) => void;

const NOT_ENOUGH = "Not enough trips yet";

function useReport(report: Report, id: string, status: Status) {
  useEffect(() => {
    report(id, status);
  }, [report, id, status]);
}

function Empty({ title }: { title: string }) {
  return (
    <Card title={title}>
      <p className={s.note}>{NOT_ENOUGH}</p>
    </Card>
  );
}

function delta(v: number | null): string | null {
  if (v === null) return null;
  const r = Math.round(v);
  return `${r > 0 ? "+" : ""}${r}% on the week before`;
}

function WeeklyReportCard({ report }: { report: Report }) {
  const [weeksBack, setWeeksBack] = useState(0);
  const { data, error, loading, reload } = useData<WeeklyReport>(`weekly-report-${weeksBack}`, () => getData(`/analytics/weekly-report?weeksBack=${weeksBack}`));
  const hasData = !!data && data.totalTrips > 0;
  // A quiet week is still a report; only the current week with no data at all counts as empty.
  useReport(report, "weekly", loading && !data ? "loading" : weeksBack === 0 && !hasData ? "empty" : "ready");

  return (
    <Card title="Weekly report">
      <div className={s.weekNav}>
        <Button variant="ghost" size="sm" icon="chevron-back" aria-label="Previous week" onClick={() => setWeeksBack((w) => w + 1)} />
        <span className={s.weekLabel}>{data?.weekLabel ?? "..."}</span>
        <Button variant="ghost" size="sm" icon="chevron-forward" aria-label="Next week" disabled={weeksBack === 0} onClick={() => setWeeksBack((w) => Math.max(0, w - 1))} />
      </div>
      {loading && !data && <Skeleton variant="text" count={3} />}
      {error && <CardFailed title="Weekly report" onRetry={reload} />}
      {data && !hasData && <p className={s.note}>{NOT_ENOUGH}</p>}
      {data && hasData && (
        <>
          <div className={`${s.figures} ${s.three}`}>
            <Figure label="Miles" value={miles(data.totalMiles)} sub={delta(data.milesDelta) ?? undefined} />
            <Figure label="Trips" value={String(data.totalTrips)} sub={delta(data.tripsDelta) ?? undefined} />
            <Figure label="Streak" value={`${data.streakDays} ${data.streakDays === 1 ? "day" : "days"}`} />
          </div>
          <BarList
            label="Miles by type"
            items={[
              { name: "Business", value: data.business.miles, display: miles(data.business.miles) },
              { name: "Personal", value: data.personal.miles, display: miles(data.personal.miles) },
            ]}
          />
          {data.business.earningsPence > 0 && <Row main="Earned" sub={delta(data.earningsDelta) ?? undefined} figure={pounds(data.business.earningsPence)} />}
        </>
      )}
    </Card>
  );
}

function RoutesCard({ report }: { report: Report }) {
  const { data, error, loading, reload } = useData<FrequentRoute[]>("freq-routes", () => getData("/analytics/routes"));
  useReport(report, "routes", loading && !data ? "loading" : !data || data.length === 0 ? "empty" : "ready");
  if (loading && !data) return <CardLoading title="Your routes" />;
  if (error) return <CardFailed title="Your routes" onRetry={reload} />;
  if (!data || data.length === 0) return <Empty title="Your routes" />;
  return (
    <Card title="Your routes">
      {data.slice(0, 5).map((r, i) => (
        <Row
          key={i}
          main={`${r.startAddress} to ${r.endAddress}`}
          sub={`${r.tripCount} trips, about ${Math.round(r.avgDurationMinutes)} min, fastest ${Math.round(r.fastestDurationMinutes)} min`}
          figure={miles(r.avgDistanceMiles)}
        />
      ))}
    </Card>
  );
}

function SweetSpotsCard({ report }: { report: Report }) {
  const { data, error, loading, reload } = useData<ShiftSweetSpot[]>("sweet-spots", () => getData("/analytics/shift-sweet-spots"));
  useReport(report, "sweet", loading && !data ? "loading" : !data || data.length === 0 ? "empty" : "ready");
  if (loading && !data) return <CardLoading title="Best shift length" />;
  if (error) return <CardFailed title="Best shift length" onRetry={reload} />;
  if (!data || data.length === 0) return <Empty title="Best shift length" />;
  const best = data.reduce((a, b) => (b.avgEarningsPerHourPence > a.avgEarningsPerHourPence ? b : a));
  return (
    <Card title="Best shift length">
      <Takeaway>You earn most an hour on shifts of {best.durationBucket}.</Takeaway>
      <BarChart
        label="Average earnings an hour by shift length"
        formatValue={(n) => pounds(n * 100)}
        highlightIndex={data.indexOf(best)}
        data={data.map((d) => ({ label: d.durationBucket, value: d.avgEarningsPerHourPence / 100 }))}
      />
    </Card>
  );
}

function FuelCostCard({ report }: { report: Report }) {
  const { data, error, loading, reload } = useData<FuelCostBreakdown>("fuel-cost", () => getData("/analytics/fuel-cost"));
  useReport(report, "fuel", loading && !data ? "loading" : !data || data.totalFuelCostPence <= 0 ? "empty" : "ready");
  if (loading && !data) return <CardLoading title="Fuel cost" />;
  if (error) return <CardFailed title="Fuel cost" onRetry={reload} />;
  if (!data || data.totalFuelCostPence <= 0) return <Empty title="Fuel cost" />;
  return (
    <Card title="Fuel cost">
      <div className={`${s.figures} ${s.three}`}>
        <Figure label="Spent on fuel" value={pounds(data.totalFuelCostPence)} />
        {data.fuelCostPerMilePence !== null && <Figure label="A mile" value={`${data.fuelCostPerMilePence.toFixed(1)}p`} />}
        {data.actualMpg !== null && <Figure label="Miles per gallon" value={data.actualMpg.toFixed(1)} />}
      </div>
      {data.perVehicle.length > 1 && (
        <BarList label="Fuel cost by vehicle" items={data.perVehicle.map((v) => ({ name: `${v.make} ${v.model}`, value: v.totalCostPence, display: pounds(v.totalCostPence) }))} />
      )}
    </Card>
  );
}

function EarningsByDayCard({ report }: { report: Report }) {
  const { data, error, loading, reload } = useData<EarningsDayPattern[]>("earnings-by-day", () => getData("/analytics/earnings-by-day"));
  const none = !data || data.every((d) => d.totalEarningsPence <= 0);
  useReport(report, "byday", loading && !data ? "loading" : none ? "empty" : "ready");
  if (loading && !data) return <CardLoading title="Earnings by day" />;
  if (error) return <CardFailed title="Earnings by day" onRetry={reload} />;
  if (!data || none) return <Empty title="Earnings by day" />;
  const best = data.reduce((a, b) => (b.avgEarningsPence > a.avgEarningsPence ? b : a));
  return (
    <Card title="Earnings by day">
      <Takeaway>Your best day was {DAYS_LONG[best.dayIndex] ?? best.day}.</Takeaway>
      <BarChart
        label="Average earnings by day of the week"
        formatValue={(n) => pounds(n * 100)}
        highlightIndex={data.indexOf(best)}
        data={data.map((d) => ({ label: DAYS_MON_FIRST[d.dayIndex] ?? d.day.slice(0, 3), fullLabel: d.day, value: d.avgEarningsPence / 100 }))}
      />
    </Card>
  );
}

function CommuteCard({ report }: { report: Report }) {
  const { data, error, loading, reload } = useData<CommuteTiming[]>("commute-timing", () => getData("/analytics/commute-timing"));
  const route = data?.[0];
  useReport(report, "commute", loading && !data ? "loading" : !route || route.byHour.length === 0 ? "empty" : "ready");
  if (loading && !data) return <CardLoading title="Commute timing" />;
  if (error) return <CardFailed title="Commute timing" onRetry={reload} />;
  if (!route || route.byHour.length === 0) return <Empty title="Commute timing" />;
  return (
    <Card title="Commute timing">
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

function Cards() {
  const { isGigDriver, mode } = useMe();
  const work = isGigDriver && mode === "work";
  const [states, setStates] = useState<Record<string, Status>>({});
  const report: Report = (id, status) => setStates((prev) => (prev[id] === status ? prev : { ...prev, [id]: status }));
  const expected = 4 + (work ? 2 : 0);
  const vals = Object.values(states);
  const allEmpty = vals.length >= expected && vals.every((v) => v === "empty");

  return (
    <>
      {allEmpty && <EmptyState icon="stats-chart-outline" title="Not enough driving yet" body="Trends need a few weeks of trips. Check back soon." />}
      <div className={s.grid} hidden={allEmpty}>
        <WeeklyReportCard report={report} />
        <RoutesCard report={report} />
        {work && <SweetSpotsCard report={report} />}
        <FuelCostCard report={report} />
        {work && <EarningsByDayCard report={report} />}
        <CommuteCard report={report} />
      </div>
    </>
  );
}

/** The Trends view. Pro only; free drivers see a blurred teaser. */
function TrendsImpl(): React.ReactElement {
  return (
    <ProGate
      reason="trends"
      page
      teaser={
        <div className={s.teaser} aria-hidden="true">
          <BarChart label="Example trend" data={[3, 5, 4, 7, 6, 9, 8].map((v, i) => ({ label: DAYS_MON_FIRST[i], value: v }))} />
        </div>
      }
    >
      <Cards />
    </ProGate>
  );
}

export const Trends = withBoundary(TrendsImpl);
