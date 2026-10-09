"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { SavedLocation } from "@mileclear/shared";
import { api, isApiError } from "../../../lib/api";
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  FilterChips,
  Icon,
  MapView,
  Menu,
  PageHeader,
  SelectField,
  Skeleton,
  TextArea,
  TextField,
  useData,
  useMe,
  useToast,
  useUnclassifiedCount,
  type MenuItem,
} from "../kit";
import { formatDay, formatMiles, formatPence, formatRange, planHref } from "../../../lib/dashboard";
import { useMediaQuery } from "../../../lib/dashboard/useMediaQuery";
import { isoToLocalYmd } from "./lib/days";
import { CLASSIFICATION_WORD, type CazCharge, type Classification, type TripDetailData } from "./lib/types";
import {
  CATEGORY_OPTIONS,
  PLATFORM_OPTIONS,
  PURPOSE_OPTIONS,
  categoryLabel,
  errorText,
  platformLabel,
  purposeLabel,
} from "./lib/labels";
import { routeTitle, tripEndLabel, type PlaceCircle } from "./lib/placeLabel";
import { MIN_POINTS_FOR_SPEED, findStops, formatDwell, speedSeries } from "./lib/stops";
import "./trips.css";

const MAX_ROUTE_POINTS = 1500;

function thin<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

function durationText(startIso: string, endIso: string | null): string {
  if (!endIso) return "";
  const mins = Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return mins % 60 === 0 ? `${h} hr` : `${h} hr ${mins % 60} min`;
}

