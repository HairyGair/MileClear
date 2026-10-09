"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { OdometerDayWithVehicle } from "@mileclear/shared";
import { Button } from "@/components/dashboard/kit/Button";
import { Card } from "@/components/dashboard/kit/Card";
import { Dialog } from "@/components/dashboard/kit/Dialog";
import { DateField } from "@/components/dashboard/kit/Fields";
import { FilterChips } from "@/components/dashboard/kit/Controls";
import { Icon } from "@/components/dashboard/kit/Icon";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { ProChip } from "@/components/dashboard/kit/Pro";
import { EmptyState, ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useMe } from "@/lib/dashboard/useMe";
import { useData } from "@/lib/dashboard/useData";
import { useMediaQuery } from "@/lib/dashboard/useMediaQuery";
import { safeGet, safeSet } from "@/lib/dashboard/mode";
import { planHref } from "@/lib/dashboard/proReasons";
import {
  downloadFile,
  fetchOdometerDays,
  fetchVehicleOdometer,
  fetchVehicles,
  vehicleName,
  type VehicleRow,
} from "@/components/dashboard/driving/api";
import { UpdateReadingDialog } from "@/components/dashboard/driving/UpdateReadingDialog";
import {
  differenceAlert,
  differenceLine,
  dayCardA11y,
  formatDayMiles,
  formatOdo,
  isOdometerPeriod,
  mileageRowParts,
  parseDayKey,
  periodRange,
  PERIOD_LABELS,
  shortDate,
  signedMiles,
  validateCustomRange,
  type OdometerPeriod,
} from "@/components/dashboard/driving/odometerLogic";
import styles from "@/components/dashboard/driving/driving.module.css";

const PERIOD_KEY = "mc_odometer_period";
const PERIOD_OPTIONS: { value: OdometerPeriod; label: string }[] = (
  ["this_week", "last_week", "this_month", "custom"] as OdometerPeriod[]
).map((value) => ({ value, label: PERIOD_LABELS[value] }));

function dayLabel(date: string): string {
  const d = parseDayKey(date);
  return d ? shortDate(d) : date;
}

function Reading({ value, recorded }: { value: number | null; recorded: boolean }) {
  if (value == null) return <span className={styles.hint}>No reading yet</span>;
  return (
    <>
      <span className={styles.dayFig}>{formatOdo(value)}</span>
      {recorded ? (
        <span className={`${styles.dayMark} ${styles.dayMarkRec}`}>
          <Icon name="checkmark-circle-outline" size={12} />
          Recorded
        </span>
      ) : (
        <span className={styles.dayMark} aria-label="estimated">est.</span>
      )}
    </>
  );
}

