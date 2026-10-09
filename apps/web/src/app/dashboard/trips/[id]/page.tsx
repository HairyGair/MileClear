"use client";

import { useParams } from "next/navigation";
import { TripDetail } from "@/components/dashboard/trips/TripDetail";

export default function Page() {
  const id = useParams<{ id: string }>()?.id ?? "";
  return <TripDetail id={id} />;
}
