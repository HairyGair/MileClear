"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChargePoint, CheapestTodayResponse, FuelLogWithVehicle, FuelStation, NationalAveragePrices } from "@mileclear/shared";
import { formatPence } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/dashboard/kit/Button";
import { Card, SectionHeader } from "@/components/dashboard/kit/Card";
import { DataTable } from "@/components/dashboard/kit/DataTable";
import { ConfirmDialog, Dialog } from "@/components/dashboard/kit/Dialog";
import { DateField, MoneyField, NumberField, SelectField, TextField, TimeField } from "@/components/dashboard/kit/Fields";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { StatTile } from "@/components/dashboard/kit/Figure";
import { EmptyState, ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useToast } from "@/components/dashboard/kit/Toast";
import { useData } from "@/lib/dashboard/useData";
import { formatDay } from "@/lib/dashboard/dates";
import { safeGet, safeSet } from "@/lib/dashboard/mode";
import { fetchVehicles, fromInputs, toDateInput, toTimeInput, vehicleName } from "@/components/dashboard/driving/api";
import styles from "@/components/dashboard/driving/driving.module.css";
import { dedupeStations, stationLabels } from "./stations";

const PAGE_SIZE = 20;
const POSTCODE_KEY = "mc_fuel_postcode";

interface LogsResponse {
  data: FuelLogWithVehicle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const ppl = (pence: number) => `${(Math.round(pence * 10) / 10).toFixed(1)}p`;

function monthStartIso(): string {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString();
}

/** The add and edit dialog for one fill-up. Cost is typed in pounds and sent as pence. */
function FuelLogDialog({
  log,
  open,
  vehicles,
  onClose,
  onSaved,
  onDelete,
}: {
  log: FuelLogWithVehicle | null;
  open: boolean;
  vehicles: { id: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
  onDelete?: (log: FuelLogWithVehicle) => void;
}) {
  const { show } = useToast();
  const [vehicleId, setVehicleId] = useState("");
  const [litres, setLitres] = useState("");
  const [cost, setCost] = useState<number | null>(null);
  const [station, setStation] = useState("");
  const [odo, setOdo] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const when = log ? new Date(log.loggedAt) : new Date();
    setVehicleId(log?.vehicleId ?? vehicles[0]?.id ?? "");
    setLitres(log ? String(log.litres) : "");
    setCost(log ? log.costPence : null);
    setStation(log?.stationName ?? "");
    setOdo(log?.odometerReading != null ? String(log.odometerReading) : "");
    setDate(toDateInput(when));
    setTime(toTimeInput(when));
    setError(null);
    setFormKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, log]);

