"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LocationType, SavedLocation } from "@mileclear/shared";
import { api, isApiError } from "../../../lib/api";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { ConfirmDialog } from "../kit/Dialog";
import { SelectField, TextField, Toggle } from "../kit/Fields";
import { MapView } from "../kit/MapView";
import { PlaceField, type PlaceValue } from "../kit/PlaceField";
import { useToast } from "../kit/Toast";
import { ProDialog } from "./ProDialog";
import styles from "./driving.module.css";

export const PLACE_TYPES: { value: LocationType; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "depot", label: "Depot" },
  { value: "custom", label: "Other" },
];

interface Recommendation {
  recommendedRadiusMeters: number | null;
  fallbackRadiusMeters: number;
  sampleSize: number;
}

/**
 * Add or edit a saved place: name, type, search or click the map, radius with the
 * community hint, delete. The free limit (2) opens the Pro dialog.
 */
export function PlaceForm({
  place,
  count,
  isPro,
  initial,
}: {
  place: SavedLocation | null;
  count: number;
  isPro: boolean;
  initial?: { name?: string; type?: LocationType; lat?: number; lng?: number };
}) {
  const router = useRouter();
  const { show } = useToast();
  const editing = place !== null;
  const [name, setName] = useState(place?.name ?? initial?.name ?? "");
  const [nameTouched, setNameTouched] = useState(!!(place?.name ?? initial?.name));
  const [type, setType] = useState<LocationType>(place?.locationType ?? initial?.type ?? "home");
  const [spot, setSpot] = useState<PlaceValue | null>(
    place
      ? { label: `${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`, lat: place.latitude, lng: place.longitude }
      : initial?.lat != null && initial?.lng != null
        ? { label: initial.name ?? "Chosen spot", lat: initial.lat, lng: initial.lng }
        : null
  );
  const [radius, setRadius] = useState(place?.radiusMeters ?? 200);
  const [mapRadius, setMapRadius] = useState(radius);
  const [geofence, setGeofence] = useState(place?.geofenceEnabled ?? true);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [proOpen, setProOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMapRadius(radius), 250);
    return () => window.clearTimeout(t);
  }, [radius]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: Recommendation }>(`/saved-locations/recommended-radius?type=${type}`)
      .then((r) => {
        if (!cancelled) setRec(r.data);
      })
      .catch(() => {
        if (!cancelled) setRec(null);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  const hasPoint = spot?.lat != null && spot?.lng != null;
  const typeWord = PLACE_TYPES.find((t) => t.value === type)?.label.toLowerCase() ?? "place";

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Give the place a name.");
    if (!hasPoint) return setError("Search for the address or click the map to place it.");
    if (!editing && !isPro && count >= 2) return setProOpen(true);
    setSaving(true);
    const body = {
      name: name.trim(),
      locationType: type,
      latitude: spot!.lat!,
      longitude: spot!.lng!,
      radiusMeters: Math.round(radius),
      geofenceEnabled: geofence,
    };
    try {
      if (editing && place) await api.patch(`/saved-locations/${place.id}`, body);
      else await api.post("/saved-locations", body);
      show("Saved");
      router.push("/dashboard/places");
    } catch (e) {
      if (isApiError(e) && e.statusCode === 403 && !isPro) setProOpen(true);
      else setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.cols}>
      <Card>
        <form
          className={styles.stack}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <TextField
            label="Name"
            value={name}
            onChange={(v) => {
              setName(v);
              setNameTouched(true);
            }}
            placeholder="e.g. Home"
            required
          />
          <SelectField label="Type" value={type} onChange={(v) => setType(v as LocationType)} options={PLACE_TYPES} />
          <PlaceField
            label="Find the address"
            value={spot}
            allowMap={false}
            onChange={(v) => {
              setSpot(v);
              // Name the place after the address the driver picked, until they type a name of their own.
              if (v && v.lat != null && !nameTouched && v.label) setName(v.label.split(",")[0]);
            }}
          />
          <p className={styles.hint}>Or click the map to drop the pin where you want it.</p>
          <div>
            <label className="mc-field__label" htmlFor="place-radius">
              Radius: <span className={styles.num}>{radius} m</span>
            </label>
            <input
              id="place-radius"
              className={styles.slider}
              type="range"
              min={50}
              max={1000}
              step={25}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              aria-valuetext={`${radius} metres`}
            />
            <p className={styles.hint}>
              {rec && rec.recommendedRadiusMeters
                ? `Drivers like you use about ${rec.recommendedRadiusMeters} m for a ${typeWord}.`
                : `A good start is about ${rec?.fallbackRadiusMeters ?? 200} m.`}
            </p>
          </div>
          <Toggle label="Use this place to name and sort trips" value={geofence} onChange={setGeofence} />
          {error && <p className={styles.err} role="alert">{error}</p>}
          <div className={styles.actionsRow}>
            <Button type="submit" variant="primary" loading={saving}>
              {editing ? "Save changes" : "Add place"}
            </Button>
            {editing && (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                <span className={styles.dangerText}>Delete place</span>
              </Button>
            )}
          </div>
        </form>
      </Card>

      <div className={styles.stack}>
        <MapView
          height={360}
          fitTo="markers"
          markers={hasPoint ? [{ lat: spot!.lat!, lng: spot!.lng!, kind: "place" }] : []}
          circles={hasPoint ? [{ lat: spot!.lat!, lng: spot!.lng!, radiusM: mapRadius }] : []}
          onClick={(lat, lng) => setSpot({ label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng })}
        />
        <p className={styles.hint}>Your phone uses these to sort trips and name them.</p>
      </div>

      <ProDialog
        open={proOpen}
        reason="places"
        onClose={() => setProOpen(false)}
        body="Free accounts can save 2 places. Pro has no limit. £4.99 a month, cancel any time."
      />
      {editing && place && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this place?"
          body={`${place.name} goes from your saved places. Your trips stay.`}
          confirmLabel="Delete"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api.delete(`/saved-locations/${place.id}`);
            show("Deleted");
            router.push("/dashboard/places");
          }}
        />
      )}
    </div>
  );
}
