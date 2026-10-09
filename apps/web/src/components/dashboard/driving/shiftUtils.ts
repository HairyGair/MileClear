export interface ShiftListRow {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  vehicle?: { make: string; model: string } | null;
  tripCount?: number;
  tripMiles?: number;
}

/** "3h 12m", "45m". */
export function durationText(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
