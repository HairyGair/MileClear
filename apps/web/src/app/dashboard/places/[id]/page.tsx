"use client";

import { use } from "react";
import type { SavedLocation } from "@mileclear/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useMe } from "@/lib/dashboard/useMe";
import { useData } from "@/lib/dashboard/useData";
import { PlaceForm } from "@/components/dashboard/driving/PlaceForm";

export default function PlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isPro } = useMe();
  const place = useData(`place-${id}`, () => api.get<{ data: SavedLocation }>(`/saved-locations/${id}`));
  return (
    <>
      <PageHeader title={place.data?.data.name ?? "Saved place"} back={{ href: "/dashboard/places", label: "Saved places" }} />
      {place.loading && !place.data ? (
        <Skeleton variant="card" />
      ) : place.error && !place.data ? (
        /not found/i.test(place.error.message) ? (
          <EmptyState icon="location-outline" title="Place not found" body="It may have been deleted." action={{ label: "Back to saved places", href: "/dashboard/places" }} />
        ) : (
          <ErrorState title="Couldn't load this place" onRetry={place.reload} />
        )
      ) : place.data ? (
        <PlaceForm key={place.data.data.id} place={place.data.data} count={0} isPro={isPro} />
      ) : null}
    </>
  );
}
