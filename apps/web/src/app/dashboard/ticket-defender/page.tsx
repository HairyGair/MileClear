"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TICKET_NOTICE_TYPES, formatPence, formatMiles } from "@mileclear/shared";
import type { CazChargeItem, TicketDefenderLookup, TicketNoticeType } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button } from "@/components/dashboard/kit/Button";
import { Card, SectionHeader } from "@/components/dashboard/kit/Card";
import { StatusChip } from "@/components/dashboard/kit/Controls";
import { DateField, SelectField, TextField, TimeField } from "@/components/dashboard/kit/Fields";
import { PageHeader } from "@/components/dashboard/kit/PageHeader";
import { PlaceField, type PlaceValue } from "@/components/dashboard/kit/PlaceField";
import { ProGate } from "@/components/dashboard/kit/Pro";
import { EmptyState, ErrorState, Skeleton } from "@/components/dashboard/kit/States";
import { useToast } from "@/components/dashboard/kit/Toast";
import { useData } from "@/lib/dashboard/useData";
import { formatDay, formatDayTime, formatRange } from "@/lib/dashboard/dates";
import { downloadFile, fetchVehicles, fromInputs, toDateInput, toTimeInput, vehicleName } from "@/components/dashboard/driving/api";
import styles from "@/components/dashboard/driving/driving.module.css";

const POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/;

interface Params {
  at: string;
  lat?: number;
  lng?: number;
  postcode?: string;
  locationLabel?: string;
  vehicleId?: string;
  noticeType?: TicketNoticeType;
  reference?: string;
}

