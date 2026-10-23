"use client";

import { useState } from "react";
import { useCountryFeatures } from "@/lib/dashboard/country";
import {
  exportProjectChoices,
  exportProjectSlug,
  exportVehicleChoices,
  exportVehicleSlug,
  getTaxYear,
} from "@mileclear/shared";
import { api } from "@/lib/api";
import { taxYearRange } from "@/lib/dashboard/periods";
import { exportClientOptions } from "@/lib/dashboard/exportClients";
import {
  Button,
  Card,
  DateRangeField,
  PageHeader,
  ProGate,
  Segmented,
  SelectField,
  TaxYearPicker,
  Toggle,
  useData,
  useMe,
  useToast,
} from "@/components/dashboard/kit";
import { downloadFile, messageOf, todayStamp } from "@/components/dashboard/tax/tax-utils";
import { NzLogbookCard, showsNzLogbook } from "@/components/dashboard/tax/NzLogbookCard";
import { endOfLocalDayIso, startOfLocalDayIso } from "@/components/dashboard/trips/lib/days";

function datesInvalidFor(r: { from: string; to: string }): boolean {
  return !/^\d{4}-\d{2}-\d{2}$/.test(r.from) || !/^\d{4}-\d{2}-\d{2}$/.test(r.to);
}
import "@/components/dashboard/tax/tax.css";

type PeriodMode = "year" | "dates";

interface VehicleLite {
  id: string;
  make: string;
  model: string;
  registration?: string | null;
  registrationPlate?: string | null;
  isPrimary?: boolean;
}

interface RowDef {
  key: string;
  title: string;
  hint: string;
  button: string;
  disabledReason?: string;
  path?: string;
  filename?: string;
  href?: string;
}

