"use client";

import { use } from "react";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useMe } from "@/lib/dashboard/useMe";
import { useData } from "@/lib/dashboard/useData";
import { formatDay } from "@/lib/dashboard/dates";
import { fetchVehicles } from "@/components/dashboard/driving/api";
import { VehicleForm } from "@/components/dashboard/driving/VehicleForm";
import { OdometerSection } from "@/components/dashboard/driving/OdometerSection";
import { MotHistory } from "@/components/dashboard/driving/MotHistory";
import styles from "@/components/dashboard/driving/driving.module.css";

function vehicleName(v: { make?: string | null; model?: string | null; registrationPlate?: string | null; nickname?: string | null } | null): string {
  if (!v) return "Vehicle";
  const name = [v.make, v.model].filter(Boolean).join(" ").trim();
  return name || v.registrationPlate || "Vehicle";
}

export default function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { isPro } = useMe();
  const { data, error, loading, reload } = useData("vehicles", fetchVehicles);
  const vehicle = data?.find((v) => v.id === id) ?? null;

  return (
    <>
      <PageHeader title={vehicleName(vehicle)} back={{ href: "/dashboard/vehicles", label: "Vehicles" }}>
        {vehicle && (vehicle.motExpiryDate || vehicle.taxDueDate) && (
          <span className={styles.muted}>
            {[
              vehicle.motExpiryDate && `MOT due ${formatDay(vehicle.motExpiryDate)}`,
              vehicle.taxDueDate && `Tax due ${formatDay(vehicle.taxDueDate)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </PageHeader>
      {loading && !data ? (
        <Skeleton variant="card" count={2} />
      ) : error && !data ? (
        <ErrorState title="Couldn't load this vehicle" onRetry={reload} />
      ) : !vehicle ? (
        <EmptyState icon="car-outline" title="Vehicle not found" body="It may have been deleted." action={{ label: "Back to vehicles", href: "/dashboard/vehicles" }} />
      ) : (
        <div className={styles.cols}>
          <VehicleForm key={vehicle.id} vehicle={vehicle} all={data ?? []} isPro={isPro} onSaved={reload} />
          <div className={styles.stack}>
            <OdometerSection vehicle={vehicle} />
            <MotHistory vehicle={vehicle} />
          </div>
        </div>
      )}
    </>
  );
}
