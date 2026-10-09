"use client";

import { useState } from "react";
import type { SavedLocation } from "@mileclear/shared";
import { api } from "../../../lib/api";
import { Button, DateField, Dialog, PlaceField, TextArea, TimeField, useToast, type PlaceValue } from "../kit";
import { formatDay } from "../../../lib/dashboard";
import { localToIso, toYmd } from "./lib/days";
import { errorText } from "./lib/labels";
import "./trips.css";

export const THANKS = "Thanks. We'll look into it and email you.";

/** "Missing a trip you made?" Sends the day, time and places so we can check what the phone recorded. */
export function ReportMissingDialog({
  open,
  onClose,
  savedPlaces = [],
}: {
  open: boolean;
  onClose: () => void;
  savedPlaces?: SavedLocation[];
}) {
  const toast = useToast();
  const [date, setDate] = useState(() => toYmd(new Date()));
  const [time, setTime] = useState("");
  const [from, setFrom] = useState<PlaceValue | null>(null);
  const [to, setTo] = useState<PlaceValue | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function reset() {
    setDate(toYmd(new Date()));
    setTime("");
    setFrom(null);
    setTo(null);
    setNote("");
    setError(null);
    setSent(false);
  }

  function close() {
    onClose();
    // Reset after the close animation so the form does not flash.
    window.setTimeout(reset, 200);
  }

  async function send() {
    if (!date) {
      setError("Choose the day you drove.");
      return;
    }
    setBusy(true);
    setError(null);
    const when = formatDay(new Date(`${date}T12:00:00`));
    const text =
      `Drove ${from?.label ? `from ${from.label} ` : ""}${to?.label ? `to ${to.label} ` : ""}on ${when}${time ? ` around ${time}` : ""}.` +
      (note.trim() ? ` ${note.trim()}` : "");
    try {
      await api.post("/trips/report-missing", {
        note: text.slice(0, 1000),
        reportedDate: date,
        ...(from?.label ? { from: from.label.slice(0, 300) } : {}),
        ...(to?.label ? { to: to.label.slice(0, 300) } : {}),
        ...(time ? { departAt: localToIso(date, time) } : {}),
        ...(note.trim() ? { extraNote: note.trim().slice(0, 1000) } : {}),
      });
      setSent(true);
      toast.show(THANKS);
    } catch (e) {
      setError(errorText(e, "Couldn't send. Try again. Your details are still here."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Missing a trip you made?"
      onClose={close}
      footer={
        sent ? (
          <Button variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={send}>
              Send report
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <p className="mc-dialog__text" role="status">
          {THANKS}
        </p>
      ) : (
        <div className="mc-tripform">
          <p className="mc-dialog__text">
            Tell us when and where. We check what your phone recorded and add the trip if we can.
          </p>
          <div className="mc-tripform__row mc-tripform__row--2">
            <DateField label="Day" value={date} onChange={setDate} required />
            <TimeField label="Rough time" value={time} onChange={setTime} required={false} />
          </div>
          <PlaceField label="From" value={from} onChange={setFrom} savedPlaces={savedPlaces} allowMap={false} />
          <PlaceField label="To" value={to} onChange={setTo} savedPlaces={savedPlaces} allowMap={false} />
          <TextArea label="Anything else?" value={note} onChange={setNote} rows={3} maxLength={1000} required={false} />
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
