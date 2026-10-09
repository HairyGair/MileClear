"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FUEL_TYPES, VEHICLE_TYPES } from "@mileclear/shared";
import { api, isApiError } from "../../../lib/api";
import { Button } from "../kit/Button";
import { Card } from "../kit/Card";
import { ConfirmDialog } from "../kit/Dialog";
import { NumberField, SelectField, TextField, Toggle } from "../kit/Fields";
import { useToast } from "../kit/Toast";
import { addOdometerReading, type VehicleRow } from "./api";
import { ProDialog } from "./ProDialog";
import { MAX_READING_MILES, parseReadingInput } from "./odometerLogic";
import styles from "./driving.module.css";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const FUEL_OPTIONS = FUEL_TYPES.map((f) => ({ value: f, label: cap(f) }));
const TYPE_OPTIONS = VEHICLE_TYPES.map((t) => ({ value: t, label: cap(t) }));

function formatPlate(plate: string): string {
  return /^[A-Z]{2}[0-9]{2}[A-Z]{3}$/.test(plate) ? `${plate.slice(0, 4)} ${plate.slice(4)}` : plate;
}

interface FormState {
  plate: string;
  make: string;
  model: string;
  year: string;
  vehicleType: string;
  fuelType: string;
  mpg: string;
  milesPerKwh: string;
  isPrimary: boolean;
  providedByOthers: boolean;
  euroStatus: string;
  firstRegistration: string;
  odometerNow: string;
}

function fromVehicle(v: VehicleRow | null, isFirst: boolean): FormState {
  return {
    plate: v?.registrationPlate ?? "",
    make: v?.make ?? "",
    model: v?.model ?? "",
    year: v?.year ? String(v.year) : "",
    vehicleType: v?.vehicleType ?? "car",
    fuelType: v?.fuelType ?? "petrol",
    mpg: v?.estimatedMpg ? String(v.estimatedMpg) : "",
    milesPerKwh: v?.milesPerKwh != null ? String(v.milesPerKwh) : "",
    isPrimary: v ? v.isPrimary : isFirst,
    providedByOthers: v?.providedByOthers ?? false,
    euroStatus: v?.euroStatus ?? "",
    firstRegistration: v?.firstRegistration ?? "",
    odometerNow: "",
  };
}

/**
 * Add or edit a vehicle. Edit mode shows Save changes and Delete; add mode shows
 * "Odometer now (optional)". The free limit (1 own vehicle, 1 that someone else
 * pays for) opens the Pro dialog before the API is asked.
 *
 *   <VehicleForm vehicle={null} all={vehicles} isPro={false} />
 */
