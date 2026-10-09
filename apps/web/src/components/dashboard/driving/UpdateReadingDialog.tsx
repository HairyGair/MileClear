"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "../kit/Button";
import { Dialog } from "../kit/Dialog";
import { NumberField, DateField, TimeField } from "../kit/Fields";
import {
  addOdometerReading,
  fetchMotHistory,
  fromInputs,
  ReadingConflictError,
  toDateInput,
  toTimeInput,
  type VehicleRow,
  vehicleName,
} from "./api";
import {
  checkReading,
  earliestReadAt,
  formatOdo,
  higherThanLaterAlert,
  liveHint,
  lowerThanEarlierAlert,
  motHintText,
  parseReadingInput,
  pickMotHint,
  saveOutcomeMessage,
  type MotHint,
} from "./odometerLogic";
import type { OdometerReadingEntry } from "@mileclear/shared";
import styles from "./driving.module.css";

type Stage =
  | { kind: "form" }
  | { kind: "confirm"; title: string; body: string }
  | { kind: "blocked"; title: string; body: string };

/**
 * "Update odometer": the reading, when it was read, our estimate and MOT hints,
 * and every refusal the app has (lower than earlier, higher than later, more than
 * 1,000 above the estimate, MOT typo checks). The API's 409 text is shown as given.
 *
 *   <UpdateReadingDialog open vehicle={v} estimateMiles={45262} readings={list} onClose={..} onSaved={(msg) => ..} />
 */
export function UpdateReadingDialog({
  open,
  vehicle,
  estimateMiles,
  readings,
  onClose,
  onSaved,
  onSeeReadings,
}: {
  open: boolean;
  vehicle: VehicleRow;
  estimateMiles: number | null;
  readings: readonly OdometerReadingEntry[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onSeeReadings?: () => void;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [saving, setSaving] = useState(false);
  const [mot, setMot] = useState<MotHint | null>(null);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setText("");
    setDate(toDateInput(now));
    setTime(toTimeInput(now));
    setError(null);
    setStage({ kind: "form" });
    setMot(null);
  }, [open]);

  // MOT hint: only when no reading exists and the vehicle has a plate. Never blocks the dialog.
  const hasReading = readings.some((r) => r.used);
  useEffect(() => {
    if (!open || hasReading || !vehicle.registrationPlate) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      cancelled = true;
    }, 2000);
    fetchMotHistory(vehicle.id)
      .then((res) => {
        if (!cancelled) setMot(pickMotHint(res?.motTests));
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, hasReading, vehicle.id, vehicle.registrationPlate]);

  const readAt = useMemo(() => (date ? fromInputs(date, time) : new Date()), [date, time]);
  const earliest = earliestReadAt(vehicle.createdAt, new Date());

  const hint = useMemo(() => {
    const earlier = readings
      .filter((r) => r.used && new Date(r.readAt).getTime() <= readAt.getTime())
      .sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime())[0];
    return liveHint({ text, estimateMiles, earlier: earlier ? { readingMiles: earlier.readingMiles, readAt: earlier.readAt } : null });
  }, [text, estimateMiles, readings, readAt]);

  async function save() {
    setSaving(true);
    setError(null);
    const parsed = parseReadingInput(text);
    if (parsed.kind !== "ok") {
      setSaving(false);
      return;
    }
    try {
      const created = await addOdometerReading(vehicle.id, { readingMiles: parsed.miles, readAt: readAt.toISOString() });
      onSaved(saveOutcomeMessage(created.estimatedMiles ?? estimateMiles, parsed.miles));
      onClose();
    } catch (e) {
      if (e instanceof ReadingConflictError) {
        // The API's refusal, shown as given. The lower and higher cases get the app's own title.
        if (e.code === "LOWER_THAN_EARLIER" && e.other) {
          const a = lowerThanEarlierAlert(e.other.readingMiles, new Date(e.other.readAt));
          setStage({ kind: "blocked", title: a.title, body: a.body });
        } else if (e.code === "HIGHER_THAN_LATER" && e.other) {
          const a = higherThanLaterAlert(e.other.readingMiles, new Date(e.other.readAt));
          setStage({ kind: "blocked", title: a.title, body: e.message || a.body });
        } else {
          setStage({ kind: "blocked", title: "Couldn't save that", body: e.message });
        }
      } else {
        const offline = e instanceof TypeError;
        setError(offline ? "You're offline. Connect to the internet and try again. Your trips are still being recorded." : e instanceof Error ? e.message : "Couldn't save that. Try again in a moment.");
      }
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    setError(null);
    const check = checkReading({ text, readAt, now: new Date(), estimateMiles, readings, mot });
    if (readAt.getTime() < earliest.getTime()) {
      setError("That date is too far back for this vehicle.");
      return;
    }
    if (check.kind === "error") {
      setError(check.message);
      return;
    }
    if (check.kind === "blocked") {
      const a = lowerThanEarlierAlert(check.earlierMiles, check.earlierAt);
      setStage({ kind: "blocked", title: a.title, body: a.body });
      return;
    }
    if (check.kind === "confirm") {
      setStage({ kind: "confirm", title: check.title, body: check.body });
      return;
    }
    void save();
  }

  const title = stage.kind === "form" ? "Update odometer" : stage.title;

  return (
    <Dialog
      open={open}
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        stage.kind === "form" ? (
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={submit}>Save reading</Button>
          </>
        ) : stage.kind === "confirm" ? (
          <>
            <Button variant="ghost" onClick={() => setStage({ kind: "form" })}>Fix it</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>Yes, it&apos;s right</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setStage({ kind: "form" })}>Check the number</Button>
            {onSeeReadings && (
              <Button
                variant="secondary"
                onClick={() => {
                  onClose();
                  onSeeReadings();
                }}
              >
                See readings
              </Button>
            )}
          </>
        )
      }
    >
      {stage.kind === "form" ? (
        <div className={styles.stack}>
          <p className={styles.muted}>{vehicleName(vehicle)}</p>
          <NumberField
            label="Reading"
            value={text}
            onChange={setText}
            suffix="miles"
            error={error ?? undefined}
            hint={
              hint.message
                ? hint.message
                : estimateMiles != null
                  ? `We estimate about ${formatOdo(estimateMiles)}.`
                  : mot
                    ? motHintText(mot)
                    : undefined
            }
          />
          {estimateMiles != null && hint.message && !error && (
            <p className={styles.hint}>We estimate about {formatOdo(estimateMiles)}.</p>
          )}
          {estimateMiles == null && mot && hint.message && <p className={styles.hint}>{motHintText(mot)}</p>}
          <div className={styles.formGrid + " " + styles.formGrid2}>
            <DateField label="When did you read it?" value={date} onChange={setDate} />
            <TimeField label="Time" value={time} onChange={setTime} />
          </div>
          <p className={styles.hint}>Best read when the car is parked.</p>
        </div>
      ) : (
        <p className="mc-dialog__text" role="alert">{stage.body}</p>
      )}
    </Dialog>
  );
}
