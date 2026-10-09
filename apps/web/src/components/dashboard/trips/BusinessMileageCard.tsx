"use client";

import { api } from "../../../lib/api";
import { Card, CardError, Figure, Skeleton, useData } from "../kit";
import { formatMiles } from "../../../lib/dashboard";
import "./trips.css";

interface Summary {
  totalTrips: number;
  totalMiles: number;
  businessTrips: number;
  businessMiles: number;
  personalTrips: number;
  personalMiles: number;
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
}

/** Business miles so far this calendar month. Nothing is shown until there is a business trip. */
export function BusinessMileageCard({ mode }: { mode: "work" | "personal" }): React.ReactElement | null {
  const month = new Date().toISOString().slice(0, 7);
  const sum = useData<Summary>(mode === "work" ? `home:business-month:${month}` : null, () => {
    const r = monthRange();
    return api
      .get<{ data: Summary }>(`/trips/summary?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`)
      .then((res) => res.data);
  });
  if (mode !== "work") return null;
  if (sum.loading && !sum.data) return <Skeleton variant="card" height={110} />;
  if (sum.error) return <Card title="Business mileage this month"><CardError onRetry={sum.reload} /></Card>;
  const s = sum.data;
  if (!s || s.businessTrips === 0) return null;

  return (
    <Card title="Business mileage" action={{ label: "See trips", href: "/dashboard/trips?view=business" }}>
      <div className="mc-monthcard">
        <Figure
          label="This month"
          value={formatMiles(s.businessMiles)}
          sub={`${s.businessTrips.toLocaleString("en-GB")} business ${s.businessTrips === 1 ? "trip" : "trips"}`}
        />
        {s.personalTrips > 0 && (
          <p className="mc-monthcard__split">{formatMiles(s.personalMiles)} personal</p>
        )}
      </div>
    </Card>
  );
}
