"use client";

import Link from "next/link";
import type { GamificationStats } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Card, CardError, Figure, Skeleton, formatMiles, formatPence, useData, useUnclassifiedCount } from "@/components/dashboard/kit";
import "./tax.css";

/**
 * Home hero for Work mode: business miles this tax year and what they are
 * worth, from GET /gamification/stats. The "trips to sort" link uses the
 * Trips badge count (GET /trips/unclassified/count).
 */
export function WorkHeroCard({ mode }: { mode: "work" | "personal" }) {
  const enabled = mode === "work";
  // Same key and shape as the Pro nudge, so Home makes one request.
  const { data, error, loading, reload } = useData<GamificationStats>(enabled ? "gamification-stats" : null, () =>
    api.get<{ data: GamificationStats }>("/gamification/stats").then((r) => r.data)
  );
  const { count: unsorted } = useUnclassifiedCount();

  if (!enabled) return null;
  if (loading && !data) return <Skeleton variant="figure" />;
  if (error && !data) {
    return (
      <Card>
        <CardError onRetry={reload} />
      </Card>
    );
  }
  if (!data || (data.totalTrips === 0 && data.businessMiles === 0)) return null;

  const sortLink =
    unsorted > 0 ? (
      <Link href="/dashboard/trips?view=inbox" className="mc-textlink">
        {unsorted} {unsorted === 1 ? "trip" : "trips"} to sort
      </Link>
    ) : null;

  if (data.businessMiles <= 0) {
    return (
      <Card>
        <div className="mc-tax-stack">
          <p className="mc-tax-text">
            <strong>No business miles yet.</strong> Mark trips as Business and your claim shows up here.
          </p>
          {sortLink}
        </div>
      </Card>
    );
  }

  return (
    <div className="mc-tax-stack">
      <Figure
        size="xl"
        label="Business miles this tax year"
        value={formatMiles(data.businessMiles)}
        sub={data.deductionPence > 0 ? `About ${formatPence(data.deductionPence)} to claim · ${data.taxYear}` : data.taxYear}
      />
      {sortLink}
    </div>
  );
}
