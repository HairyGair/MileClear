"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Skeleton } from "@/components/dashboard/kit";
import { TripForm, type TripPrefill } from "@/components/dashboard/trips/TripForm";

function num(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function place(label: string | null, lat: number | undefined, lng: number | undefined) {
  if (lat != null && lng != null) return { label: label || "Pinned location", lat, lng };
  return label ? { label } : undefined;
}

function NewTrip() {
  const sp = useSearchParams() ?? new URLSearchParams();
  const prefill: TripPrefill = {
    missedId: sp.get("missedId") ?? undefined,
    from: place(sp.get("fromAddress"), num(sp.get("fromLat")), num(sp.get("fromLng"))),
    to: place(sp.get("toAddress"), num(sp.get("toLat")), num(sp.get("toLng"))),
    start: sp.get("start") ?? undefined,
    end: sp.get("end") ?? undefined,
    gap: sp.get("gap") === "1",
    windowStart: sp.get("windowStart") ?? undefined,
    windowEnd: sp.get("windowEnd") ?? undefined,
  };
  return <TripForm mode="add" prefill={prefill} />;
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Add a trip" back={{ href: "/dashboard/trips", label: "Trips" }} />
          <Skeleton variant="card" height={240} />
        </>
      }
    >
      <NewTrip />
    </Suspense>
  );
}
