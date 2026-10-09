"use client";

import { useState } from "react";
import type { PeriodRecap } from "@mileclear/shared";
import { Button, Card, Figure, useData } from "../kit";
import { getData } from "./data";
import { RecapDialog } from "./RecapDialog";
import { CardFailed, CardLoading, miles, withBoundary } from "./ui";
import s from "./insights.module.css";

/** Today's recap. Renders nothing before the first trip of the day. */
function DailyRecapCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const { data, error, loading, reload } = useData<PeriodRecap>("recap-daily", () => getData("/gamification/recap?period=daily"));

  if (loading && !data) return <CardLoading title="Today" />;
  if (error) return <CardFailed title="Today" onRetry={reload} />;
  if (!data || data.totalTrips === 0) return null;

  return (
    <>
      <Card title="Today" action={{ label: "Share", onClick: () => setOpen(true) }}>
        <div className={s.figures}>
          <Figure label="Driven" value={miles(data.totalMiles)} />
          <Figure label={data.totalTrips === 1 ? "Trip" : "Trips"} value={String(data.totalTrips)} />
        </div>
        {data.businessMiles > 0 && <p className={s.note}>{miles(data.businessMiles)} of that was business.</p>}
        <Button variant="link" size="sm" onClick={() => setOpen(true)}>
          Open the recap
        </Button>
      </Card>
      <RecapDialog period="daily" title="Today" open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export const DailyRecapCard = withBoundary(DailyRecapCardImpl);
