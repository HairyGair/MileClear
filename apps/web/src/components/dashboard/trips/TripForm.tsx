"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SavedLocation, Vehicle } from "@mileclear/shared";
import { api, isApiError } from "../../../lib/api";
import {
  Button,
  DateField,
  FilterChips,
  Icon,
  NumberField,
  PageHeader,
  PlaceField,
  SelectField,
  TextArea,
  TextField,
  TimeField,
  useData,
  useMe,
  useToast,
  useUnclassifiedCount,
  type PlaceValue,
} from "../kit";
import { formatDay, formatTime } from "../../../lib/dashboard";
import { isoToLocalHm, isoToLocalYmd, localToIso, toYmd } from "./lib/days";
import { odometerWarning, validateTrip, type FormErrors } from "./lib/form";
import { CATEGORY_OPTIONS, PLATFORM_OPTIONS, PURPOSE_OPTIONS, errorText } from "./lib/labels";
import type { TripDetailData } from "./lib/types";
import "./trips.css";

export interface TripPrefill {
  missedId?: string;
  from?: PlaceValue;
  to?: PlaceValue;
  start?: string;
  end?: string;
  gap?: boolean;
  windowStart?: string;
  windowEnd?: string;
}

const RIGHT_AFTER = 400;

function placeFrom(address: string | null | undefined, lat: number | null | undefined, lng: number | null | undefined): PlaceValue | null {
  const label = address && address.trim() ? address : lat != null && lng != null ? "Pinned location" : "";
  if (!label) return null;
  return lat != null && lng != null && !(lat === 0 && lng === 0) ? { label, lat, lng } : { label };
}

type DistanceState = "idle" | "loading" | "ok" | "unavailable";

/**
 * One form for adding a trip and editing one. Geocoding only goes through our
 * API (PlaceField); the road distance comes from GET /trips/route-distance.
 */
