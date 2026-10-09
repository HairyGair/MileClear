"use client";

import { Card } from "../kit/Card";
import { Skeleton } from "../kit/States";
import { useData } from "../../../lib/dashboard/useData";
import { bodyLine, fetchRoadAlerts, whenText } from "./roadAlerts";
import styles from "./driving.module.css";

/**
 * Home card: serious events on your usual roads right now. Hidden when there are
 * none, when the feature is off, and when the request fails.
 */
export function RoadAlertsCard(_props: { mode: "work" | "personal" }): React.ReactElement | null {
  const { data, loading } = useData("road-alerts", fetchRoadAlerts);
  if (loading && !data) return <Card title="Road alerts"><Skeleton variant="text" /></Card>;
  const items = (data?.enabled ? data.current : []).filter((i) => !i.ongoing).slice(0, 2);
  if (items.length === 0) return null;
  const more = (data?.current.filter((i) => !i.ongoing).length ?? 0) - items.length;
  return (
    <Card title="On your roads" action={{ label: more > 0 ? `See all (${more + items.length})` : "See all", href: "/dashboard/road-alerts" }}>
      <ul className={`${styles.list} ${styles.plainList}`}>
        {items.map((i) => (
          <li key={i.id} className={styles.rowTight}>
            <p className={styles.alertTitle}>{i.headline}</p>
            {bodyLine(i) && <p className={styles.alertBody}>{bodyLine(i)}</p>}
            {whenText(i) && <p className={styles.alertMeta}>{whenText(i)}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
