"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { Icon } from "../kit/Icon";
import { useData } from "../../../lib/dashboard/useData";
import { safeGet, safeSet } from "../../../lib/dashboard/mode";
import { fetchVehicleOdometer, fetchVehicles, type VehicleRow } from "./api";
import { shouldShowOdometerPrompt } from "./odometerLogic";
import { UpdateReadingDialog } from "./UpdateReadingDialog";
import styles from "./driving.module.css";

const DISMISS_KEY = "mc_odometer_prompt_dismissed";

/**
 * Home card, shown once: "Need odometer readings for work?". Work mode, a vehicle
 * with no reading yet, 3 or more trips, not dismissed on this browser. "Not now"
 * hides it for good; saving a reading does too.
 */
export function OdometerPromptCard({ mode }: { mode: "work" | "personal" }): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(true);
  const [open, setOpen] = useState(false);
  useEffect(() => setDismissed(safeGet(DISMISS_KEY) === "1"), []);

  const active = mode === "work" && !dismissed;
  const vehicles = useData(active ? "vehicles" : null, fetchVehicles);
  const trips = useData(active ? "trips-count" : null, () =>
    api.get<{ total?: number; data?: unknown[] }>("/trips?page=1&pageSize=1").then((r) => r.total ?? r.data?.length ?? 0)
  );
  const list: VehicleRow[] = vehicles.data ?? [];
  const vehicle = list.find((v) => v.isPrimary) ?? list[0] ?? null;
  const odo = useData(active && vehicle ? `odometer-${vehicle.id}` : null, () => fetchVehicleOdometer(vehicle!.id));

  if (!active || !vehicle || !odo.data || trips.data == null) return null;
  const show = shouldShowOdometerPrompt({
    isWork: true,
    vehicleCount: list.length,
    defaultVehicleHasReading: odo.data.readings.length > 0 || vehicle.odometer != null,
    completedTrips: trips.data,
    dismissedOnDevice: dismissed,
  });
  if (!show) return null;

  function hide() {
    safeSet(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <Card>
      <div className={styles.stack}>
        <Icon name="speedometer-outline" size={24} />
        <div>
          <h3 className={styles.promptTitle}>Need odometer readings for work?</h3>
          <p className={styles.muted}>
            Type in your odometer once. MileClear adds your trips so you can see the reading at the start and end of each day.
          </p>
        </div>
        <div className={styles.actionsRow}>
          <Button variant="secondary" onClick={() => setOpen(true)}>Add reading</Button>
          <Button variant="ghost" onClick={hide}>Not now</Button>
        </div>
      </div>
      <UpdateReadingDialog
        open={open}
        vehicle={vehicle}
        estimateMiles={odo.data.current?.miles ?? null}
        readings={odo.data.readings}
        onClose={() => setOpen(false)}
        onSaved={hide}
      />
    </Card>
  );
}
