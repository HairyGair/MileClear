"use client";

import { api } from "@/lib/api";
import type { SavedLocation } from "@mileclear/shared";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useMe } from "@/lib/dashboard/useMe";
import { useData } from "@/lib/dashboard/useData";
import { PlaceForm } from "@/components/dashboard/driving/PlaceForm";

export default function NewPlacePage() {
  const { isPro } = useMe();
  const places = useData("places", () => api.get<{ data: SavedLocation[] }>("/saved-locations"));
  return (
    <>
      <PageHeader title="Add place" back={{ href: "/dashboard/places", label: "Saved places" }} />
      {places.loading && !places.data ? (
        <Skeleton variant="card" />
      ) : places.error && !places.data ? (
        <ErrorState title="Couldn't load your places" onRetry={places.reload} />
      ) : (
        <PlaceForm place={null} count={places.data?.data.length ?? 0} isPro={isPro} />
      )}
    </>
  );
}
