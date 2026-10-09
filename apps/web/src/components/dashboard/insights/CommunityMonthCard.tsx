"use client";

import type { CommunityMonthly } from "@mileclear/shared";
import { Card, Figure, useData } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Takeaway, miles, withBoundary } from "./ui";
import s from "./insights.module.css";

/**
 * "This month in MileClear": the community numbers for the last finished month.
 * Home shows it on the 1st to 10th only; Insights passes `always`.
 */
function CommunityMonthCardImpl({ always = false }: { mode?: "work" | "personal"; always?: boolean }): React.ReactElement | null {
  const day = new Date().getDate();
  const show = always || day <= 10;
  const { data, error, loading, reload } = useData<CommunityMonthly>(show ? "community-monthly" : null, () => getData("/community/monthly"));

  if (!show) return null;
  if (loading && !data) return <CardLoading title="This month in MileClear" />;
  if (error) return <CardFailed title="This month in MileClear" onRetry={reload} />;
  if (!data || !data.published || data.activeDrivers === null) return null;

  return (
    <Card title="This month in MileClear">
      <Takeaway>{data.label}, across all MileClear drivers.</Takeaway>
      <div className={`${s.figures} ${s.three}`}>
        <Figure label="Drivers" value={data.activeDrivers.toLocaleString("en-GB")} />
        <Figure label="Trips" value={(data.trips ?? 0).toLocaleString("en-GB")} />
        <Figure label="Miles" value={miles(data.totalMiles ?? 0)} />
      </div>
      {data.busiestDay && (
        <p className={s.note}>
          Busiest day: {data.busiestDay.weekday} ({data.busiestDay.trips.toLocaleString("en-GB")} trips).
        </p>
      )}
    </Card>
  );
}

export const CommunityMonthCard = withBoundary(CommunityMonthCardImpl);
