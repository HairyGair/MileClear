"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/dashboard/kit/Button";
import { Card } from "@/components/dashboard/kit/Card";
import { StatusChip } from "@/components/dashboard/kit/Controls";
import { EmptyState, ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { Icon } from "@/components/dashboard/kit/Icon";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { useMe } from "@/lib/dashboard/useMe";
import { useData } from "@/lib/dashboard/useData";
import { formatDay } from "@/lib/dashboard/dates";
import { formatPence } from "@mileclear/shared";
import { fetchVehicles, vehicleName, type VehicleRow } from "@/components/dashboard/driving/api";
import { ProDialog } from "@/components/dashboard/driving/ProDialog";
import { vehicleCardMeta, vehicleCardMetaA11y } from "@/components/dashboard/driving/odometerLogic";
import styles from "@/components/dashboard/driving/driving.module.css";

function VehicleCard({ v }: { v: VehicleRow }) {
  const caz = v.cleanAirZones;
  const charging = caz && caz.verdict === "non_compliant" ? caz.zones.filter((z) => z.chargesThisVehicle).slice(0, 3) : [];
  const odo = vehicleCardMeta(v.odometer);
  return (
    <Link href={`/dashboard/vehicles/${v.id}`} className={`mc-card mc-card--link ${styles.vehicleCard}`} aria-label={`${vehicleName(v)}${v.registrationPlate ? `, ${v.registrationPlate}` : ""}`}>
      <div className={styles.vehicleHead}>
        <span className={styles.vehicleIcon}>
          <Icon name="car-outline" size={22} />
        </span>
        <div>
          <p className={styles.vehicleTitle}>{vehicleName(v)}</p>
          {v.year && <p className={styles.hint}>{v.year}</p>}
        </div>
      </div>
      {v.registrationPlate && <span className={styles.plate}>{v.registrationPlate}</span>}
      <div className={styles.chipRow}>
        {v.isPrimary && <StatusChip tone="amber" label="Primary" />}
        {v.providedByOthers && <StatusChip tone="neutral" label="Someone else pays" />}
        {caz && caz.verdict === "non_compliant" && <StatusChip tone="amber" icon="warning-outline" label="Clean air zone: may be charged" />}
        {caz && caz.verdict === "compliant" && <StatusChip tone="green" icon="checkmark-circle-outline" label="Clean air zone: ready" />}
      </div>
      {charging.length > 0 && (
        <p className={styles.hint}>{charging.map((z) => `${z.city} ${formatPence(z.chargePence ?? 0)} a day`).join(", ")}</p>
      )}
      <div className={styles.metaRow}>
        {v.vehicleType && <span>{v.vehicleType.charAt(0).toUpperCase() + v.vehicleType.slice(1)}</span>}
        {v.fuelType && <span>{v.fuelType.charAt(0).toUpperCase() + v.fuelType.slice(1)}</span>}
        {odo && <span className={styles.num} aria-label={vehicleCardMetaA11y(v.odometer) ?? undefined}>{odo}</span>}
        {v.motExpiryDate && <span>MOT due {formatDay(v.motExpiryDate)}</span>}
        {v.taxDueDate && <span>Tax due {formatDay(v.taxDueDate)}</span>}
      </div>
    </Link>
  );
}

export default function VehiclesPage() {
  const { isPro } = useMe();
  const { data, error, loading, reload } = useData("vehicles", fetchVehicles);
  const [proOpen, setProOpen] = useState(false);
  const vehicles = data ?? [];
  const ownCount = vehicles.filter((v) => !v.providedByOthers).length;
  const atLimit = !isPro && ownCount >= 1;

  const add = atLimit ? (
    <Button variant="primary" onClick={() => setProOpen(true)}>Add vehicle</Button>
  ) : (
    <Button variant="primary" href="/dashboard/vehicles/new">Add vehicle</Button>
  );

  return (
    <>
      <PageHeader title="Vehicles" back={{ href: "/dashboard/more", label: "More" }} primary={vehicles.length > 0 ? add : undefined} />
      {loading && !data ? (
        <Skeleton variant="card" count={2} />
      ) : error && !data ? (
        <ErrorState title="Couldn't load your vehicles" onRetry={reload} />
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon="car-outline"
          title="Add your vehicle"
          body="We use it for the right mileage rate and your odometer."
          action={{ label: "Add vehicle", href: "/dashboard/vehicles/new" }}
        />
      ) : (
        <div className={styles.stack}>
          <div className={styles.vehicleGrid}>
            {vehicles.map((v) => (
              <VehicleCard key={v.id} v={v} />
            ))}
          </div>
          {!isPro && (
            <Card tone="quiet">
              <p className={styles.muted}>Free accounts have 1 vehicle of their own. Pro has no limit.</p>
            </Card>
          )}
        </div>
      )}
      <ProDialog
        open={proOpen}
        reason="vehicles"
        onClose={() => setProOpen(false)}
        body="Free accounts can have 1 vehicle. Pro has no limit. £4.99 a month, cancel any time."
      />
    </>
  );
}
