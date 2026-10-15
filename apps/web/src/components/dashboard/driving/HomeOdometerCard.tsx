"use client";

import Link from "next/link";
import { Card } from "../kit/Card";
import { useData } from "../../../lib/dashboard/useData";
import { fetchVehicleOdometer, fetchVehicles } from "./api";
import {
  formatOdo,
  homeOdometerLine,
  homeVehicleName,
  selectHomeOdometerVehicles,
} from "./odometerLogic";
import type { OdometerCurrent } from "@mileclear/shared";
import styles from "./driving.module.css";

/**
 * Home card (15 Oct 2026): the running odometer of each vehicle with a reading
 * (up to three, primary first), so it can be read without opening the log.
 * Both modes. Hidden when no vehicle has a reading or the request fails. Free.
 */
export function HomeOdometerCard(_props: { mode: "work" | "personal" }): React.ReactElement | null {
  const vehicles = useData("vehicles", fetchVehicles, { revalidateOnFocus: true });
  const shown = selectHomeOdometerVehicles(vehicles.data);
  const ids = shown.map((v) => v.id).join(",");
  // The line under each figure; the figure itself comes with the vehicles list.
  const details = useData(
    ids ? `odometer-home-${ids}` : null,
    async () => {
      const out = new Map<string, OdometerCurrent | null>();
      await Promise.all(
        shown.map(async (v) => {
          try {
            out.set(v.id, (await fetchVehicleOdometer(v.id)).current ?? null);
          } catch {
            out.set(v.id, null);
          }
        })
      );
      return out;
    },
    { revalidateOnFocus: true }
  );

  if (shown.length === 0) return null;
  const now = new Date();
  const first = shown[0];

  return (
    <Card
      title="Odometer"
      padded={false}
      action={{ label: "Odometer log", href: `/dashboard/odometer?vehicle=${encodeURIComponent(first.id)}` }}
    >
      <ul className={styles.list}>
        {shown.map((v) => {
          const name = homeVehicleName(v);
          const line = homeOdometerLine(details.data?.get(v.id), now);
          const estimated = !!v.odometer.isEstimated;
          const label = `${name} odometer, ${estimated ? "estimated" : "recorded"}, ${formatOdo(v.odometer.miles)} miles.${line ? ` ${line}.` : ""} Opens the odometer log.`;
          return (
            <li key={v.id}>
              <Link href={`/dashboard/odometer?vehicle=${encodeURIComponent(v.id)}`} className={styles.listRow} aria-label={label}>
                <span className={styles.listMain}>
                  <span className={styles.listTitle}>{name}</span>
                  {line && <span className={styles.listSub}>{line}</span>}
                </span>
                <span className={styles.homeOdoFigure}>
                  {formatOdo(v.odometer.miles)} mi
                  {estimated && <span className={styles.homeOdoEst}> est.</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
