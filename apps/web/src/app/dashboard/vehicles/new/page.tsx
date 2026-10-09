"use client";

import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useMe } from "@/lib/dashboard/useMe";
import { useData } from "@/lib/dashboard/useData";
import { fetchVehicles } from "@/components/dashboard/driving/api";
import { VehicleForm } from "@/components/dashboard/driving/VehicleForm";

export default function NewVehiclePage() {
  const { isPro } = useMe();
  const { data, error, loading, reload } = useData("vehicles", fetchVehicles);
  return (
    <>
      <PageHeader title="Add vehicle" back={{ href: "/dashboard/vehicles", label: "Vehicles" }} />
      <div className="mc-narrow">
        {loading && !data ? (
          <Skeleton variant="card" />
        ) : error && !data ? (
          <ErrorState title="Couldn't load your vehicles" onRetry={reload} />
        ) : (
          <VehicleForm vehicle={null} all={data ?? []} isPro={isPro} />
        )}
      </div>
    </>
  );
}
