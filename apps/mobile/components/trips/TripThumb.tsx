// The small route drawing on a Trips row: Home's mini route (dark ground,
// amber route, white start ring, amber end dot), no map tiles. The route
// comes from the same place the trip screen gets it (useTripRoutePoints).
// With no route to draw (added by hand, or none uploaded), a dashed line
// joins the two ends, as on Home.

import { MiniRoute } from "../home/MiniRoute";
import { useTripRoutePoints } from "../map/TripRouteCard";
import type { LatLng } from "../../lib/home/miniRoute";

interface Props {
  tripId: string;
  routePolyline?: string | null;
  isManualEntry: boolean;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  size?: number;
}

const MAX_THUMB_POINTS = 36;

function point(lat: number | null, lng: number | null): LatLng | null {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

function thin(points: LatLng[], max: number): LatLng[] {
  if (points.length <= max) return points;
  const out: LatLng[] = [];
  const step = (points.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

export function TripThumb({ tripId, routePolyline, isManualEntry, startLat, startLng, endLat, endLng, size = 56 }: Props) {
  const { route, fetching } = useTripRoutePoints(tripId, routePolyline, isManualEntry);
  const points = route && route.length >= 2 ? thin(route, MAX_THUMB_POINTS) : [];
  const start = point(startLat, startLng);
  const end = point(endLat, endLng);
  if (fetching) return <MiniRoute route={[]} start={null} end={null} size={size} dashed={false} />;
  return <MiniRoute route={points} start={start} end={end} size={size} dashed={points.length < 2} />;
}
