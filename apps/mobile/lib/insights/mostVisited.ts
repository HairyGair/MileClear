// "Places you go most" on Insights (Personal mode): the driver's top
// destinations, moved from the old Driving Patterns card on Home. Pure.

export interface VisitedPlace {
  name: string;
  count: number;
}

/** Up to `max` places with a name and at least one visit, most visited first. */
export function placesToShow(places: readonly VisitedPlace[] | null | undefined, max = 5): VisitedPlace[] {
  if (!places) return [];
  return places
    .filter((p) => p && typeof p.name === "string" && p.name.trim().length > 0 && p.count > 0)
    .map((p) => ({ name: p.name.trim(), count: p.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

/** "Work, 14 visits" for screen readers. */
export function placeLabel(p: VisitedPlace): string {
  return `${p.name}, ${p.count} ${p.count === 1 ? "visit" : "visits"}`;
}
