"use client";

// New Zealand drivers only (23 Oct 2026): IRD's 90-day vehicle logbook on
// Downloads, for one vehicle from a chosen first day. The page decides who
// sees it; the server checks again.
import { useState } from "react";
import {
  NZ_LOGBOOK_MIN_DAYS,
  addLogbookDays,
  defaultLogbookPeriod,
  nzDate,
  regimeFor,
  resolveLogbookPeriod,
} from "@mileclear/shared";
import { Button, Card, DateField, SelectField, useToast } from "@/components/dashboard/kit";
import { downloadFile, messageOf } from "./tax-utils";

interface VehicleLite {
  id: string;
  make: string;
  model: string;
  isPrimary?: boolean;
}

export function showsNzLogbook(country: string): boolean {
  return regimeFor(country)?.id === "nz-ird";
}

export function NzLogbookCard({ vehicles }: { vehicles: VehicleLite[] | null | undefined }) {
  const toast = useToast();
  const [from, setFrom] = useState(() => defaultLogbookPeriod().from);
  const [vehicleId, setVehicleId] = useState("");
  const [busy, setBusy] = useState<"pdf" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = vehicles ?? [];
  const chosen = vehicleId || (list.find((v) => v.isPrimary) ?? list[0])?.id || "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(from) ? addLogbookDays(from, NZ_LOGBOOK_MIN_DAYS - 1) : "";
  const period = resolveLogbookPeriod(from, to || undefined);
  const invalid = period.ok ? null : period.error;

  async function go(format: "pdf" | "csv") {
    if (!period.ok) return;
    setBusy(format);
    setError(null);
    const q = new URLSearchParams({ from: period.from, to: period.to });
    if (chosen) q.set("vehicleId", chosen);
    try {
      await downloadFile(`/exports/logbook-${format}?${q}`, `mileclear-logbook-${period.from}-to-${period.to}.${format}`);
      toast.show("Downloaded");
    } catch (e) {
      setError(messageOf(e, "Couldn't download this. Check your connection and try again."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="90-day logbook (IRD)">
      <p className="mc-tax-note">
        IRD asks for a logbook of at least 90 days in a row to set your business use. This one lists every trip in
        the 90 days with its date, distance and reason, and works out your business percentage.
      </p>
      <div className="mc-tax-fields">
        {list.length > 1 && (
          <SelectField
            label="Vehicle"
            value={chosen}
            onChange={setVehicleId}
            options={list.map((v) => ({ value: v.id, label: `${v.make} ${v.model}`.trim() }))}
          />
        )}
        <DateField
          label="First day"
          value={from}
          onChange={(v) => {
            setFrom(v);
            setError(null);
          }}
          hint={to ? `${nzDate(from)} to ${nzDate(to)}. Write the odometer reading on the first and last day in from your car.` : undefined}
          error={invalid ?? undefined}
        />
      </div>
      <div className="mc-tax-dl">
        <div className="mc-tax-dl__text">
          <p className="mc-tax-dl__title">Logbook (PDF)</p>
          <p className="mc-tax-note">Ready to keep or print, with the summary at the top.</p>
        </div>
        <Button variant="secondary" icon="download-outline" loading={busy === "pdf"} disabled={!!invalid || busy !== null} onClick={() => go("pdf")} aria-label="Download: Logbook (PDF)">
          Download
        </Button>
      </div>
      <div className="mc-tax-dl">
        <div className="mc-tax-dl__text">
          <p className="mc-tax-dl__title">Logbook (CSV)</p>
          <p className="mc-tax-note">The same trips, for a spreadsheet.</p>
        </div>
        <Button variant="secondary" icon="download-outline" loading={busy === "csv"} disabled={!!invalid || busy !== null} onClick={() => go("csv")} aria-label="Download: Logbook (CSV)">
          Download
        </Button>
      </div>
      {error && (
        <p className="mc-tax-error" role="alert">
          {error}
        </p>
      )}
    </Card>
  );
}
