"use client";

import { useParams } from "next/navigation";
import { api, isApiError } from "@/lib/api";
import { EmptyState, ErrorState, PageHeader, Skeleton, useData } from "@/components/dashboard/kit";
import { TripForm } from "@/components/dashboard/trips/TripForm";
import type { TripDetailData } from "@/components/dashboard/trips/lib/types";

export default function Page() {
  const id = useParams<{ id: string }>()?.id ?? "";
  const trip = useData<TripDetailData>(`trip:${id}`, () => api.get<{ data: TripDetailData }>(`/trips/${id}`).then((r) => r.data));
  const back = { href: id ? `/dashboard/trips/${id}` : "/dashboard/trips", label: "Trip" };

  if (trip.error) {
    const missing = isApiError(trip.error) && trip.error.statusCode === 404;
    return (
      <>
        <PageHeader title="Edit trip" back={back} />
        {missing ? (
          <EmptyState
            icon="car-outline"
            title="Trip not found"
            body="It may have been deleted or merged."
            action={{ label: "Back to trips", href: "/dashboard/trips" }}
          />
        ) : (
          <ErrorState title="Couldn't load this trip" onRetry={trip.reload} />
        )}
      </>
    );
  }
  if (!trip.data) {
    return (
      <>
        <PageHeader title="Edit trip" back={back} />
        <Skeleton variant="card" height={240} />
      </>
    );
  }
  return <TripForm key={trip.data.id} mode="edit" trip={trip.data} />;
}