function queryOf(p: Params): string {
  return Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function CheckAFine() {
  const search = useSearchParams();
  const tripId = search?.get("tripId") ?? null;
  const { show } = useToast();
  const vehicles = useData("vehicles", fetchVehicles);
  const now = new Date();
  const [date, setDate] = useState(toDateInput(now));
  const [time, setTime] = useState(toTimeInput(now));
  const [where, setWhere] = useState<PlaceValue | null>(null);
  const [reference, setReference] = useState("");
  const [noticeType, setNoticeType] = useState<string>("other");
  const [vehicleId, setVehicleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ lookup: TicketDefenderLookup; params: Params } | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ?tripId= preselects the trip: its start time and vehicle fill the form.
  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    api
      .get<{ data: { startedAt: string; vehicleId: string | null } }>(`/trips/${encodeURIComponent(tripId)}`)
      .then((r) => {
        if (cancelled || !r.data?.startedAt) return;
        const d = new Date(r.data.startedAt);
        setDate(toDateInput(d));
        setTime(toTimeInput(d));
        if (r.data.vehicleId) setVehicleId(r.data.vehicleId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  async function check() {
    setError(null);
    setPdfError(null);
    if (!date || !time) return setError("Add the date and time on the notice.");
    const params: Params = { at: fromInputs(date, time).toISOString(), noticeType: noticeType as TicketNoticeType };
    if (reference.trim()) params.reference = reference.trim();
    if (vehicleId) params.vehicleId = vehicleId;
    if (where?.lat != null && where?.lng != null) {
      params.lat = where.lat;
      params.lng = where.lng;
      params.locationLabel = where.label;
    } else if (where?.label) {
      if (POSTCODE.test(where.label.trim())) params.postcode = where.label.trim();
      else params.locationLabel = where.label.trim();
    }
    setBusy(true);
    try {
      const { noticeType: _n, reference: _r, ...lookupBody } = params;
      void _n;
      void _r;
      const res = await api.post<{ data: TicketDefenderLookup }>("/ticket-defender/lookup", lookupBody);
      setResult({ lookup: res.data, params });
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Couldn't check that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pack() {
    if (!result) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const stamp = result.params.at.slice(0, 16).replace(/[-:T]/g, "");
      const res = await downloadFile(`/ticket-defender/pack?${queryOf(result.params)}`, `mileclear-journey-record-${stamp}.pdf`);
      if (!res.ok) setPdfError(res.message);
      else show("Saved");
    } catch {
      setPdfError("Couldn't download that. Try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  const lookup = result?.lookup;

  return (
    <div className={styles.stack}>
      <SectionHeader title="Check a fine" subtitle="See what MileClear recorded around the time on the notice." />
      <Card>
        <form
          className={styles.stack}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
        >
          <div className={`${styles.formGrid} ${styles.formGrid2}`}>
            <DateField label="Date on the notice" value={date} onChange={setDate} required />
            <TimeField label="Time on the notice" value={time} onChange={setTime} required />
          </div>
          <PlaceField label="Location or postcode" value={where} onChange={setWhere} allowMap={false} />
          <div className={`${styles.formGrid} ${styles.formGrid2}`}>
            <SelectField
              label="Type of notice"
              value={noticeType}
              onChange={setNoticeType}
              options={TICKET_NOTICE_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            />
            <TextField label="Reference" value={reference} onChange={setReference} required={false} maxLength={40} />
          </div>
          {(vehicles.data ?? []).length > 0 && (
            <SelectField
              label="Vehicle"
              value={vehicleId}
              onChange={setVehicleId}
              required={false}
              options={[{ value: "", label: "Any vehicle" }, ...(vehicles.data ?? []).map((v) => ({ value: v.id, label: vehicleName(v) || "Vehicle" }))]}
            />
          )}
          {error && <p className={styles.err} role="alert">{error}</p>}
          <div className={styles.actionsRow}>
            <Button type="submit" variant="primary" loading={busy}>Check my trips</Button>
          </div>
        </form>
      </Card>

      {lookup && (
        <Card title="What we recorded" data-testid="td-result">
          <div className={styles.stack}>
            <div className={styles.chipRow}>
              <StatusChip
                tone={lookup.status === "recorded" ? "green" : "neutral"}
                label={lookup.status === "recorded" ? "Trip recorded" : lookup.status === "manual_only" ? "Added by hand only" : "Nothing recorded"}
              />
              <span className={styles.muted}>{formatDayTime(lookup.at)}</span>
            </div>
            {lookup.summary.map((line, i) => (
              <p key={i} className={styles.muted}>{line}</p>
            ))}
            {lookup.trips.length > 0 && (
              <ul className={styles.list}>
                {lookup.trips.map((t) => (
                  <li key={t.id} className={`${styles.listRow} ${styles.rowMid}`}>
                    <span className={styles.listMain}>
                      <span className={styles.listTitle}>
                        {t.startAddress ?? "Start"} to {t.endAddress ?? "end"}
                      </span>
                      <span className={styles.listSub}>
                        {formatDay(t.startedAt)}, {t.endedAt ? formatRange(t.startedAt, t.endedAt) : "in progress"}
                        {t.vehicleLabel ? ` · ${t.vehicleLabel}` : ""}
                        {t.isManualEntry ? " · Added by hand" : ""}
                      </span>
                    </span>
                    <span className={styles.listFig}>{formatMiles(t.distanceMiles)} mi</span>
                  </li>
                ))}
              </ul>
            )}
            {lookup.caveats.map((c, i) => (
              <p key={i} className={styles.hint}>{c}</p>
            ))}
            <div className={styles.actionsRow}>
              <Button variant="secondary" icon="download-outline" loading={pdfBusy} onClick={pack}>
                Download evidence pack (PDF)
              </Button>
            </div>
            {pdfError && <p className={styles.err} role="alert">{pdfError}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function CazCharges() {
  const { show } = useToast();
  const { data, error, loading, reload } = useData("caz-charges", () =>
    api.get<{ data: CazChargeItem[] }>("/ticket-defender/caz-charges").then((r) => r.data ?? [])
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function mark(c: CazChargeItem, paid: boolean) {
    const tripId = c.tripIds[0];
    if (!tripId) return;
    setBusyKey(c.key);
    try {
      await api.post(`/ticket-defender/caz-charges/${encodeURIComponent(tripId)}/paid`, { zoneId: c.zoneId, paid });
      show(paid ? "Marked as paid" : "Marked as not paid");
      reload();
    } catch (e) {
      show(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      setBusyKey(null);
    }
  }

  const tone = (s: CazChargeItem["status"]) => (s === "paid" ? "green" : s === "overdue" ? "red" : s === "due" ? "amber" : "neutral");
  const word = (s: CazChargeItem["status"]) => (s === "paid" ? "Paid" : s === "overdue" ? "Overdue" : s === "due" ? "To pay" : "Check the zone");

  return (
    <div className={styles.stack}>
      <SectionHeader title="Clean air zone charges" subtitle="Charges for trips through a zone, and when to pay them." />
      {loading && !data ? (
        <Skeleton variant="row" count={2} />
      ) : error && !data ? (
        <ErrorState size="card" title="Couldn't load your charges" onRetry={reload} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState size="card" icon="shield-checkmark-outline" title="No clean air zone charges" body="Trips through a charging zone show up here." />
      ) : (
        <Card padded={false}>
          <ul className={styles.list}>
            {data!.map((c) => (
              <li key={c.key} className={`${styles.listRow} ${styles.alignTop}`}>
                <div className={styles.listMain}>
                  <p className={styles.listTitle}>
                    {c.zoneName} · {formatDay(c.travelDay)} · {formatPence(c.chargePence)}
                  </p>
                  <p className={styles.listSub}>
                    {c.deadline ? `Pay by ${formatDay(c.deadline.deadlineDay)}` : "Check the zone's website for when to pay"}
                  </p>
                  <div className={styles.chipRow}>
                    <StatusChip tone={tone(c.status)} label={word(c.status)} />
                  </div>
                </div>
                <div className={styles.actionsRow}>
                  {(c.deadline?.payUrl || c.infoUrl) && (
                    <Button variant="link" size="sm" href={c.deadline?.payUrl ?? c.infoUrl ?? "#"} external>
                      Pay online
                    </Button>
                  )}
                  {c.status === "paid" ? (
                    <Button variant="ghost" size="sm" loading={busyKey === c.key} onClick={() => mark(c, false)}>Mark unpaid</Button>
                  ) : (
                    <Button variant="secondary" size="sm" loading={busyKey === c.key} onClick={() => mark(c, true)}>Mark paid</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function TicketDefenderPage() {
  return (
    <>
      <PageHeader title="Ticket defender" back={{ href: "/dashboard/more", label: "More" }} />
      <ProGate
        reason="ticket_defender"
        page
        teaser={<p className={styles.muted}>Check a fine against the trips MileClear recorded, and download a record you can send with an appeal.</p>}
      >
        <div className={styles.stack}>
          <Suspense fallback={<Skeleton variant="card" />}>
            <CheckAFine />
          </Suspense>
          <CazCharges />
        </div>
      </ProGate>
    </>
  );
}
