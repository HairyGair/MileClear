"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Card } from "../kit/Card";
import { useData } from "../../../lib/dashboard/useData";
import { fetchVehicles } from "./api";
import { formatOdo, homeOdometerLine, homeVehicleName, selectHomeOdometerVehicles } from "./odometerLogic";
import styles from "./driving.module.css";

/** Coming back to the tab re-reads the figure, at most once a minute. */
const FOCUS_GAP_MS = 60_000;

/**
 * Home card (15 Oct 2026): the running odometer of each vehicle with a reading
 * (up to three, primary first), so it can be read without opening the log.
 * One request: /vehicles carries the figure and the reading it is built on.
 * Both modes. Hidden when no vehicle has a reading or the request fails. Free.
 */
export function HomeOdometerCard(_props: { mode: "work" | "personal" }): React.ReactElement | null {
  const vehicles = useData("vehicles", fetchVehicles);
  const { reload } = vehicles;
  const lastAt = useRef(Date.now());
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastAt.current < FOCUS_GAP_MS) return;
      lastAt.current = Date.now();
      reload();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const shown = selectHomeOdometerVehicles(vehicles.data);
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
          const line = homeOdometerLine(v.odometer, now);
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