export function TripDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const unclassified = useUnclassifiedCount();
  const trip = useData<TripDetailData>(`trip:${id}`, async () => {
    // The trip can briefly 503 right after it is saved. Try again before showing an error.
    for (let attempt = 0; ; attempt++) {
      try {
        return (await api.get<{ data: TripDetailData }>(`/trips/${id}`)).data;
      } catch (e) {
        const transient = isApiError(e) && (e.statusCode === 502 || e.statusCode === 503 || e.statusCode === 504);
        if (!transient || attempt >= 2) throw e;
        await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      }
    }
  });
  const places = useData<SavedLocation[]>("trips:places", () =>
    api.get<{ data: SavedLocation[] }>("/saved-locations").then((r) => r.data ?? [])
  );
  const labels = useData<string[]>("trips:project-labels", () =>
    api
      .get<{ data: { labels: string[] } }>("/trips/project-labels")
      .then((r) => r.data?.labels ?? [])
      .catch(() => [])
  );
  const circles: PlaceCircle[] = useMemo(
    () => (places.data ?? []).map((p) => ({ name: p.name, lat: p.latitude, lng: p.longitude, radiusMeters: p.radiusMeters })),
    [places.data]
  );
  const wide = useMediaQuery("(min-width: 1024px)");

  // A local copy so one-tap changes show at once.
  const [local, setLocal] = useState<TripDetailData | null>(null);
  useEffect(() => {
    if (trip.data) setLocal(trip.data);
  }, [trip.data]);
  const t = local;

  const [confirm, setConfirm] = useState<null | "delete" | "recalc">(null);
  const [anomalyOpen, setAnomalyOpen] = useState(false);
  const [placeFor, setPlaceFor] = useState<null | "start" | "end">(null);

  const from = t ? tripEndLabel(t.startAddress, t.startLat, t.startLng, circles) : "";
  const to = t ? tripEndLabel(t.endAddress, t.endLat, t.endLng, circles) : "";

  if (trip.error && !t) {
    const missing = isApiError(trip.error) && trip.error.statusCode === 404;
    return (
      <>
        <PageHeader title="Trip" back={{ href: "/dashboard/trips", label: "Trips" }} />
        {missing ? (
          <EmptyState
            icon="car-outline"
            title="Trip not found"
            body="It may have been deleted or merged."
            action={{ label: "Back to trips", href: "/dashboard/trips" }}
          />
        ) : (
          <ErrorState title="Couldn't load this trip" onRetry={trip.reload} />
        )}
      </>
    );
  }
  if (!t) {
    return (
      <>
        <PageHeader title="Trip" back={{ href: "/dashboard/trips", label: "Trips" }} />
        <Skeleton variant="card" count={2} height={180} />
      </>
    );
  }

  async function patch(body: Record<string, unknown>, okText?: string): Promise<boolean> {
    if (!t) return false;
    const before = t;
    setLocal({ ...t, ...(body as Partial<TripDetailData>) });
    try {
      await api.patch(`/trips/${t.id}`, body);
      if (okText) toast.show(okText);
      return true;
    } catch (e) {
      setLocal(before);
      toast.show(errorText(e), "error");
      return false;
    }
  }

  async function classify(c: Classification) {
    if (!t || c === t.classification) return;
    const ok = await patch({ classification: c }, `Saved as ${CLASSIFICATION_WORD[c]}`);
    if (ok) unclassified.refresh();
  }

  const title = routeTitle(from, to);
  const coords = t.coordinates ?? [];
  const raw = thin(coords.map((c) => [c.lat, c.lng] as [number, number]), MAX_ROUTE_POINTS);
  const matched = t.matchedCoordinates ? thin(t.matchedCoordinates.map((c) => [c.lat, c.lng] as [number, number]), MAX_ROUTE_POINTS) : null;
  const routes = matched
    ? [
        ...(raw.length > 1 ? [{ coords: raw, color: "#64748b", dashed: true }] : []),
        { coords: matched, color: "#f5a623" },
      ]
    : raw.length > 1
      ? [{ coords: raw, color: "#f5a623" }]
      : [];
  const markers =
    routes.length > 0
      ? [
          { lat: t.startLat, lng: t.startLng, kind: "start" as const, label: from || "Start" },
          ...(t.endLat != null && t.endLng != null ? [{ lat: t.endLat, lng: t.endLng, kind: "end" as const, label: to || "End" }] : []),
        ]
      : [];

  const showPlatform = t.classification === "business" && !me.isCompanyDriver && me.user?.workType !== "employee";
  const showPurpose = t.classification === "business" && me.isEmployee;
  const showCategory = t.classification === "personal";
  const merge = t.mergeSuggestion;
  const caz = t.cleanAirZones?.charges ?? [];

  const items: MenuItem[] = [];
  if (!t.isManualEntry) items.push({ label: "Split this trip", href: `/dashboard/trips/${t.id}/split` });
  items.push({ label: "Recalculate distance", onClick: () => setConfirm("recalc") });
  items.push({ label: "Update odometer", href: `/dashboard/trips/${t.id}/edit#odometer` });
  items.push({
    label: "Check a fine for this trip",
    href: me.isPro ? `/dashboard/ticket-defender?tripId=${t.id}` : planHref("ticket_defender"),
    badge: "pro",
  });
  items.push({ label: "Save start as a place", onClick: () => setPlaceFor("start") });
  if (t.endLat != null) items.push({ label: "Save end as a place", onClick: () => setPlaceFor("end") });
  items.push({ label: "New trip from here", href: newTripHref(t, "from", from) });
  if (t.endLat != null) items.push({ label: "New trip to here", href: newTripHref(t, "to", to) });
  if (!t.isManualEntry) items.push({ label: "Something wrong with this trip?", onClick: () => setAnomalyOpen(true) });
  items.push({ label: "Delete trip", danger: true, onClick: () => setConfirm("delete") });

  return (
    <>
      <PageHeader title={title} back={{ href: "/dashboard/trips", label: "Trips" }} />
      <div className="mc-tripview">
        <div className="mc-block">
          <MapView height={wide ? 400 : 220} routes={routes} markers={markers} fitTo="routes" />
          {matched && (
            <p className="mc-sr-only">Grey line is the route we recorded. Amber line is the road route.</p>
          )}
        </div>

        <div className="mc-tripview__side">
          <div>
            <p className="mc-tripview__facts mc-num" data-testid="trip-facts">
              {[
                formatDay(t.startedAt),
                t.endedAt ? formatRange(t.startedAt, t.endedAt) : null,
                durationText(t.startedAt, t.endedAt) || null,
                formatMiles(t.distanceMiles),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {t.diversion && (
              <p className="mc-tripview__facts">
                Ran about {formatMiles(t.diversion.extraMiles)} longer than usual
                {t.diversion.streetName ? ` because of roadworks on ${t.diversion.streetName}` : " because of roadworks"}.
              </p>
            )}
          </div>

          <div className="mc-block">
            <p className="mc-block__label" id="how-label">
              How was this trip?
            </p>
            <FilterChips
              single
              ariaLabel="How was this trip?"
              options={[
                { value: "business", label: "Business" },
                { value: "personal", label: "Personal" },
              ]}
              value={t.classification === "unclassified" ? [] : [t.classification]}
              onChange={(v) => {
                if (v[0]) classify(v[0] as Classification);
              }}
            />
          </div>

          {showPlatform && (
            <div className="mc-block">
              <p className="mc-block__label">Platform</p>
              <FilterChips
                single
                ariaLabel="Platform"
                options={PLATFORM_OPTIONS}
                value={t.platformTag ? [t.platformTag] : []}
                onChange={(v) => patch({ platformTag: v[0] ?? null }, "Saved")}
              />
            </div>
          )}
          {showPurpose && (
            <div className="mc-block">
              <p className="mc-block__label">Purpose</p>
              <FilterChips
                single
                ariaLabel="Purpose"
                options={PURPOSE_OPTIONS}
                value={t.businessPurpose ? [t.businessPurpose] : []}
                onChange={(v) => patch({ businessPurpose: v[0] ?? null }, "Saved")}
              />
            </div>
          )}
          {showCategory && (
            <div className="mc-block">
              <p className="mc-block__label">Category</p>
              <FilterChips
                single
                ariaLabel="Category"
                options={CATEGORY_OPTIONS}
                value={t.category ? [t.category] : []}
                onChange={(v) => patch({ category: v[0] ?? null }, "Saved")}
              />
            </div>
          )}

          <NoteRow value={t.notes ?? ""} onSave={(v) => patch({ notes: v.trim() ? v.trim() : null }, "Saved")} />
          {t.classification === "business" && (
            <ProjectRow
              value={t.projectLabel ?? ""}
              suggestions={labels.data ?? []}
              onSave={(v) => patch({ projectLabel: v.trim() ? v.trim() : null }, "Saved")}
            />
          )}

          <Card>
            <dl className="mc-factrows">
              <dt>Vehicle</dt>
              <dd>{t.vehicle ? `${t.vehicle.make} ${t.vehicle.model}` : "Not set"}</dd>
              {t.platformTag && !showPlatform ? (
                <>
                  <dt>Platform</dt>
                  <dd>{platformLabel(t.platformTag)}</dd>
                </>
              ) : null}
              {t.businessPurpose && !showPurpose ? (
                <>
                  <dt>Purpose</dt>
                  <dd>{purposeLabel(t.businessPurpose)}</dd>
                </>
              ) : null}
              {t.category && !showCategory ? (
                <>
                  <dt>Category</dt>
                  <dd>{categoryLabel(t.category)}</dd>
                </>
              ) : null}
              {(t.odometerStart != null || t.odometerEnd != null) && (
                <>
                  <dt>Odometer</dt>
                  <dd className="mc-num">
                    {t.odometerStart != null ? t.odometerStart.toLocaleString("en-GB") : "?"} to{" "}
                    {t.odometerEnd != null ? t.odometerEnd.toLocaleString("en-GB") : "?"}
                  </dd>
                </>
              )}
              <dt>Added</dt>
              <dd>{t.isManualEntry ? "By hand" : "Recorded on your phone"}</dd>
            </dl>
          </Card>

          {caz.length > 0 && <CazNotice tripId={t.id} charges={caz} startedAt={t.startedAt} vehicleId={t.vehicleId} isPro={me.isPro} canLog={t.classification !== "personal"} />}

          {merge && (
            <MergeNotice
              trip={t}
              onMerged={(newId) => {
                unclassified.refresh();
                router.replace(`/dashboard/trips/${newId}`);
              }}
            />
          )}

          <div className="mc-trip__actions">
            <Button variant="secondary" href={`/dashboard/trips/${t.id}/edit`}>
              Edit trip
            </Button>
            <Menu ariaLabel="More" align="left" triggerClassName="mc-btn mc-btn--ghost mc-btn--md" trigger={<>More <Icon name="chevron-down" size={14} /></>} items={items} />
          </div>

          <SpeedAndStops coords={coords} />
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this trip?"
        body="It goes from your records and any totals. This can't be undone."
        confirmLabel="Delete"
        destructive
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api.delete(`/trips/${t.id}`);
          toast.show("Deleted");
          unclassified.refresh();
          router.replace("/dashboard/trips");
        }}
      />
      <ConfirmDialog
        open={confirm === "recalc"}
        title="Recalculate distance?"
        body={`Work out the distance again from the route? Your current figure is ${formatMiles(t.distanceMiles)}.`}
        confirmLabel="Recalculate"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const res = await api.post<{ data: { changed: boolean; newMiles: number } }>(`/trips/${t.id}/recalc`);
          toast.show(res.data.changed ? `Distance is now ${formatMiles(res.data.newMiles)}` : "Already accurate");
          trip.reload();
        }}
      />
      <AnomalyDialog open={anomalyOpen} tripId={t.id} onClose={() => setAnomalyOpen(false)} />
      <SavePlaceDialog
        key={placeFor ?? "none"}
        which={placeFor}
        trip={t}
        defaultName={placeFor === "end" ? to : from}
        onClose={() => setPlaceFor(null)}
        onSaved={() => places.reload()}
      />
    </>
  );
}

