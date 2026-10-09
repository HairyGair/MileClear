"use client";

import { Card } from "../kit/Card";
import { CardError, EmptyState, Skeleton } from "../kit/States";
import { StatusChip } from "../kit/Controls";
import { useData } from "../../../lib/dashboard/useData";
import { formatDay } from "../../../lib/dashboard/dates";
import { fetchMotHistory, type VehicleRow } from "./api";
import { formatOdo } from "./odometerLogic";
import styles from "./driving.module.css";

function resultWord(result: string): { label: string; tone: "green" | "red" | "neutral" } {
  const r = result.toUpperCase();
  if (r.startsWith("PASS")) return { label: "Passed", tone: "green" };
  if (r.startsWith("FAIL")) return { label: "Failed", tone: "red" };
  return { label: result.charAt(0).toUpperCase() + result.slice(1).toLowerCase(), tone: "neutral" };
}

/** MOT history from GET /vehicles/:id/mot-history, newest test first. */
export function MotHistory({ vehicle }: { vehicle: VehicleRow }) {
  const hasPlate = !!vehicle.registrationPlate;
  const { data, error, loading, reload } = useData(hasPlate ? `mot-${vehicle.id}` : null, () => fetchMotHistory(vehicle.id));
  const tests = [...(data?.motTests ?? [])].sort((a, b) => new Date(b.completedDate).getTime() - new Date(a.completedDate).getTime());

  return (
    <Card title="MOT history">
      {!hasPlate ? (
        <p className={styles.muted}>Add a registration to see this vehicle&apos;s MOT history.</p>
      ) : loading && !data ? (
        <Skeleton variant="row" count={2} />
      ) : error ? (
        <CardError onRetry={reload} />
      ) : tests.length === 0 ? (
        <EmptyState size="card" icon="document-text-outline" title="No MOT history found for this vehicle" body="New cars don't need an MOT for 3 years." />
      ) : (
        <div>
          {tests.map((t) => {
            const res = resultWord(t.testResult);
            const notes = t.defects ?? [];
            return (
              <div key={t.motTestNumber || t.completedDate} className={styles.motTest}>
                <div className={styles.motHead}>
                  <span className={styles.bold}>{formatDay(t.completedDate)}</span>
                  <StatusChip tone={res.tone} label={res.label} />
                </div>
                <p className={styles.hint}>
                  {t.odometerValue != null
                    ? `${formatOdo(t.odometerValue)} ${t.odometerUnit?.toLowerCase().startsWith("k") ? "km" : "miles"}`
                    : "No mileage recorded"}
                  {t.expiryDate ? ` · MOT runs to ${formatDay(t.expiryDate)}` : ""}
                </p>
                {notes.length > 0 && (
                  <details>
                    <summary className={styles.link}>
                      {notes.length} {notes.length === 1 ? "note" : "notes"} from this test
                    </summary>
                    <ul className={styles.motList}>
                      {notes.map((d, i) => (
                        <li key={i}>
                          {d.type.charAt(0) + d.type.slice(1).toLowerCase()}: {d.text}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