function OdometerLogInner() {
  const { isPro } = useMe();
  const router = useRouter();
  const search = useSearchParams();
  const wantedVehicle = search?.get("vehicle");
  const wantedDate = search?.get("date");

  const vehicles = useData("vehicles", fetchVehicles);
  const list: VehicleRow[] = vehicles.data ?? [];
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const vehicle = list.find((v) => v.id === (vehicleId ?? wantedVehicle)) ?? list.find((v) => v.isPrimary) ?? list[0] ?? null;

  const [period, setPeriod] = useState<OdometerPeriod>("this_week");
  const [custom, setCustom] = useState<{ from: string; to: string }>(() => periodRange("this_month"));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [why, setWhy] = useState<OdometerDayWithVehicle | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const wide = useMediaQuery("(min-width: 768px)");

  // A day linked from the Trips list needs a range that contains it.
  useEffect(() => {
    const saved = safeGet(PERIOD_KEY);
    if (wantedDate && /^\d{4}-\d{2}-\d{2}$/.test(wantedDate)) {
      setPeriod("custom");
      const d = parseDayKey(wantedDate);
      if (d) {
        const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 3, 12);
        const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3, 12);
        const k = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
        setCustom({ from: k(from), to: k(to) });
      }
    } else if (isOdometerPeriod(saved)) {
      setPeriod(saved);
    }
  }, [wantedDate]);

  const range = period === "custom" ? custom : periodRange(period);
  const customError = (() => {
    if (period !== "custom") return null;
    const a = parseDayKey(custom.from);
    const b = parseDayKey(custom.to);
    return a && b ? validateCustomRange(a, b) : "Pick both dates.";
  })();

  const odo = useData(vehicle ? `odometer-${vehicle.id}` : null, () => fetchVehicleOdometer(vehicle!.id));
  const days = useData(
    vehicle && !customError ? `odo-days-${vehicle.id}-${range.from}-${range.to}` : null,
    () => fetchOdometerDays({ vehicleId: vehicle!.id, from: range.from, to: range.to })
  );
  const rows = useMemo(() => [...(days.data ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [days.data]);

  // ?date= scrolls to that day and outlines it for two seconds.
  useEffect(() => {
    if (!wantedDate || rows.length === 0) return;
    const el = document.getElementById(`day-${wantedDate}`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    setFlash(wantedDate);
    const t = window.setTimeout(() => setFlash(null), 2000);
    return () => window.clearTimeout(t);
  }, [wantedDate, rows.length]);

  function choosePeriod(p: OdometerPeriod) {
    setPeriod(p);
    safeSet(PERIOD_KEY, p);
    if (wantedDate) router.replace("/dashboard/odometer" + (vehicle ? `?vehicle=${vehicle.id}` : ""));
  }

  async function download() {
    if (!vehicle) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const q = new URLSearchParams({ vehicleId: vehicle.id, from: range.from, to: range.to });
      const res = await downloadFile(`/exports/odometer-log?${q.toString()}`, `mileclear-odometer-log-${range.from}-to-${range.to}.csv`);
      if (!res.ok) setDownloadError(res.message);
    } catch {
      setDownloadError("Couldn't download that. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  const current = odo.data?.current ?? null;
  const hasPrimary = !!vehicle && !!current;

  return (
    <>
      <PageHeader
        title="Odometer log"
        back={{ href: "/dashboard/more", label: "More" }}
        primary={hasPrimary ? <Button variant="primary" onClick={() => setDialogOpen(true)}>Update reading</Button> : undefined}
      />
      {vehicles.loading && !vehicles.data ? (
        <Skeleton variant="card" count={2} />
      ) : vehicles.error && !vehicles.data ? (
        <ErrorState title="Couldn't load your odometer log" onRetry={vehicles.reload} />
      ) : !vehicle ? (
        <EmptyState
          icon="speedometer-outline"
          title="Add a vehicle first"
          body="The odometer belongs to a vehicle. Add yours and type in its reading."
          action={{ label: "Add vehicle", href: "/dashboard/vehicles/new" }}
        />
      ) : (
        <div className={styles.stack}>
          {list.length > 1 && (
            <FilterChips
              ariaLabel="Vehicle"
              single
              options={list.map((v) => ({ value: v.id, label: vehicleName(v) }))}
              value={[vehicle.id]}
              onChange={(v) => setVehicleId(v[0] ?? vehicle.id)}
            />
          )}

          {odo.loading && !odo.data ? (
            <Skeleton variant="card" />
          ) : odo.error && !odo.data ? (
            <ErrorState title="Couldn't load your odometer log" onRetry={odo.reload} />
          ) : !current ? (
            <EmptyState
              icon="speedometer-outline"
              title="Add your odometer reading"
              body="Type in the number on your dashboard. MileClear adds your trips to it and shows the reading at the start and end of each day."
              action={{ label: "Add reading", onClick: () => setDialogOpen(true) }}
            />
          ) : (
            <>
              <Card tone="default">
                <div className={styles.topCard}>
                  <h2 className={styles.topTitle}>
                    {current.isEstimated ? "Now about" : "Now"} {formatOdo(current.miles)} miles
                  </h2>
                  <p className={styles.muted}>
                    {current.isEstimated
                      ? `Estimated from your reading on ${shortDate(new Date(current.basis.readAt))} plus your trips.`
                      : `Your reading on ${shortDate(new Date(current.basis.readAt))}.`}
                  </p>
                </div>
              </Card>

              <div className={styles.stack}>
                <FilterChips
                  ariaLabel="Period"
                  single
                  options={PERIOD_OPTIONS}
                  value={[period]}
                  onChange={(v) => choosePeriod(v[0] ?? period)}
                />
                {period === "custom" && (
                  <div className={`${styles.formGrid} ${styles.formGrid2}`}>
                    <DateField label="From" value={custom.from} onChange={(v) => setCustom((c) => ({ ...c, from: v }))} />
                    <DateField label="To" value={custom.to} onChange={(v) => setCustom((c) => ({ ...c, to: v }))} error={customError ?? undefined} />
                  </div>
                )}
                <p className={styles.hint}>
                  Recorded = a reading you or a trip gave us. est. = worked out from your trips.
                </p>
              </div>

              {days.loading && !days.data ? (
                <Skeleton variant="row" count={4} />
              ) : days.error && !days.data ? (
                <ErrorState title="Couldn't load your odometer log" onRetry={days.reload} />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon="calendar-outline"
                  title="No driving in these dates"
                  body="Pick other dates, or check back after your next trip."
                />
              ) : wide ? (
                <div className="mc-card mc-card--flush mc-tablewrap">
                  <table className="mc-table" aria-label="Odometer by day">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Start</th>
                        <th scope="col">End</th>
                        <th scope="col" className="is-right">Business</th>
                        <th scope="col" className="is-right">Personal</th>
                        <th scope="col" className="is-right">Not sorted</th>
                        <th scope="col">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d) => {
                        const diff = differenceLine(d.difference);
                        return (
                          <tr key={d.date} id={`day-${d.date}`} className={flash === d.date ? styles.dayCardFlash : undefined}>
                            <td>
                              <Link href={`/dashboard/trips?from=${d.date}&to=${d.date}`} className="mc-textlink">{dayLabel(d.date)}</Link>
                            </td>
                            <td><Reading value={d.opening} recorded={d.openingRecorded} /></td>
                            <td><Reading value={d.closing} recorded={d.closingRecorded} /></td>
                            <td className="is-right mc-num">{formatDayMiles(d.businessMiles)} mi</td>
                            <td className="is-right mc-num">{formatDayMiles(d.personalMiles)} mi</td>
                            <td className="is-right mc-num">
                              {Math.round(d.notSortedMiles * 10) > 0 ? (
                                <Link href={`/dashboard/trips?view=inbox&from=${d.date}&to=${d.date}`} className="mc-textlink">
                                  {formatDayMiles(d.notSortedMiles)} mi
                                </Link>
                              ) : (
                                "0.0 mi"
                              )}
                            </td>
                            <td>
                              {diff ? (
                                <button type="button" className={styles.diffBtn} onClick={() => setWhy(d)}>
                                  {signedMiles(d.difference)}
                                </button>
                              ) : (
                                <span className={styles.hint}>None</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.stack}>
                  {rows.map((d) => {
                    const diff = differenceLine(d.difference);
                    const date = parseDayKey(d.date);
                    return (
                      <Card
                        key={d.date}
                        id={`day-${d.date}`}
                        className={`${styles.dayCard} ${flash === d.date ? styles.dayCardFlash : ""}`}
                        aria-label={date ? dayCardA11y(d, date) : undefined}
                      >
                        <div className={styles.dayHead}>
                          <h2 className={styles.dayDate}>{dayLabel(d.date)}</h2>
                          <Link href={`/dashboard/trips?from=${d.date}&to=${d.date}`} className="mc-textlink">See trips</Link>
                        </div>
                        <div className={styles.dayRows}>
                          <div className={styles.dayRow}>
                            <span className={styles.dayLabel}>Start</span>
                            <Reading value={d.opening} recorded={d.openingRecorded} />
                          </div>
                          <div className={styles.dayRow}>
                            <span className={styles.dayLabel}>End</span>
                            <Reading value={d.closing} recorded={d.closingRecorded} />
                          </div>
                        </div>
                        <p className={styles.split}>
                          {mileageRowParts(d).map((p) =>
                            p.startsWith("Not sorted") ? (
                              <Link key={p} href={`/dashboard/trips?view=inbox&from=${d.date}&to=${d.date}`} className="mc-textlink">{p}</Link>
                            ) : (
                              <span key={p}>{p}</span>
                            )
                          )}
                        </p>
                        {diff && (
                          <button type="button" className={styles.diffBtn} onClick={() => setWhy(d)}>
                            {diff}
                          </button>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}

              <p className={styles.hint}>Figures marked est. can change if you edit, add or delete trips.</p>

              <Card tone="quiet">
                <div className={styles.actionsRow}>
                  {isPro ? (
                    <Button variant="secondary" icon="download-outline" loading={downloading} onClick={download} disabled={!!customError}>
                      Download as CSV
                    </Button>
                  ) : (
                    <Button variant="secondary" icon="lock-closed-outline" href={planHref("odometer_log_csv")}>
                      Download as CSV
                    </Button>
                  )}
                  <ProChip />
                  <span className={styles.hint}>For your employer&apos;s mileage form</span>
                </div>
                {downloadError && <p className={styles.err} role="alert">{downloadError}</p>}
              </Card>
            </>
          )}
        </div>
      )}

      {vehicle && (
        <UpdateReadingDialog
          open={dialogOpen}
          vehicle={vehicle}
          estimateMiles={current?.miles ?? null}
          readings={odo.data?.readings ?? []}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            odo.reload();
            days.reload();
          }}
          onSeeReadings={() => router.push(`/dashboard/vehicles/${vehicle.id}#readings`)}
        />
      )}
      <Dialog
        open={!!why}
        title={why ? differenceAlert(why.difference).title : "Why the difference?"}
        size="sm"
        onClose={() => setWhy(null)}
        footer={<Button variant="secondary" onClick={() => setWhy(null)}>OK</Button>}
      >
        {why && <p className="mc-dialog__text">{differenceAlert(why.difference).body}</p>}
      </Dialog>
    </>
  );
}

export default function OdometerLogPage() {
  return (
    <Suspense fallback={<Skeleton variant="card" count={2} />}>
      <OdometerLogInner />
    </Suspense>
  );
}