export function VehicleForm({
  vehicle,
  all,
  isPro,
  onSaved,
}: {
  vehicle: VehicleRow | null;
  all: VehicleRow[];
  isPro: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { show } = useToast();
  const editing = vehicle !== null;
  const [f, setF] = useState<FormState>(() => fromVehicle(vehicle, all.length === 0));
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [proOpen, setProOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const plateChanged = editing && f.plate.replace(/\s+/g, "").toUpperCase() !== (vehicle?.registrationPlate ?? "");
  const electric = f.fuelType === "electric";

  async function lookUp() {
    const reg = f.plate.replace(/\s+/g, "").toUpperCase();
    if (reg.length < 2) {
      setLookupMsg("Type the registration first.");
      return;
    }
    setLookingUp(true);
    setLookupMsg(null);
    try {
      const res = await api.post<{ data: Record<string, unknown> }>("/vehicles/lookup", { registrationNumber: reg });
      const v = res.data ?? {};
      setF((s) => ({
        ...s,
        plate: reg,
        make: typeof v.make === "string" && v.make ? v.make : s.make,
        year: typeof v.yearOfManufacture === "number" ? String(v.yearOfManufacture) : s.year,
        fuelType: typeof v.fuelType === "string" && (FUEL_TYPES as readonly string[]).includes(v.fuelType.toLowerCase()) ? v.fuelType.toLowerCase() : s.fuelType,
        euroStatus: typeof v.euroStatus === "string" ? v.euroStatus : s.euroStatus,
        firstRegistration: typeof v.firstRegistration === "string" ? v.firstRegistration : s.firstRegistration,
      }));
      setLookupMsg("Found it. Check the model and fuel, then save.");
    } catch (e) {
      setLookupMsg(e instanceof Error ? e.message : "The DVLA look up didn't work. Fill the details in yourself.");
    } finally {
      setLookingUp(false);
    }
  }

  async function save() {
    setError(null);
    if (!f.make.trim() || !f.model.trim()) {
      setError("Add the make and model.");
      return;
    }
    const odo = !editing && f.odometerNow.trim() ? parseReadingInput(f.odometerNow) : null;
    if (odo && odo.kind === "invalid") {
      setError("That doesn't look like an odometer reading. Check it and try again.");
      return;
    }
    // Free limit: 1 vehicle of your own and 1 that someone else pays for.
    const sameKind = all.filter((v) => !!v.providedByOthers === f.providedByOthers && v.id !== vehicle?.id);
    if (!editing && !isPro && sameKind.length >= 1) {
      setProOpen(true);
      return;
    }
    setSaving(true);
    const plate = f.plate.replace(/\s+/g, "").toUpperCase();
    const body: Record<string, unknown> = {
      make: f.make.trim(),
      model: f.model.trim(),
      fuelType: f.fuelType,
      vehicleType: f.vehicleType,
      isPrimary: f.isPrimary,
      providedByOthers: f.providedByOthers,
    };
    if (editing) {
      body.year = f.year ? parseInt(f.year, 10) : null;
      body.registrationPlate = plate || null;
      body.estimatedMpg = !electric && f.mpg ? parseFloat(f.mpg) : null;
      body.milesPerKwh = electric && f.milesPerKwh ? parseFloat(f.milesPerKwh) : null;
      body.euroStatus = f.euroStatus.trim() || null;
      body.firstRegistration = f.firstRegistration.trim() || null;
    } else {
      if (f.year) body.year = parseInt(f.year, 10);
      if (plate) body.registrationPlate = plate;
      if (!electric && f.mpg) body.estimatedMpg = parseFloat(f.mpg);
      if (electric && f.milesPerKwh) body.milesPerKwh = parseFloat(f.milesPerKwh);
      if (f.euroStatus.trim()) body.euroStatus = f.euroStatus.trim();
      if (f.firstRegistration.trim()) body.firstRegistration = f.firstRegistration.trim();
    }
    try {
      if (editing && vehicle) {
        await api.patch(`/vehicles/${vehicle.id}`, body);
        show("Saved");
        onSaved?.();
      } else {
        const res = await api.post<{ data: VehicleRow }>("/vehicles", body);
        const created = res.data;
        if (odo && odo.kind === "ok" && created?.id) {
          try {
            await addOdometerReading(created.id, { readingMiles: odo.miles });
          } catch {
            show("Vehicle saved. We couldn't save the odometer reading. Add it from the vehicle page.", "error");
          }
        }
        show("Vehicle added");
        router.push(created?.id ? `/dashboard/vehicles/${created.id}` : "/dashboard/vehicles");
      }
    } catch (e) {
      if (isApiError(e) && e.statusCode === 403 && !isPro) {
        setProOpen(true);
      } else {
        setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={editing ? "Details" : undefined}>
      <form
        className={styles.stack}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <div className={styles.stack}>
          <TextField label="Registration" value={f.plate} onChange={(v) => set("plate", v)} placeholder="e.g. AB12 CDE" required={false} hint="Used for MOT and tax reminders." />
          <div className={styles.actionsRow}>
            <Button variant="secondary" size="sm" loading={lookingUp} onClick={lookUp} disabled={f.plate.trim().length < 2}>
              Look up
            </Button>
            {lookupMsg && <span className={styles.hint} role="status">{lookupMsg}</span>}
          </div>
          {editing && vehicle?.dvlaPlateProblem && !plateChanged && f.plate && (
            <div className={`${styles.notice} ${styles.noticeWarn}`} role="alert">
              {vehicle.dvlaPlateProblem === "not_found"
                ? "The DVLA has no record of this plate, so we can't remind you about MOT and tax. Check it matches your logbook."
                : "The DVLA doesn't recognise this as a UK number plate, so we can't remind you about MOT and tax."}
              {vehicle.dvlaPlateSuggestion && (
                <div className={styles.mt}>
                  <Button variant="secondary" size="sm" onClick={() => set("plate", vehicle.dvlaPlateSuggestion ?? "")}>
                    Use {formatPlate(vehicle.dvlaPlateSuggestion)} instead
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`${styles.formGrid} ${styles.formGrid2}`}>
          <TextField label="Make" value={f.make} onChange={(v) => set("make", v)} placeholder="e.g. Toyota" required />
          <TextField label="Model" value={f.model} onChange={(v) => set("model", v)} placeholder="e.g. Prius" required />
        </div>
        <NumberField label="Year" value={f.year} onChange={(v) => set("year", v)} decimals={false} required={false} />
        {!editing && (
          <NumberField
            label="Odometer now (optional)"
            value={f.odometerNow}
            onChange={(v) => set("odometerNow", v)}
            suffix="miles"
            hint="The number on your dashboard. We add your trips to it."
            error={f.odometerNow && parseReadingInput(f.odometerNow).kind === "invalid" ? `Use a number up to ${MAX_READING_MILES.toLocaleString("en-GB")}.` : undefined}
          />
        )}
        <div className={`${styles.formGrid} ${styles.formGrid2}`}>
          <SelectField label="Vehicle type" value={f.vehicleType} onChange={(v) => set("vehicleType", v)} options={TYPE_OPTIONS} />
          <SelectField label="Fuel" value={f.fuelType} onChange={(v) => set("fuelType", v)} options={FUEL_OPTIONS} />
        </div>
        {electric ? (
          <NumberField label="Efficiency (miles per kWh)" value={f.milesPerKwh} onChange={(v) => set("milesPerKwh", v)} required={false} hint="For example 3.5." />
        ) : (
          <NumberField label="Estimated MPG" value={f.mpg} onChange={(v) => set("mpg", v)} required={false} hint="For example 45.0. Used for your fuel cost per mile." />
        )}
        <div className={`${styles.formGrid} ${styles.formGrid2}`}>
          <TextField label="Euro status" value={f.euroStatus} onChange={(v) => set("euroStatus", v)} required={false} hint="From the DVLA look up." />
          <TextField label="First registered" value={f.firstRegistration} onChange={(v) => set("firstRegistration", v)} required={false} placeholder="YYYY-MM" maxLength={7} />
        </div>
        <Toggle label="Primary vehicle" value={f.isPrimary} onChange={(v) => set("isPrimary", v)} hint="New trips use your primary vehicle." />
        <Toggle
          label="Someone else pays for this vehicle"
          value={f.providedByOthers}
          onChange={(v) => set("providedByOthers", v)}
          hint="For a client's or employer's van. Its miles still count, but its business trips are left out of your mileage claim."
        />

        {error && <p className={styles.err} role="alert">{error}</p>}
        <div className={styles.actionsRow}>
          <Button type="submit" variant="primary" loading={saving}>
            {editing ? "Save changes" : "Add vehicle"}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              <span className={styles.dangerText}>Delete vehicle</span>
            </Button>
          )}
        </div>
      </form>

      <ProDialog
        open={proOpen}
        reason="vehicles"
        onClose={() => setProOpen(false)}
        body={
          f.providedByOthers
            ? "Free accounts can have 1 vehicle that someone else pays for. Pro has no limit. £4.99 a month, cancel any time."
            : "Free accounts can have 1 vehicle. Pro has no limit. £4.99 a month, cancel any time."
        }
      />
      {editing && vehicle && (
        <ConfirmDialog
          open={confirmDelete}
          title="Delete this vehicle?"
          body={`${vehicle.make} ${vehicle.model} goes from your records, with its odometer readings. Your trips stay.`}
          confirmLabel="Delete"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api.delete(`/vehicles/${vehicle.id}`);
            show("Deleted");
            router.push("/dashboard/vehicles");
          }}
        />
      )}
    </Card>
  );
}
