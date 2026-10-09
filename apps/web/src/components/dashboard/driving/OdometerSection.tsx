"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OdometerReadingEntry } from "@mileclear/shared";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { ConfirmDialog } from "../kit/Dialog";
import { CardError, Skeleton } from "../kit/States";
import { useToast } from "../kit/Toast";
import { useData } from "../../../lib/dashboard/useData";
import { formatDayTime } from "../../../lib/dashboard/dates";
import { deleteOdometerReading, fetchVehicleOdometer, type VehicleRow } from "./api";
import { OdometerChip, OdometerFigure } from "./OdometerFigure";
import { UpdateReadingDialog } from "./UpdateReadingDialog";
import { basisText, figureText, formatOdo, oldReadingText, sourceLabel } from "./odometerLogic";
import styles from "./driving.module.css";

/**
 * Odometer card on the vehicle page: the running figure, how it was worked out,
 * Update reading, Daily log and the list of every reading.
 * Free for everyone. Copy is odometer spec section 8, word for word.
 */
export function OdometerSection({ vehicle }: { vehicle: VehicleRow }) {
  const { show } = useToast();
  const { data, error, loading, reload } = useData(`odometer-${vehicle.id}`, () => fetchVehicleOdometer(vehicle.id));
  const [updateOpen, setUpdateOpen] = useState(false);
  const [showReadings, setShowReadings] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<OdometerReadingEntry | null>(null);
  const readingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#readings") setShowReadings(true);
  }, []);
  useEffect(() => {
    if (!outcome) return;
    const t = window.setTimeout(() => setOutcome(null), 4000);
    return () => window.clearTimeout(t);
  }, [outcome]);

  const current = data?.current ?? null;
  const readings = data?.readings ?? [];
  const old = current ? oldReadingText(current) : null;

  return (
    <Card title="Odometer" id="odometer">
      {loading && !data ? (
        <Skeleton variant="figure" />
      ) : error && !data ? (
        <CardError onRetry={reload} />
      ) : current ? (
        <div className={styles.stack}>
          <div className={styles.actionsRow}>
            <OdometerFigure miles={current.miles} estimated={current.isEstimated} />
            <OdometerChip estimated={current.isEstimated} />
          </div>
          <p className={styles.muted}>{basisText(current)}</p>
          <span className="mc-sr-only">{figureText(current)}</span>
          {old && <p className={styles.hint}>{old}</p>}
          {outcome && <p className={styles.ok} role="status">{outcome}</p>}
          <div className={styles.actionsRow}>
            <Button variant="secondary" onClick={() => setUpdateOpen(true)}>Update reading</Button>
            <Button variant="ghost" href={`/dashboard/odometer?vehicle=${vehicle.id}`}>Daily log</Button>
            <Button variant="link" size="sm" onClick={() => setShowReadings((s) => !s)} aria-expanded={showReadings}>
              All readings
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.stack}>
          <div>
            <h3 className={styles.promptTitle}>Keep a running odometer</h3>
            <p className={styles.muted}>
              Type in the reading on your dashboard and MileClear adds your trips to it. You&apos;ll see the reading at the
              start and end of each day.
            </p>
          </div>
          {outcome && <p className={styles.ok} role="status">{outcome}</p>}
          <div className={styles.actionsRow}>
            <Button variant="secondary" onClick={() => setUpdateOpen(true)}>Add reading</Button>
            {readings.length > 0 && (
              <Button variant="link" size="sm" onClick={() => setShowReadings((s) => !s)} aria-expanded={showReadings}>
                All readings
              </Button>
            )}
          </div>
        </div>
      )}

      {showReadings && (
        <div id="readings" ref={readingsRef} className={`${styles.stack} ${styles.mtLg}`}>
          <hr className={styles.divider} />
          <h3 className={styles.promptTitle}>Odometer readings</h3>
          {readings.length === 0 ? (
            <p className={styles.muted}>No readings yet.</p>
          ) : (
            <div>
              {readings.map((r) => (
                <div key={r.id} className={styles.readingRow}>
                  <div className={styles.readingMain}>
                    <p className={styles.readingFig}>{formatOdo(r.readingMiles)} miles</p>
                    <p className={styles.readingSub}>
                      {formatDayTime(r.readAt)} · {sourceLabel(r.source)}
                    </p>
                    {!r.used && (
                      <p className={styles.readingWarn}>
                        Not used: looks wrong{r.rejectReason ? `. ${r.rejectReason}` : ""}
                      </p>
                    )}
                    {r.source === "trip" && (
                      <Link href={`/dashboard/trips/${r.sourceId}`} className="mc-textlink">Change it on the trip</Link>
                    )}
                    {r.source === "fuel" && (
                      <Link href="/dashboard/fuel" className="mc-textlink">Change it on the fuel log</Link>
                    )}
                  </div>
                  {r.source === "user" && (
                    <Button variant="ghost" size="sm" onClick={() => setToDelete(r)} aria-label={`Delete reading of ${formatOdo(r.readingMiles)} miles`}>
                      Delete reading
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <UpdateReadingDialog
        open={updateOpen}
        vehicle={vehicle}
        estimateMiles={current?.miles ?? null}
        readings={readings}
        onClose={() => setUpdateOpen(false)}
        onSaved={(msg) => {
          setOutcome(msg);
          reload();
        }}
        onSeeReadings={() => setShowReadings(true)}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete this reading?"
        body="Your daily log will be worked out again from your other readings and trips."
        confirmLabel="Delete"
        destructive
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          await deleteOdometerReading(vehicle.id, toDelete.id);
          show("Deleted");
          reload();
        }}
      />
    </Card>
  );
}