export function TripForm({ mode, trip, prefill }: { mode: "add" | "edit"; trip?: TripDetailData; prefill?: TripPrefill }) {
  const router = useRouter();
  const toast = useToast();
  const me = useMe();
  const unclassified = useUnclassifiedCount();
  const editing = mode === "edit" && !!trip;

  const placesData = useData<SavedLocation[]>("trips:places", () =>
    api.get<{ data: SavedLocation[] }>("/saved-locations").then((r) => r.data ?? [])
  );
  const vehiclesData = useData<Vehicle[]>("trips:vehicles", () => api.get<{ data: Vehicle[] }>("/vehicles").then((r) => r.data ?? []));
  const labelsData = useData<string[]>("trips:project-labels", () =>
    api
      .get<{ data: { labels: string[] } }>("/trips/project-labels")
      .then((r) => r.data?.labels ?? [])
      .catch(() => [])
  );

  // Initial values
  const init = useMemo(() => {
    if (trip) {
      return {
        from: placeFrom(trip.startAddress, trip.startLat, trip.startLng),
        to: placeFrom(trip.endAddress, trip.endLat, trip.endLng),
        date: isoToLocalYmd(trip.startedAt),
        startTime: isoToLocalHm(trip.startedAt),
        endTime: trip.endedAt ? isoToLocalHm(trip.endedAt) : "",
        distance: trip.distanceMiles ? String(Math.round(trip.distanceMiles * 10) / 10) : "",
      };
    }
    return {
      from: prefill?.from ?? null,
      to: prefill?.to ?? null,
      date: prefill?.start ? isoToLocalYmd(prefill.start) : toYmd(new Date()),
      startTime: prefill?.start ? isoToLocalHm(prefill.start) : "",
      endTime: prefill?.end ? isoToLocalHm(prefill.end) : "",
      distance: "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [from, setFrom] = useState<PlaceValue | null>(init.from);
  const [to, setTo] = useState<PlaceValue | null>(init.to);
  const [date, setDate] = useState(init.date);
  const [startTime, setStartTime] = useState(init.startTime);
  const [endTime, setEndTime] = useState(init.endTime);
  const [distance, setDistance] = useState(init.distance);
  const [distanceManual, setDistanceManual] = useState(editing);
  const [routeState, setRouteState] = useState<DistanceState>("idle");
  const [vehicleId, setVehicleId] = useState(trip?.vehicleId ?? "");
  const [classification, setClassification] = useState<"" | "business" | "personal" | "unclassified">(trip ? trip.classification : "");
  const [platform, setPlatform] = useState(trip?.platformTag ?? "");
  const [purpose, setPurpose] = useState(trip?.businessPurpose ?? "");
  const [category, setCategory] = useState(trip?.category ?? "");
  const [project, setProject] = useState(trip?.projectLabel ?? "");
  const [notes, setNotes] = useState(trip?.notes ?? "");
  const [odoStart, setOdoStart] = useState(trip?.odometerStart != null ? String(trip.odometerStart) : "");
  const [odoEnd, setOdoEnd] = useState(trip?.odometerEnd != null ? String(trip.odometerEnd) : "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const placesTouched = useRef(false);
  const odoRef = useRef<HTMLDivElement>(null);

  // Default vehicle once they load (add only).
  useEffect(() => {
    if (vehicleId || editing || !vehiclesData.data || vehiclesData.data.length === 0) return;
    const v = vehiclesData.data.find((x) => x.isPrimary) ?? vehiclesData.data[0];
    setVehicleId(v.id);
  }, [vehiclesData.data, vehicleId, editing]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#odometer") {
      odoRef.current?.scrollIntoView({ block: "center" });
    }
  }, []);

  // Road distance from our API once both ends are pinned.
  const fromLat = from?.lat;
  const fromLng = from?.lng;
  const toLat = to?.lat;
  const toLng = to?.lng;
  const bothPinned = fromLat != null && fromLng != null && toLat != null && toLng != null;
  const autoWanted = !distanceManual && bothPinned && (mode === "add" || placesTouched.current);

  useEffect(() => {
    if (!autoWanted) {
      if (!bothPinned) setRouteState("idle");
      return;
    }
    let cancelled = false;
    setRouteState("loading");
    const timer = window.setTimeout(() => {
      api
        .get<{ data: { distanceMiles: number } }>(
          `/trips/route-distance?startLat=${fromLat}&startLng=${fromLng}&endLat=${toLat}&endLng=${toLng}`
        )
        .then((r) => {
          if (cancelled) return;
          setDistance(String(Math.round(r.data.distanceMiles * 10) / 10));
          setRouteState("ok");
        })
        .catch(() => {
          if (cancelled) return;
          setRouteState("unavailable");
          setDistanceManual(true);
        });
    }, RIGHT_AFTER);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [autoWanted, bothPinned, fromLat, fromLng, toLat, toLng]);

  const odoWarning = odometerWarning(odoStart, odoEnd, distance);
  const isBusiness = classification === "business";
  const showPlatform = isBusiness && !me.isCompanyDriver && me.user?.workType !== "employee" && me.user?.workType !== "company";
  const showPurpose = isBusiness && (me.isEmployee || me.user?.workType === "company");
  const showCategory = classification === "personal";

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (saving) return;
    const errs = validateTrip(
      {
        fromLabel: from?.label ?? "",
        toLabel: to?.label ?? "",
        date,
        startTime,
        endTime,
        distance,
        classification,
        odometerStart: odoStart,
        odometerEnd: odoEnd,
      },
      { requireClassification: mode === "add" }
    );
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length > 0) {
      window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setSaving(true);
    const startedAt = localToIso(date, startTime);
    const endedAt = localToIso(date, endTime);
    const miles = Math.round(parseFloat(distance) * 100) / 100;
    const odoS = odoStart.trim() ? parseFloat(odoStart) : null;
    const odoE = odoEnd.trim() ? parseFloat(odoEnd) : null;
    try {
      if (mode === "add") {
        const body: Record<string, unknown> = {
          ...(vehicleId ? { vehicleId } : {}),
          startLat: from?.lat ?? 0,
          startLng: from?.lng ?? 0,
          startAddress: from?.label,
          ...(to?.lat != null && to?.lng != null ? { endLat: to.lat, endLng: to.lng } : {}),
          endAddress: to?.label,
          distanceMiles: miles,
          startedAt,
          endedAt,
          classification,
          ...(showPlatform && platform ? { platformTag: platform } : {}),
          ...(showPurpose && purpose ? { businessPurpose: purpose } : {}),
          ...(showCategory && category ? { category } : {}),
          ...(isBusiness && project.trim() ? { projectLabel: project.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(odoS != null ? { odometerStart: odoS } : {}),
          ...(odoE != null ? { odometerEnd: odoE } : {}),
        };
        const res = await api.post<{ data: { id: string } }>("/trips", body);
        if (prefill?.missedId) {
          // Best effort: the trip is saved either way. The server checks the times sit in the journey's window.
          await api
            .post(`/trips/missed-journeys/${prefill.missedId}/resolve`, { action: "accept", startedAt, endedAt })
            .catch(() => toast.show("Trip added. That journey may still show in your Inbox.", "ok"));
        }
        toast.show("Trip added");
        unclassified.refresh();
        router.replace(`/dashboard/trips/${res.data.id}`);
      } else if (trip) {
        const patch: Record<string, unknown> = {};
        if (classification && classification !== trip.classification) patch.classification = classification;
        if ((platform || null) !== (trip.platformTag ?? null) && showPlatform) patch.platformTag = platform || null;
        if ((purpose || null) !== (trip.businessPurpose ?? null) && showPurpose) patch.businessPurpose = purpose || null;
        if ((category || null) !== (trip.category ?? null) && showCategory) patch.category = category || null;
        if (project.trim() !== (trip.projectLabel ?? "")) patch.projectLabel = project.trim() || null;
        if (notes.trim() !== (trip.notes ?? "").trim()) patch.notes = notes.trim() || null;
        if (vehicleId && vehicleId !== (trip.vehicleId ?? "")) patch.vehicleId = vehicleId;
        if (startedAt !== new Date(trip.startedAt).toISOString() && startTimeChanged(trip, date, startTime)) patch.startedAt = startedAt;
        if (!trip.endedAt || endTimeChanged(trip, date, endTime)) patch.endedAt = endedAt;
        if (miles !== Math.round(trip.distanceMiles * 100) / 100 && distance !== init.distance) patch.distanceMiles = miles;
        if (placesTouched.current) {
          if (from && from.label !== (trip.startAddress ?? "")) {
            patch.startAddress = from.label;
            if (from.lat != null && from.lng != null) {
              patch.startLat = from.lat;
              patch.startLng = from.lng;
            }
          }
          if (to && to.label !== (trip.endAddress ?? "")) {
            patch.endAddress = to.label;
            if (to.lat != null && to.lng != null) {
              patch.endLat = to.lat;
              patch.endLng = to.lng;
            }
          }
        }
        const prevS = trip.odometerStart ?? null;
        const prevE = trip.odometerEnd ?? null;
        if (odoS !== prevS) patch.odometerStart = odoS;
        if (odoE !== prevE) patch.odometerEnd = odoE;
        if (Object.keys(patch).length > 0) await api.patch(`/trips/${trip.id}`, patch);
        toast.show("Saved");
        unclassified.refresh();
        router.replace(`/dashboard/trips/${trip.id}`);
      }
    } catch (e) {
      const msg = isApiError(e) || e instanceof Error ? errorText(e, "") : "";
      if (msg && !/failed to fetch|network/i.test(msg)) {
        setFormError(msg);
      } else {
        toast.show("Couldn't save. Try again.", "error");
      }
      setSaving(false);
    }
  }

  const title = mode === "add" ? "Add a trip" : "Edit trip";
  const back = mode === "add" ? { href: "/dashboard/trips", label: "Trips" } : { href: `/dashboard/trips/${trip?.id ?? ""}`, label: "Trip" };
  const vehicleOptions = (vehiclesData.data ?? []).map((v) => ({ value: v.id, label: `${v.make} ${v.model}` }));
  const showTimeWindow = prefill?.gap && prefill.windowStart && prefill.windowEnd;
  const recordedTrip = editing && trip && !trip.isManualEntry;

  return (
    <>
      <PageHeader title={title} back={back} />
      <form className="mc-tripform" onSubmit={submit} noValidate aria-label={title}>
        <PlaceField label="From" value={from} onChange={(v) => { placesTouched.current = true; setFrom(v); }} savedPlaces={placesData.data ?? []} />
        {errors.from && <p className="mc-field__error" role="alert"><Icon name="alert-circle-outline" size={14} /> {errors.from}</p>}
        <PlaceField label="To" value={to} onChange={(v) => { placesTouched.current = true; setTo(v); }} savedPlaces={placesData.data ?? []} />
        {errors.to && <p className="mc-field__error" role="alert"><Icon name="alert-circle-outline" size={14} /> {errors.to}</p>}

        {showTimeWindow && (
          <p className="mc-warn" role="note">
            <Icon name="information-circle-outline" size={16} />
            <span>
              We think this journey happened sometime between {formatTime(prefill!.windowStart!)} and {formatTime(prefill!.windowEnd!)} on{" "}
              {formatDay(prefill!.windowStart!)}. Set the time you left.
            </span>
          </p>
        )}

        <div className="mc-tripform__row mc-tripform__row--3">
          <DateField label="Date" value={date} onChange={setDate} error={errors.date} required />
          <TimeField label="Start time" value={startTime} onChange={setStartTime} error={errors.startTime} required />
          <TimeField label="End time" value={endTime} onChange={setEndTime} error={errors.endTime} required />
        </div>
        {recordedTrip && (
          <p className="mc-field__hint" style={{ margin: 0 }}>
            This trip was recorded on your phone, so its start can only move earlier.
          </p>
        )}

        <div className="mc-tripform__distance">
          {distanceManual ? (
            <>
              <NumberField label="Distance" value={distance} onChange={setDistance} suffix="mi" error={errors.distance} required />
              {routeState === "unavailable" && (
                <p className="mc-field__hint" style={{ margin: 0 }}>
                  Couldn&apos;t work out the road distance. Type it instead.
                </p>
              )}
              {bothPinned && (
                <button
                  type="button"
                  className="mc-textlink"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => {
                    setDistanceManual(false);
                    placesTouched.current = true;
                  }}
                >
                  Measure by road instead
                </button>
              )}
            </>
          ) : (
            <>
              <p className="mc-field__label" style={{ margin: 0 }}>Distance</p>
              {routeState === "loading" ? (
                <p className="mc-tripform__by" role="status">Working out the road distance</p>
              ) : (
                <p className="mc-tripform__by">
                  <span className="mc-num" style={{ fontSize: 20, fontWeight: 700 }}>{distance ? `${distance} mi` : "No distance yet"}</span>
                  <span style={{ color: "var(--mc-text-2)" }}>by road</span>
                  <button type="button" className="mc-textlink" onClick={() => setDistanceManual(true)}>
                    Type it instead
                  </button>
                </p>
              )}
              {errors.distance && <p className="mc-field__error" role="alert"><Icon name="alert-circle-outline" size={14} /> {errors.distance}</p>}
            </>
          )}
          {!bothPinned && !distanceManual && (
            <p className="mc-field__hint" style={{ margin: 0 }}>Pick both places from the list to measure by road.</p>
          )}
        </div>

        {vehicleOptions.length > 0 && (
          <SelectField label="Vehicle" value={vehicleId} onChange={setVehicleId} options={vehicleOptions} />
        )}

        <div>
          <p className="mc-tripform__group-label" id="class-label">Business or personal</p>
          <FilterChips
            single
            ariaLabel="Business or personal"
            options={[
              { value: "business", label: "Business" },
              { value: "personal", label: "Personal" },
            ]}
            value={classification === "business" || classification === "personal" ? [classification] : []}
            onChange={(v) => setClassification((v[0] as "business" | "personal" | undefined) ?? (mode === "edit" ? "unclassified" : ""))}
          />
          {errors.classification && <p className="mc-field__error" role="alert"><Icon name="alert-circle-outline" size={14} /> {errors.classification}</p>}
        </div>

        {showPlatform && (
          <div>
            <p className="mc-tripform__group-label">Platform</p>
            <FilterChips single ariaLabel="Platform" options={PLATFORM_OPTIONS} value={platform ? [platform] : []} onChange={(v) => setPlatform(v[0] ?? "")} />
          </div>
        )}
        {showPurpose && (
          <div>
            <p className="mc-tripform__group-label">Purpose</p>
            <FilterChips single ariaLabel="Purpose" options={PURPOSE_OPTIONS} value={purpose ? [purpose] : []} onChange={(v) => setPurpose(v[0] ?? "")} />
          </div>
        )}
        {showCategory && (
          <div>
            <p className="mc-tripform__group-label">Category</p>
            <FilterChips single ariaLabel="Category" options={CATEGORY_OPTIONS} value={category ? [category] : []} onChange={(v) => setCategory(v[0] ?? "")} />
          </div>
        )}

        {isBusiness && (
          <div>
            <TextField label="Project" value={project} onChange={setProject} maxLength={100} required={false} />
            {(labelsData.data ?? []).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <FilterChips
                  single
                  ariaLabel="Recent projects"
                  options={(labelsData.data ?? []).slice(0, 8).map((l) => ({ value: l, label: l }))}
                  value={project ? [project] : []}
                  onChange={(v) => setProject(v[0] ?? "")}
                />
              </div>
            )}
          </div>
        )}

        <TextArea label="Notes" value={notes} onChange={setNotes} rows={3} maxLength={2000} required={false} />

        <div id="odometer" ref={odoRef} className="mc-tripform__row mc-tripform__row--2">
          <NumberField label="Odometer at the start" value={odoStart} onChange={setOdoStart} suffix="mi" required={false} />
          <NumberField label="Odometer at the end" value={odoEnd} onChange={setOdoEnd} suffix="mi" required={false} />
        </div>
        {odoWarning && (
          <p className="mc-warn" role="status">
            <Icon name="warning-outline" size={16} />
            <span>{odoWarning}</span>
          </p>
        )}

        {formError && (
          <p className="mc-formerror" role="alert">
            {formError}
          </p>
        )}

        <div className="mc-tripform__actions">
          <Button type="submit" variant="primary" loading={saving}>
            {mode === "add" ? "Save trip" : "Save changes"}
          </Button>
          <Button variant="ghost" href={back.href}>
            Cancel
          </Button>
        </div>
      </form>
    </>
  );
}

function startTimeChanged(trip: TripDetailData, date: string, time: string): boolean {
  return isoToLocalYmd(trip.startedAt) !== date || isoToLocalHm(trip.startedAt) !== time;
}
function endTimeChanged(trip: TripDetailData, date: string, time: string): boolean {
  if (!trip.endedAt) return true;
  return isoToLocalYmd(trip.endedAt) !== date || isoToLocalHm(trip.endedAt) !== time;
}
