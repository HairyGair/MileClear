// Inbox grouping: unsorted trips that start and end in the same two places
// (within 300 m) are shown as one group so the driver sorts them in one tap.
import { metresBetween } from "./placeLabel";

export const ROUTE_GROUP_METRES = 300;

interface Routable {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number | null;
  endLng: number | null;
  distanceMiles: number;
}

export interface RouteGroup<T extends Routable> {
  key: string;
  trips: T[];
  miles: number;
}

/** First trip of a group is its anchor; later trips join if both ends are within 300 m of it. */
export function groupByRoute<T extends Routable>(trips: T[]): RouteGroup<T>[] {
  const groups: RouteGroup<T>[] = [];
  for (const t of trips) {
    if (t.endLat == null || t.endLng == null) {
      groups.push({ key: `solo-${t.id}`, trips: [t], miles: t.distanceMiles });
      continue;
    }
    const home = groups.find((g) => {
      const a = g.trips[0];
      if (a.endLat == null || a.endLng == null) return false;
      return (
        metresBetween(a.startLat, a.startLng, t.startLat, t.startLng) <= ROUTE_GROUP_METRES &&
        metresBetween(a.endLat, a.endLng, t.endLat as number, t.endLng as number) <= ROUTE_GROUP_METRES
      );
    });
    if (home) {
      home.trips.push(t);
      home.miles += t.distanceMiles;
    } else {
      groups.push({ key: `route-${t.id}`, trips: [t], miles: t.distanceMiles });
    }
  }
  return groups;
}
