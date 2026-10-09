"use client";

import { useRouter, useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api, isApiError } from "@/lib/api";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  MapView,
  PageHeader,
  Skeleton,
  useData,
  useToast,
  useUnclassifiedCount,
} from "@/components/dashboard/kit";
import { formatMiles } from "@/lib/dashboard";
import { formatDwell } from "@/components/dashboard/trips/lib/stops";
import type { TripDetailData } from "@/components/dashboard/trips/lib/types";
import "@/components/dashboard/trips/trips.css";

interface Suggestion {
  cutIndex: number;
  timestamp: string;
  lat: number;
  lng: number;
  dwellSec: number;
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function Page() {
  const id = useParams<{ id: string }>()?.id ?? "";
  const router = useRouter();
  const toast = useToast();
  const unclassified = useUnclassifiedCount();
  const back = { href: `/dashboard/trips/${id}`, label: "Trip" };

  const trip = useData<TripDetailData>(`trip:${id}`, () => api.get<{ data: TripDetailData }>(`/trips/${id}`).then((r) => r.data));
  const sug = useData<Suggestion[]>(`split:${id}`, () =>
    api.get<{ data: { suggestions: Suggestion[] } }>(`/trips/${id}/split-suggestions`).then((r) => r.data.suggestions ?? [])
  );
  const [off, setOff] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);

  const suggestions = sug.data ?? [];
  const chosen = suggestions.filter((s) => !off.includes(s.timestamp));
  const legs = chosen.length + 1;

  const route = useMemo(() => {
    const t = trip.data;
    if (!t) return [];
    const pts = (t.matchedCoordinates?.length ? t.matchedCoordinates : t.coordinates) ?? [];
    const step = Math.max(1, Math.floor(pts.length / 1500));
    const coords = pts.filter((_, i) => i % step === 0).map((c) => [c.lat, c.lng] as [number, number]);
    return coords.length > 1 ? [{ coords }] : [];
  }, [trip.data]);

  const failed = trip.error || sug.error;
  if (failed) {
    const missing = isApiError(failed) && failed.statusCode === 404;
    return (
      <>
        <PageHeader title="Split trip" back={back} />
        {missing ? (
          <EmptyState icon="car-outline" title="Trip not found" body="It may have been deleted or merged." action={{ label: "Back to trips", href: "/dashboard/trips" }} />
        ) : (
          <ErrorState
            title="Couldn't load the stops for this trip"
            onRetry={() => {
              trip.reload();
              sug.reload();
            }}
          />
        )}
      </>
    );
  }
  if (!trip.data || !sug.data) {
    return (
      <>
        <PageHeader title="Split trip" back={back} />
        <Skeleton variant="card" count={2} height={160} />
      </>
    );
  }
  if (suggestions.length === 0) {
    return (
      <>
        <PageHeader title="Split trip" back={back} />
        <EmptyState
          icon="flag-outline"
          title="No stops to split at"
          body="We split at stops of a few minutes or more. This trip didn't have one."
          action={{ label: "Back to trip", href: back.href }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Split trip"
        back={back}
        primary={
          <Button variant="primary" disabled={chosen.length === 0} onClick={() => setConfirm(true)}>
            {chosen.length === 0 ? "Choose a stop" : `Split into ${legs} trips`}
          </Button>
        }
      >
        We found {suggestions.length} {suggestions.length === 1 ? "stop" : "stops"} along this trip. Your {formatMiles(trip.data.distanceMiles)} stay
        exactly as recorded.
      </PageHeader>
      <div className="mc-split">
        <div className="mc-stack mc-stack--tight">
          <MapView
            height={320}
            routes={route}
            markers={chosen.map((s) => ({ lat: s.lat, lng: s.lng, kind: "place" as const, label: `Stopped ${formatDwell(s.dwellSec)}` }))}
            fitTo="routes"
          />
        </div>
        <Card padded={false}>
          <div role="group" aria-label="Stops to split at">
            {suggestions.map((s) => {
              const on = !off.includes(s.timestamp);
              const inputId = `split-${s.cutIndex}`;
              return (
                <div key={s.timestamp} className="mc-splitrow">
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mc-check"
                    checked={on}
                    onChange={() => setOff((o) => (on ? [...o, s.timestamp] : o.filter((x) => x !== s.timestamp)))}
                  />
                  <label htmlFor={inputId}>
                    <span className="mc-splitrow__title">Stopped {formatDwell(s.dwellSec)}</span>
                    <span className="mc-splitrow__sub">at {clock(s.timestamp)}</span>
                  </label>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <ConfirmDialog
        open={confirm}
        title={`Split into ${legs} trips?`}
        body={`This replaces the current trip with ${legs} separate trips. Each keeps this trip's classification and can be edited on its own. The total mileage stays the same.`}
        confirmLabel="Split"
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await api.post(`/trips/${id}/split`, { cutTimestamps: chosen.map((s) => s.timestamp) });
          toast.show(`Split into ${legs} trips`);
          unclassified.refresh();
          router.replace("/dashboard/trips");
        }}
      />
    </>
  );
}