function ExportRow({ row }: { row: RowDef }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (!row.path || !row.filename) return;
    setBusy(true);
    setError(null);
    try {
      await downloadFile(row.path, row.filename);
      toast.show("Downloaded");
    } catch (e) {
      // The API's own sentence, for example "There are no trips in that date range yet".
      setError(messageOf(e, "Couldn't download this. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mc-tax-dl">
      <div className="mc-tax-dl__text">
        <p className="mc-tax-dl__title">{row.title}</p>
        <p className="mc-tax-note">{row.disabledReason ?? row.hint}</p>
      </div>
      {row.href ? (
        <Button variant="secondary" href={row.href}>
          {row.button}
        </Button>
      ) : (
        <Button
          variant="secondary"
          icon="download-outline"
          loading={busy}
          disabled={!!row.disabledReason}
          onClick={go}
          aria-label={`${row.button}: ${row.title}`}
        >
          {row.button}
        </Button>
      )}
      {error && (
        <p className="mc-tax-error mc-tax-dl__err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Exports() {
  const { mode } = useMe();
  // Outside the UK (23 Oct 2026) the UK tax year means nothing: dates only,
  // and no Self Assessment summary or certificate.
  const { ukTax, country } = useCountryFeatures();
  const [periodChoice, setPeriodMode] = useState<PeriodMode>("year");
  const periodMode: PeriodMode = ukTax ? periodChoice : "dates";
  const [taxYear, setTaxYear] = useState(() => getTaxYear(new Date()));
  const [range, setRange] = useState(() => taxYearRange(getTaxYear(new Date())));
  const [businessOnly, setBusinessOnly] = useState(mode === "work");
  const [vehicleId, setVehicleId] = useState("");
  // The trip report and trips CSV: "" is every vehicle (Colin, 17 Oct 2026).
  const [tripCarId, setTripCarId] = useState("");
  const { data: vehicles } = useData<VehicleLite[]>("exports-vehicles", () =>
    api.get<{ data: VehicleLite[] }>("/vehicles").then((r) => r.data)
  );
  const carChoices = exportVehicleChoices(vehicles ?? []);
  const tripCar = carChoices ? vehicles?.find((v) => v.id === tripCarId) : undefined;
  const carParam = tripCar ? `&vehicleId=${encodeURIComponent(tripCar.id)}` : "";
  const carSlug = tripCar ? `${exportVehicleSlug(tripCar)}-` : "";
  // The trip report and trips CSV for one Project / client: "" is every
  // client (23 Oct 2026). Only offered once a trip has a client.
  const [tripClient, setTripClient] = useState("");
  const { data: projectLabels } = useData<string[]>("exports-project-labels", () =>
    api.get<{ data: { labels: string[] } }>("/trips/project-labels").then((r) => r.data.labels ?? [])
  );
  // A chosen client that leaves the list stays chosen and on screen (exportClientOptions).
  const clientChoices = exportClientOptions(exportProjectChoices(projectLabels ?? []), tripClient);
  const client = tripClient || undefined;
  const clientParam = client ? `&projectLabel=${encodeURIComponent(client)}` : "";
  const clientSlug = client ? `${exportProjectSlug(client)}-` : "";

  // Dates: the trip exports take instants, so the last day runs to the end of that day.
  const period = periodMode === "year" ? `taxYear=${taxYear}` : `from=${range.from}&to=${range.to}`;
  // UK days, not UTC ones (a BST morning trip fell outside the old UTC range).
  const tripPeriod =
    periodMode === "year" || datesInvalidFor(range)
      ? period
      : `from=${startOfLocalDayIso(range.from)}&to=${endOfLocalDayIso(range.to)}`;
  const label = periodMode === "year" ? taxYear : `${range.from}-to-${range.to}`;
  const stamp = todayStamp();
  const biz = businessOnly ? "&classification=business" : "";
  const datesInvalid = periodMode === "dates" && (!range.from || !range.to || range.from > range.to);
  const invalid = datesInvalid ? "Choose a start date that is before the end date." : undefined;

  const allRows: RowDef[] = [
    {
      key: "sa",
      title: "Self Assessment summary (PDF)",
      hint: "Your figures laid out for your return, with a cover sheet.",
      button: "Download",
      path: `/exports/self-assessment?taxYear=${taxYear}`,
      filename: `mileclear-self-assessment-${taxYear}-${stamp}.pdf`,
      disabledReason: periodMode === "dates" ? "This one is by tax year. Switch to Tax year above." : undefined,
    },
    {
      key: "pdf",
      title: "Trip report (PDF)",
      hint: "Every trip in the period, with a mileage summary.",
      button: "Download",
      path: `/exports/pdf?${tripPeriod}${biz}${carParam}${clientParam}`,
      filename: `mileclear-trips-${clientSlug}${carSlug}${label}-${stamp}.pdf`,
      disabledReason: invalid,
    },
    {
      key: "csv",
      title: "Trips (CSV)",
      hint: "One row per trip, for a spreadsheet or your accountant.",
      button: "Download",
      path: `/exports/csv?${tripPeriod}${biz}${carParam}${clientParam}`,
      filename: `mileclear-trips-${clientSlug}${carSlug}${label}-${stamp}.csv`,
      disabledReason: invalid,
    },
    {
      key: "odo",
      title: "Odometer readings (CSV)",
      hint: "Start and end readings for each day you drove.",
      button: "Download",
      path: `/exports/odometer-log?${period}${vehicleId ? `&vehicleId=${vehicleId}` : ""}`,
      filename: `mileclear-odometer-log-${label}-${stamp}.csv`,
      disabledReason: invalid,
    },
    {
      key: "cert",
      title: "Mileage certificate",
      hint: "A shareable record of your miles for an insurer, employer or buyer.",
      button: "Open",
      href: "/dashboard/tax/certificate",
    },
  ];
  const rows = ukTax ? allRows : allRows.filter((r) => r.key !== "sa" && r.key !== "cert");

  return (
    <div className="mc-tax-page">
      <Card title="Period">
        <div className="mc-tax-fields">
          {ukTax && <Segmented<PeriodMode>
            ariaLabel="Choose a period type"
            options={[
              { value: "year", label: "Tax year" },
              { value: "dates", label: "Choose dates" },
            ]}
            value={periodMode}
            onChange={setPeriodMode}
          />}
          {periodMode === "year" ? (
            <div className="mc-tax-picker">
              <TaxYearPicker value={taxYear} onChange={setTaxYear} />
            </div>
          ) : (
            <DateRangeField from={range.from} to={range.to} onChange={setRange} />
          )}
          <Toggle
            label="Business trips only"
            hint="Leaves personal and unsorted trips out of the trip report and the trips CSV."
            value={businessOnly}
            onChange={setBusinessOnly}
          />
          {clientChoices && (
            <SelectField
              label="Client for the trip report and trips CSV"
              value={tripClient}
              onChange={setTripClient}
              options={clientChoices.map((c) => ({ value: c.projectLabel ?? "", label: c.label }))}
            />
          )}
          {carChoices && (
            <SelectField
              label="Vehicle for the trip report and trips CSV"
              value={tripCarId}
              onChange={setTripCarId}
              options={carChoices.map((c) => ({ value: c.vehicleId ?? "", label: c.label }))}
            />
          )}
          {vehicles && vehicles.length > 1 && (
            <SelectField
              label="Vehicle for the odometer log"
              value={vehicleId}
              onChange={setVehicleId}
              options={[
                { value: "", label: "Main vehicle" },
                ...vehicles.map((v) => ({ value: v.id, label: `${v.make} ${v.model}`.trim() })),
              ]}
            />
          )}
        </div>
      </Card>

      <Card padded={false}>
        {rows.map((r) => (
          // Remount when the period changes so an old error does not linger.
          <ExportRow key={`${r.key}-${period}-${businessOnly}-${vehicleId}-${tripCarId}-${client ?? ""}`} row={r} />
        ))}
      </Card>

      {/* New Zealand only: IRD's 90-day logbook (23 Oct 2026). */}
      {showsNzLogbook(country) && <NzLogbookCard vehicles={vehicles} />}

      {ukTax && <p className="mc-tax-text">Using Xero, QuickBooks or FreeAgent? Download the CSV and import it there.</p>}
    </div>
  );
}

export default function TaxExportsPage() {
  const { ukTax } = useCountryFeatures();
  return (
    <>
      {ukTax ? (
        <PageHeader title="Tax exports" back={{ href: "/dashboard/tax", label: "Tax" }} />
      ) : (
        <PageHeader title="Downloads" back={{ href: "/dashboard/more", label: "More" }} />
      )}
      <ProGate
        reason="exports"
        page
        teaser={
          <ul className="mc-tax-todo">
            {ukTax && <li>Self Assessment summary (PDF)</li>}
            <li>Trip report (PDF)</li>
            <li>Trips (CSV)</li>
            <li>Odometer readings (CSV)</li>
          </ul>
        }
      >
        <Exports />
      </ProGate>
    </>
  );
}
