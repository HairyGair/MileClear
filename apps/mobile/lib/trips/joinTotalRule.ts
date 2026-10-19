// The Join sheet on the Trips tab when a past shift's typed total is one of
// the trips picked (Lucian, 19 Oct 2026). A total already counts every mile
// of its shift, so joining a trip into it keeps the total exactly as it is
// (its miles, Business) and removes the other trip. Only a trip inside the
// shift's hours can be joined into it: a drive home after the shift is real
// extra miles, and the server refuses it (POST /trips/merge).
//
// Pure: no React, no network.

export interface JoinableTrip {
  id: string;
  startedAt: string;
  endedAt: string | null;
  distanceMiles: number;
  isTypedTotal?: boolean | null;
}

export type JoinPreview =
  | { kind: "plain"; miles: number }
  | { kind: "into_total"; miles: number }
  | { kind: "refused"; problem: string };

/** What the Join sheet shows, and whether it can join at all. */
export function joinPreview(selected: JoinableTrip[]): JoinPreview {
  const totals = selected.filter((t) => t.isTypedTotal === true);
  if (totals.length === 0) {
    return { kind: "plain", miles: selected.reduce((sum, t) => sum + t.distanceMiles, 0) };
  }
  if (totals.length > 1) {
    return { kind: "refused", problem: "Two shift totals can't be joined. Edit or delete one of them instead." };
  }
  const total = totals[0];
  const ts = new Date(total.startedAt).getTime();
  const te = total.endedAt ? new Date(total.endedAt).getTime() : ts;
  const outside = selected.some((t) => {
    if (t.id === total.id) return false;
    const s = new Date(t.startedAt).getTime();
    const e = t.endedAt ? new Date(t.endedAt).getTime() : s;
    return !(s >= ts && e <= te);
  });
  if (outside) {
    return { kind: "refused", problem: "Only trips inside the shift's hours can be joined into its total." };
  }
  return { kind: "into_total", miles: total.distanceMiles };
}