function newTripHref(t: TripDetailData, which: "from" | "to", label: string): string {
  const q = new URLSearchParams();
  if (which === "from") {
    q.set("fromLat", String(t.startLat));
    q.set("fromLng", String(t.startLng));
    if (t.startAddress ?? label) q.set("fromAddress", t.startAddress ?? label);
  } else {
    q.set("toLat", String(t.endLat));
    q.set("toLng", String(t.endLng));
    if (t.endAddress ?? label) q.set("toAddress", t.endAddress ?? label);
  }
  return `/dashboard/trips/new?${q.toString()}`;
}

function NoteRow({ value, onSave }: { value: string; onSave: (v: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  if (!editing) {
    return (
      <div className="mc-block">
        <p className="mc-block__label">Note</p>
        <div className="mc-textinline">
          <p style={{ margin: 0, flex: 1, whiteSpace: "pre-wrap" }}>{value || "No note"}</p>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            {value ? "Edit note" : "Add a note"}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mc-block">
      <TextArea label="Note" value={draft} onChange={setDraft} rows={3} maxLength={2000} required={false} />
      <div className="mc-trip__actions">
        <Button
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await onSave(draft);
            setBusy(false);
            if (ok) setEditing(false);
          }}
        >
          Save note
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ProjectRow({
  value,
  suggestions,
  onSave,
}: {
  value: string;
  suggestions: string[];
  onSave: (v: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  if (!editing) {
    return (
      <div className="mc-block">
        <p className="mc-block__label">Project</p>
        <div className="mc-textinline">
          <p style={{ margin: 0, flex: 1 }}>{value || "No project"}</p>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            {value ? "Change project" : "Add a project"}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mc-block">
      <TextField label="Project" value={draft} onChange={setDraft} maxLength={100} required={false} />
      {suggestions.length > 0 && (
        <FilterChips
          single
          ariaLabel="Recent projects"
          options={suggestions.slice(0, 8).map((s) => ({ value: s, label: s }))}
          value={draft ? [draft] : []}
          onChange={(v) => setDraft(v[0] ?? "")}
        />
      )}
      <div className="mc-trip__actions">
        <Button
          variant="secondary"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await onSave(draft);
            setBusy(false);
            if (ok) setEditing(false);
          }}
        >
          Save project
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function CazNotice({
  tripId,
  charges,
  startedAt,
  vehicleId,
  isPro,
  canLog = true,
}: {
  tripId: string;
  charges: CazCharge[];
  startedAt: string;
  vehicleId: string | null;
  isPro: boolean;
  /** A charge on a Personal trip is not an allowable expense, so there is nothing to log. */
  canLog?: boolean;
}) {
  const toast = useToast();
  const [logged, setLogged] = useState<string[]>([]);
  const [paid, setPaid] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function log(c: CazCharge) {
    setBusy(`log-${c.zoneId}`);
    try {
      await api.post("/expenses", {
        category: "congestion",
        amountPence: c.chargePence,
        date: isoToLocalYmd(startedAt),
        ...(vehicleId ? { vehicleId } : {}),
        description: `${c.name} daily charge`,
        vendor: c.name,
        notes: "Logged from a recorded trip that entered the zone.",
      });
      setLogged((l) => [...l, c.zoneId]);
      toast.show("Charge logged as an expense");
    } catch (e) {
      toast.show(errorText(e, "Couldn't log the charge. Try again."), "error");
    } finally {
      setBusy(null);
    }
  }
  async function markPaid(c: CazCharge) {
    setBusy(`paid-${c.zoneId}`);
    try {
      await api.post(`/ticket-defender/caz-charges/${tripId}/paid`, { zoneId: c.zoneId, paid: true });
      setPaid((l) => [...l, c.zoneId]);
      toast.show("Marked as paid");
    } catch (e) {
      toast.show(errorText(e, "Couldn't save that. Try again."), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mc-notice" data-testid="caz-notice">
      <p className="mc-notice__title">Clean air zone</p>
      {charges.map((c) => (
        <div key={c.zoneId} className="mc-block">
          <p>
            You drove through {c.name}. Charge <span className="mc-num">{formatPence(c.chargePence)}</span>.
          </p>
          <div className="mc-notice__row">
            {!canLog ? null : logged.includes(c.zoneId) ? (
              <Button variant="secondary" icon="checkmark-circle-outline" disabled>
                Charge logged
              </Button>
            ) : (
              <Button variant="secondary" loading={busy === `log-${c.zoneId}`} onClick={() => log(c)}>
                Log the charge
              </Button>
            )}
            {isPro &&
              (paid.includes(c.zoneId) ? (
                <Button variant="ghost" icon="checkmark-circle-outline" disabled>
                  Paid
                </Button>
              ) : (
                <Button variant="ghost" loading={busy === `paid-${c.zoneId}`} onClick={() => markPaid(c)}>
                  Mark paid
                </Button>
              ))}
          </div>
        </div>
      ))}
      <p className="mc-notice--quiet" style={{ fontSize: "var(--mc-fs-hint)" }}>
        Zone edges are approximate. Check before you log it.
      </p>
    </div>
  );
}

function MergeNotice({ trip, onMerged }: { trip: TripDetailData; onMerged: (newId: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const m = trip.mergeSuggestion;
  if (!m) return null;
  const mins = Math.round(m.gapMinutes);
  const gap = mins < 1 ? "less than a minute" : `${mins} min`;
  const text =
    m.direction === "after"
      ? `Next trip started ${gap} later at the same place.`
      : `The trip before this one ended ${gap} earlier at the same place.`;

  async function merge() {
    if (!m) return;
    setBusy(true);
    try {
      const res = await api.post<{ data: { id: string } }>("/trips/merge", {
        tripIds: [trip.id, m.otherTripId],
        classification: trip.classification,
        platformTag: trip.platformTag ?? null,
        businessPurpose: trip.businessPurpose ?? null,
        category: trip.category ?? null,
        notes: trip.notes ?? null,
      });
      toast.show("Trips merged");
      onMerged(res.data.id);
    } catch (e) {
      toast.show(errorText(e, "Couldn't merge the trips. Try again."), "error");
      setBusy(false);
    }
  }

  return (
    <div className="mc-notice" data-testid="merge-notice">
      <p>{text}</p>
      <div className="mc-notice__row">
        <Button variant="secondary" loading={busy} onClick={merge}>
          Merge with it
        </Button>
      </div>
    </div>
  );
}

function SpeedAndStops({ coords }: { coords: TripDetailData["coordinates"] }) {
  const [open, setOpen] = useState(false);
  const stops = useMemo(() => findStops(coords), [coords]);
  const series = useMemo(() => speedSeries(coords), [coords]);
  if (coords.length < MIN_POINTS_FOR_SPEED || series.length < 2) return null;

  const maxT = series[series.length - 1].t || 1;
  const maxMph = Math.max(30, ...series.map((p) => p.mph));
  const path = series
    .map((p, i) => `${i === 0 ? "M" : "L"}${((p.t / maxT) * 300).toFixed(1)} ${(100 - (p.mph / maxMph) * 96).toFixed(1)}`)
    .join(" ");
  const top = Math.round(Math.max(...series.map((p) => p.mph)));

  return (
    <Card>
      <button type="button" className="mc-disclosure" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Speed and stops
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      {open && (
        <div className="mc-block" style={{ marginTop: 12 }}>
          <svg
            className="mc-speedchart"
            viewBox="0 0 300 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Speed over the trip, top speed ${top} mph`}
          >
            <line x1="0" y1="100" x2="300" y2="100" />
            <path d={path} vectorEffect="non-scaling-stroke" />
          </svg>
          <p className="mc-block__label">Top speed {top} mph</p>
          {stops.length > 0 ? (
            <ul className="mc-stoplist">
              {stops.map((s) => (
                <li key={s.startedAt}>
                  Stopped {formatDwell(s.durationSec)} at{" "}
                  {new Date(s.startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mc-notice--quiet">No stops over 2 minutes.</p>
          )}
        </div>
      )}
    </Card>
  );
}

const ANOMALY_OPTIONS = [
  { id: "detour", label: "It ran longer than it should have: a detour or road closure", type: "indirect_route", response: "Detour/road closure" },
  { id: "stops", label: "It has more stops than I made: I was making several deliveries", type: "many_stops", response: "Multiple deliveries" },
  { id: "break", label: "It shows a long stop: I was on a break", type: "long_idle", response: "Break/rest" },
];

function AnomalyDialog({ open, tripId, onClose }: { open: boolean; tripId: string; onClose: () => void }) {
  const toast = useToast();
  const [choice, setChoice] = useState(ANOMALY_OPTIONS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const opt = ANOMALY_OPTIONS.find((o) => o.id === choice)!;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/trips/${tripId}/anomaly`, { type: opt.type, response: opt.response });
      toast.show("Thanks. We've noted that on the trip.");
      onClose();
    } catch (e) {
      setError(errorText(e, "Couldn't send that. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Something wrong with this trip?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={send}>
            Send
          </Button>
        </>
      }
    >
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        <legend className="mc-sr-only">What looks wrong</legend>
        {ANOMALY_OPTIONS.map((o) => (
          <label key={o.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
            <input
              type="radio"
              name="anomaly"
              className="mc-check"
              checked={choice === o.id}
              onChange={() => setChoice(o.id)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="mc-formerror" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function SavePlaceDialog({
  which,
  trip,
  defaultName,
  onClose,
  onSaved,
}: {
  which: null | "start" | "end";
  trip: TripDetailData;
  defaultName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState("custom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPro, setNeedsPro] = useState(false);

  async function save() {
    if (!which) return;
    if (!name.trim()) {
      setError("Give the place a name.");
      return;
    }
    const lat = which === "start" ? trip.startLat : trip.endLat;
    const lng = which === "start" ? trip.startLng : trip.endLng;
    if (lat == null || lng == null) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/saved-locations", {
        name: name.trim().slice(0, 100),
        locationType: type,
        latitude: lat,
        longitude: lng,
        radiusMeters: 100,
        geofenceEnabled: true,
      });
      toast.show("Place saved");
      onSaved();
      onClose();
    } catch (e) {
      if (isApiError(e) && e.statusCode === 403) setNeedsPro(true);
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={which !== null}
      title={which === "end" ? "Save end as a place" : "Save start as a place"}
      onClose={onClose}
      footer={
        needsPro ? (
          <Button variant="primary" href={planHref("places")}>
            Upgrade to Pro
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={save}>
              Save place
            </Button>
          </>
        )
      }
    >
      {needsPro ? (
        <p className="mc-dialog__text">
          Free accounts keep 2 saved places. This is part of MileClear Pro. £4.99 a month, cancel any time.
        </p>
      ) : (
        <div className="mc-tripform">
          <TextField label="Name" value={name} onChange={setName} maxLength={100} />
          <SelectField
            label="Type"
            value={type}
            onChange={setType}
            options={[
              { value: "home", label: "Home" },
              { value: "work", label: "Work" },
              { value: "depot", label: "Depot" },
              { value: "custom", label: "Other" },
            ]}
          />
          {error && (
            <p className="mc-formerror" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}
