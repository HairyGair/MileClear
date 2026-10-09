"use client";

import { api } from "../../../lib/api";
import { Card, CardError, MapView, ProGate, Skeleton, useData } from "../kit";
import { formatDay } from "../../../lib/dashboard";
import type { PagedTrips, TripDetailData, TripItem } from "./lib/types";
import "./trips.css";

// Same palette as the app's Recent Journeys map: five colours for the newest trips, slate for the rest.
const PALETTE = ["#f5a623", "#a78bfa", "#2fbf9a", "#ff7a59", "#e2e8f0"];
const OLDER = "#64748b";
const MAX_MAPPED = 10;
const MAX_POINTS = 600;

function colourAt(i: number): string {
  return i < PALETTE.length ? PALETTE[i] : OLDER;
}

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function loadRoutes(trips: TripItem[]): Promise<{ id: string; startedAt: string; coords: [number, number][] }[]> {
  const picks = trips.filter((t) => (t.coordinateCount ?? 0) >= 2 || !t.isManualEntry).slice(0, MAX_MAPPED);
  const details = await Promise.all(
    picks.map((t) =>
      api
        .get<{ data: TripDetailData }>(`/trips/${t.id}`)
        .then((r) => r.data)
        .catch(() => null)
    )
  );
  const out: { id: string; startedAt: string; coords: [number, number][] }[] = [];
  for (const d of details) {
    if (!d) continue;
    const pts = d.matchedCoordinates?.length ? d.matchedCoordinates : d.coordinates;
    if (!pts || pts.length < 2) continue;
    const step = Math.max(1, Math.ceil(pts.length / MAX_POINTS));
    const coords = pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((c) => [c.lat, c.lng] as [number, number]);
    out.push({ id: d.id, startedAt: d.startedAt, coords });
  }
  return out;
}

/** Recent journeys (last 7 days) on one map. Pro; free drivers see a teaser. Renders nothing when there are no trips. */
export function JourneyMapCard(_props: { mode: "work" | "personal" }): React.ReactElement | null {
  const list = useData<PagedTrips>("home:journeys:list", () => api.get<PagedTrips>(`/trips?from=${encodeURIComponent(sinceIso(7))}&pageSize=50`));
  if (list.loading && !list.data) return <Skeleton variant="card" height={240} />;
  if (list.error) return <Card title="Recent journeys"><CardError onRetry={list.reload} /></Card>;
  const trips = list.data?.data ?? [];
  if (trips.length === 0) return null;

  return (
    <ProGate
      reason="journey_map"
      teaser={<p>See every route you drove this week on one map, newest in amber.</p>}
    >
      <JourneyMapPro trips={trips} />
    </ProGate>
  );
}

function JourneyMapPro({ trips }: { trips: TripItem[] }) {
  const ids = trips.slice(0, MAX_MAPPED).map((t) => t.id).join(",");
  const routes = useData(`home:journeys:routes:${ids}`, () => loadRoutes(trips));
  if (routes.loading && !routes.data) return <Skeleton variant="card" height={240} />;
  if (routes.error) return <Card title="Recent journeys"><CardError onRetry={routes.reload} /></Card>;
  const rs = routes.data ?? [];
  if (rs.length === 0) return null;

  return (
    <Card title="Recent journeys" action={{ label: "See trips", href: "/dashboard/trips" }}>
      <MapView height={260} fitTo="routes" routes={rs.map((r, i) => ({ coords: r.coords, color: colourAt(i) }))} />
      <ul className="mc-journeycard__legend" aria-label="Routes on the map">
        {rs.slice(0, PALETTE.length).map((r, i) => (
          <li key={r.id}>
            <span className="mc-journeycard__dot" style={{ background: colourAt(i) }} aria-hidden="true" />
            {formatDay(r.startedAt)}
          </li>
        ))}
        {rs.length > PALETTE.length && (
          <li>
            <span className="mc-journeycard__dot" style={{ background: OLDER }} aria-hidden="true" />
            Older
          </li>
        )}
      </ul>
    </Card>
  );
}