  async function save() {
    const l = parseFloat(litres);
    if (!Number.isFinite(l) || l <= 0) return setError("Enter the litres.");
    if (!cost || cost <= 0) return setError("Enter what it cost.");
    const o = odo ? parseFloat(odo) : null;
    setSaving(true);
    setError(null);
    try {
      const body = {
        vehicleId: vehicleId || (log ? null : undefined),
        litres: l,
        costPence: cost,
        stationName: station.trim() || (log ? null : undefined),
        odometerReading: o && o > 0 ? o : log ? null : undefined,
        loggedAt: fromInputs(date, time).toISOString(),
      };
      if (log) await api.patch(`/fuel/logs/${log.id}`, body);
      else await api.post("/fuel/logs", body);
      show("Saved");
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      title={log ? "Edit fill-up" : "Log fill-up"}
      onClose={onClose}
      footer={
        <>
          {log && onDelete && (
            <Button variant="destructive" onClick={() => onDelete(log)}>Delete</Button>
          )}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save}>Save</Button>
        </>
      }
    >
      <div className={styles.stack} key={formKey}>
        {vehicles.length > 0 && (
          <SelectField
            label="Vehicle"
            value={vehicleId}
            onChange={setVehicleId}
            options={[{ value: "", label: "No vehicle" }, ...vehicles.map((v) => ({ value: v.id, label: v.label }))]}
          />
        )}
        <div className={`${styles.formGrid} ${styles.formGrid2}`}>
          <NumberField label="Litres" value={litres} onChange={setLitres} suffix="L" />
          <MoneyField label="Cost" value={cost} onChange={setCost} />
        </div>
        <TextField label="Station" value={station} onChange={setStation} required={false} />
        <NumberField label="Odometer" value={odo} onChange={setOdo} suffix="miles" required={false} decimals={false} />
        <div className={`${styles.formGrid} ${styles.formGrid2}`}>
          <DateField label="Date" value={date} onChange={setDate} />
          <TimeField label="Time" value={time} onChange={setTime} />
        </div>
        {error && <p className={styles.err} role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}

interface PricesState {
  stations: FuelStation[];
  nationalAverage: NationalAveragePrices | null;
  chargers: ChargePoint[];
  attribution: string;
}

function PricesNearYou({ hasEv }: { hasEv: boolean }) {
  const [postcode, setPostcode] = useState("");
  const [state, setState] = useState<PricesState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rate = useData(hasEv ? "charging-rate" : null, () => api.get<{ data: { pencePerKwh: number; source: string } }>("/charging/electricity-rate"));

  useEffect(() => {
    const saved = safeGet(POSTCODE_KEY);
    if (saved) setPostcode(saved);
  }, []);

  async function lookUp() {
    const pc = postcode.trim();
    if (pc.length < 2) return setError("Enter a postcode.");
    setBusy(true);
    setError(null);
    try {
      const geo = await api.get<{ data: { lat: number; lng: number }[] }>(`/geocode/search?q=${encodeURIComponent(pc)}&limit=1`);
      const hit = geo.data?.[0];
      if (!hit) {
        setState(null);
        setError("We couldn't find that postcode. Check it and try again.");
        return;
      }
      safeSet(POSTCODE_KEY, pc);
      const q = `lat=${hit.lat}&lng=${hit.lng}&radiusMiles=5`;
      const [prices, chargers] = await Promise.all([
        api.get<{ stations: FuelStation[]; nationalAverage: NationalAveragePrices | null }>(`/fuel/prices?${q}`),
        hasEv
          ? api.get<{ chargers: ChargePoint[]; attribution: string }>(`/charging/nearby?${q}`).catch(() => ({ chargers: [], attribution: "" }))
          : Promise.resolve({ chargers: [] as ChargePoint[], attribution: "" }),
      ]);
      setState({ stations: prices.stations ?? [], nationalAverage: prices.nationalAverage, chargers: chargers.chargers ?? [], attribution: chargers.attribution });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load prices. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const stations = useMemo(() => dedupeStations(state?.stations ?? []).sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, 20), [state]);
  const labels = useMemo(() => stationLabels(stations), [stations]);

  return (
    <div className={styles.stack}>
      <SectionHeader title="Prices near you" />
      <Card>
        <form
          className={styles.stack}
          onSubmit={(e) => {
            e.preventDefault();
            void lookUp();
          }}
        >
          <div className={styles.copyRow}>
            <div className={styles.grow}>
              <TextField label="Postcode" value={postcode} onChange={setPostcode} placeholder="e.g. NE1 4ST" autoComplete="postal-code" />
            </div>
            <div className={styles.alignEnd}>
              <Button type="submit" variant="secondary" loading={busy}>Show prices</Button>
            </div>
          </div>
          {error && <p className={styles.err} role="alert">{error}</p>}
        </form>
      </Card>
      {!state ? (
        <EmptyState size="card" icon="location-outline" title="Enter a postcode" body="We'll show prices at stations nearby." />
      ) : (
        <>
          {state.nationalAverage && (
            <p className={styles.muted}>
              UK average today: petrol {ppl(state.nationalAverage.petrolPencePerLitre)}, diesel {ppl(state.nationalAverage.dieselPencePerLitre)} a litre.
            </p>
          )}
          {stations.length === 0 ? (
            <EmptyState size="card" icon="water-outline" title="No stations found" body="Try a postcode a little further out." />
          ) : (
            <DataTable
              rows={stations}
              rowKey={(s) => s.siteId}
              columns={[
                { key: "stationName", label: "Station", render: (s) => labels.get(s) ?? s.stationName },
                { key: "petrol", label: "Petrol, a litre", align: "right", render: (s) => (s.prices.E10 != null ? ppl(s.prices.E10) : "No price") },
                { key: "diesel", label: "Diesel, a litre", align: "right", render: (s) => (s.prices.B7 != null ? ppl(s.prices.B7) : "No price") },
                { key: "distanceMiles", label: "Distance", align: "right", render: (s) => `${s.distanceMiles.toFixed(1)} mi` },
              ]}
            />
          )}
          {hasEv && (
            <div className={styles.stack}>
              <SectionHeader title="Charging" subtitle={rate.data ? `Your electricity rate is ${ppl(rate.data.data.pencePerKwh)} a kWh.` : undefined} />
              {state.chargers.length === 0 ? (
                <EmptyState size="card" icon="flash-outline" title="No chargers found" body="Try a postcode a little further out." />
              ) : (
                <Card padded={false}>
                  <ul className={styles.list}>
                    {state.chargers.slice(0, 10).map((c) => (
                      <li key={c.id} className={styles.listRow}>
                        <div className={styles.listMain}>
                          <p className={styles.listTitle}>{c.name}</p>
                          <p className={styles.listSub}>
                            {[c.operator, c.connectors.map((k) => `${k.type}${k.powerKw ? ` ${k.powerKw}kW` : ""}`).join(", ")].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <span className={styles.listFig}>{c.distanceMiles.toFixed(1)} mi</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {state.attribution && <p className={styles.hint}>{state.attribution}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function FuelPage() {
  const { show } = useToast();
  const [page, setPage] = useState(1);
  const logs = useData(`fuel-logs-${page}`, () => api.get<LogsResponse>(`/fuel/logs?page=${page}&pageSize=${PAGE_SIZE}`));
  const from = useMemo(monthStartIso, []);
  const month = useData("fuel-month", () => api.get<LogsResponse>(`/fuel/logs?from=${encodeURIComponent(from)}&page=1&pageSize=200`));
  const miles = useData("fuel-month-miles", () =>
    api.get<{ data: { totalMiles: number } }>(`/trips/summary?from=${encodeURIComponent(from)}`).catch(() => null)
  );
  const cheapest = useData("fuel-cheapest", () => api.get<CheapestTodayResponse>("/fuel/cheapest-today").catch(() => null));
  const vehicles = useData("vehicles", fetchVehicles);
  const [editing, setEditing] = useState<FuelLogWithVehicle | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<FuelLogWithVehicle | null>(null);

  const rows = logs.data?.data ?? [];
  const totalPages = logs.data?.totalPages ?? 1;
  const monthRows = month.data?.data ?? [];
  const monthSpend = monthRows.reduce((s, l) => s + l.costPence, 0);
  const monthLitres = monthRows.reduce((s, l) => s + l.litres, 0);
  const monthMiles = miles.data?.data?.totalMiles ?? 0;
  const hasEv = (vehicles.data ?? []).some((v) => v.fuelType === "electric");
  const vehicleOptions = (vehicles.data ?? []).map((v) => ({ id: v.id, label: vehicleName(v) }));
  const empty = !logs.loading && logs.data && logs.data.total === 0;

  function reloadAll() {
    logs.reload();
    month.reload();
  }
  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Fuel"
        back={{ href: "/dashboard/more", label: "More" }}
        primary={!empty ? <Button variant="primary" onClick={openAdd}>Log fill-up</Button> : undefined}
      />
      <div className={styles.stack}>
        {cheapest.data?.data?.line && (
          <Card tone="quiet">
            <p className={styles.bold}>Cheapest today</p>
            <p className={styles.muted}>{cheapest.data.data.line}</p>
          </Card>
        )}

        {logs.loading && !logs.data ? (
          <Skeleton variant="row" count={5} />
        ) : logs.error && !logs.data ? (
          <ErrorState title="Couldn't load your fuel" onRetry={logs.reload} />
        ) : empty ? (
          <EmptyState icon="water-outline" title="No fill-ups yet" body="Log a fill-up to see your fuel costs." action={{ label: "Log fill-up", onClick: openAdd }} />
        ) : (
          <>
            <div className={`${styles.statGrid} ${styles.statGrid3}`}>
              <StatTile label="Spent this month" value={monthRows.length ? formatPence(monthSpend) : null} />
              <StatTile label="Average a litre" value={monthLitres > 0 ? ppl(monthSpend / monthLitres) : null} note="This month" />
              <StatTile label="Cost a mile" value={monthSpend > 0 && monthMiles > 0 ? ppl(monthSpend / monthMiles) : null} note="This month" />
            </div>

            <SectionHeader title="Fill-ups" subtitle={`${logs.data?.total ?? 0} in total`} />
            <DataTable
              rows={rows}
              rowKey={(l) => l.id}
              onRowClick={(l) => {
                setEditing(l);
                setDialogOpen(true);
              }}
              columns={[
                { key: "loggedAt", label: "Date", render: (l) => formatDay(l.loggedAt) },
                { key: "stationName", label: "Station", render: (l) => l.stationName ?? "No station" },
                { key: "perLitre", label: "A litre", align: "right", hideBelow: 768, render: (l) => ppl(l.costPence / l.litres) },
                { key: "vehicle", label: "Vehicle", hideBelow: 1024, render: (l) => (l.vehicle ? `${l.vehicle.make} ${l.vehicle.model}` : "No vehicle") },
                { key: "litres", label: "Litres", align: "right", render: (l) => `${l.litres.toFixed(1)} L` },
                { key: "costPence", label: "Cost", align: "right", render: (l) => formatPence(l.costPence) },
              ]}
            />
            {totalPages > 1 && (
              <div className={styles.actionsRow}>
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className={styles.muted}>Page {page} of {totalPages}</span>
                <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </>
        )}

        <PricesNearYou hasEv={hasEv} />
      </div>

      <FuelLogDialog
        open={dialogOpen}
        log={editing}
        vehicles={vehicleOptions}
        onClose={() => setDialogOpen(false)}
        onSaved={reloadAll}
        onDelete={(l) => {
          setDialogOpen(false);
          setToDelete(l);
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        title="Delete this fill-up?"
        body="It goes from your fuel costs. This can't be undone."
        confirmLabel="Delete"
        destructive
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          await api.delete(`/fuel/logs/${toDelete.id}`);
          show("Deleted");
          reloadAll();
        }}
      />
    </>
  );
}
