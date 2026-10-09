"use client";

import { Card } from "../kit/Card";
import { CardError, Skeleton } from "../kit/States";
import { useData } from "../../../lib/dashboard/useData";
import { fetchShiftSuggestions, SuggestionRow } from "./ShiftSuggestions";

/**
 * Home card: "4 trips look like a shift on Tue 7 Oct". Hidden when there is
 * nothing to suggest. Work mode only.
 */
export function ShiftSuggestionCard({ mode }: { mode: "work" | "personal" }): React.ReactElement | null {
  const { data, error, loading, reload } = useData(mode === "work" ? "shift-suggestions" : null, fetchShiftSuggestions);
  if (mode !== "work") return null;
  if (loading && !data) return <Card title="Shift suggestion"><Skeleton variant="text" /></Card>;
  if (error && !data) return null;
  const first = data?.[0];
  if (!first) return null;
  return (
    <Card title="Is this a shift?" action={{ label: "See shifts", href: "/dashboard/shifts" }}>
      {error ? <CardError onRetry={reload} /> : <SuggestionRow key={first.id} s={first} onDone={reload} />}
    </Card>
  );
}
