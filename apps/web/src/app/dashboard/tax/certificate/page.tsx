"use client";

import { useState } from "react";
import {
  CERTIFICATE_MONTHLY_LIMIT,
  CERTIFICATE_PURPOSES,
  CERTIFICATE_STATEMENT,
  type CertificatePurpose,
  type MileageCertificatePreview,
  type MileageCertificateSummary,
} from "@mileclear/shared";
import { api } from "@/lib/api";
import { presetRange } from "@/lib/dashboard/periods";
import {
  Button,
  Card,
  ConfirmDialog,
  DateRangeField,
  EmptyState,
  ErrorState,
  PageHeader,
  ProGate,
  SelectField,
  Skeleton,
  StatusChip,
  formatMiles,
  useData,
  useToast,
} from "@/components/dashboard/kit";
import { downloadFile, longDate, messageOf, shortDateYear } from "@/components/dashboard/tax/tax-utils";
import "@/components/dashboard/tax/tax.css";

interface VehicleLite {
  id: string;
  make: string;
  model: string;
}

function Certificates() {
  const toast = useToast();
  const [range, setRange] = useState(() => presetRange("thisTaxYear"));
  const [vehicleId, setVehicleId] = useState("");
  const [purpose, setPurpose] = useState<CertificatePurpose | "">("");
  const [preview, setPreview] = useState<MileageCertificatePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<MileageCertificateSummary | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const { data: vehicles } = useData<VehicleLite[]>("cert-vehicles", () =>
    api.get<{ data: VehicleLite[] }>("/vehicles").then((r) => r.data)
  );
  const { data: list, error, loading, reload } = useData<MileageCertificateSummary[]>("certificates", () =>
    api.get<{ data: MileageCertificateSummary[] }>("/certificates").then((r) => r.data)
  );

  const body = () => ({
    periodStart: range.from,
    periodEnd: range.to,
    vehicleId: vehicleId || null,
    ...(purpose ? { purpose } : {}),
  });

  async function doPreview() {
    setPreviewing(true);
    setFormError(null);
    try {
      const res = await api.post<{ data: MileageCertificatePreview }>("/certificates/preview", body());
      setPreview(res.data);
    } catch (e) {
      setPreview(null);
      setFormError(messageOf(e, "Couldn't work out the figures. Try again."));
    } finally {
      setPreviewing(false);
    }
  }

  async function create() {
    setCreating(true);
    setFormError(null);
    try {
      await api.post("/certificates", body());
      toast.show("Certificate created");
      setPreview(null);
      reload();
    } catch (e) {
      setFormError(messageOf(e, "Couldn't make the certificate. Try again."));
    } finally {
      setCreating(false);
    }
  }

  async function copy(c: MileageCertificateSummary) {
    try {
      await navigator.clipboard.writeText(c.verifyUrl);
      toast.show("Link copied");
    } catch {
      toast.show("Couldn't copy. Select the link and copy it.", "error");
    }
  }

  async function pdf(c: MileageCertificateSummary) {
    setRowError((r) => ({ ...r, [c.id]: "" }));
    try {
      await downloadFile(`/certificates/${c.id}/pdf`, `mileclear-mileage-record-${c.code.slice(0, 8)}.pdf`);
    } catch (e) {
      setRowError((r) => ({ ...r, [c.id]: messageOf(e, "Couldn't download the PDF. Try again.") }));
    }
  }

  const invalid = !range.from || !range.to || range.from > range.to;

  return (
    <div className="mc-tax-page">
      <Card title="New certificate">
        <form
          className="mc-tax-fields"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <DateRangeField
            from={range.from}
            to={range.to}
            onChange={(r) => {
              setRange(r);
              setPreview(null);
            }}
            presets={["thisMonth", "lastMonth", "thisTaxYear", "lastTaxYear"]}
          />
          <div className="mc-tax-fields mc-tax-fields--2">
            {vehicles && vehicles.length > 0 && (
              <SelectField
                label="Vehicle"
                hint="Optional. Leave on all vehicles to include every trip."
                value={vehicleId}
                onChange={(v) => {
                  setVehicleId(v);
                  setPreview(null);
                }}
                options={[{ value: "", label: "All vehicles" }, ...vehicles.map((v) => ({ value: v.id, label: `${v.make} ${v.model}`.trim() }))]}
              />
            )}
            <SelectField
              label="Who is it for?"
              hint="Optional. It is printed on the certificate."
              value={purpose}
              onChange={(v) => setPurpose(v as CertificatePurpose | "")}
              options={[{ value: "", label: "Not said" }, ...CERTIFICATE_PURPOSES.map((p) => ({ value: p.value, label: p.label }))]}
            />
          </div>

          {formError && (
            <p className="mc-tax-error" role="alert">
              {formError}
            </p>
          )}

          <div className="mc-tax-inline">
            <Button variant="secondary" loading={previewing} disabled={invalid} onClick={doPreview}>
              Preview
            </Button>
            <Button type="submit" variant="primary" loading={creating} disabled={invalid}>
              Create certificate
            </Button>
          </div>
        </form>

        {preview && (
          <div className="mc-tax-stack" aria-live="polite">
            <h3 className="mc-card__title">What the certificate would show</h3>
            <ul className="mc-tax-kv" aria-label="Certificate preview">
              <li>
                <span className="mc-tax-kv__label">Total miles</span>
                <span className="mc-tax-kv__value">{formatMiles(preview.totalMiles)}</span>
              </li>
              <li>
                <span className="mc-tax-kv__label">Business</span>
                <span className="mc-tax-kv__value">{formatMiles(preview.businessMiles)}</span>
              </li>
              <li>
                <span className="mc-tax-kv__label">Personal</span>
                <span className="mc-tax-kv__value">{formatMiles(preview.personalMiles)}</span>
              </li>
              <li>
                <span className="mc-tax-kv__label">Not sorted</span>
                <span className="mc-tax-kv__value">{formatMiles(preview.unclassifiedMiles)}</span>
              </li>
              <li>
                <span className="mc-tax-kv__label">
                  Trips
                  <span className="mc-tax-kv__sub">{preview.gpsMilesPercent}% of the miles recorded by GPS</span>
                </span>
                <span className="mc-tax-kv__value">{preview.trips.toLocaleString("en-GB")}</span>
              </li>
            </ul>
            <p className="mc-tax-note">{CERTIFICATE_STATEMENT}</p>
          </div>
        )}
      </Card>

      <div className="mc-tax-stack">
        <h2 className="mc-card__title">Your certificates</h2>
        {loading && !list && <Skeleton variant="row" count={2} />}
        {error && !list && <ErrorState title="Couldn't load your certificates" onRetry={reload} size="card" />}
        {list && list.length === 0 && (
          <EmptyState
            size="card"
            icon="shield-checkmark-outline"
            title="No certificates yet"
            body="Create one to share your miles with an employer or lender."
          />
        )}
        {list && list.length > 0 && (
          <Card padded={false}>
            {list.map((c) => (
              <div key={c.id} className="mc-tax-cert">
                <div className="mc-tax-inline">
                  <strong>
                    {longDate(c.periodStart)} to {longDate(c.periodEnd)}
                  </strong>
                  {c.revokedAt ? <StatusChip tone="red" label="Withdrawn" /> : <StatusChip tone="green" label="Valid" />}
                </div>
                <p className="mc-tax-note">
                  {formatMiles(c.totalMiles)} in {c.trips.toLocaleString("en-GB")} {c.trips === 1 ? "trip" : "trips"}
                  {c.vehicleLabel ? `, ${c.vehicleLabel}` : ""}. Made {shortDateYear(c.createdAt)}.
                </p>
                <p className="mc-tax-cert__link">
                  <a className="mc-textlink" href={c.verifyUrl.startsWith("http") ? c.verifyUrl : `https://${c.verifyUrl}`} target="_blank" rel="noopener noreferrer">
                    {c.verifyUrl.replace(/^https?:\/\//, "")}
                  </a>
                </p>
                {!c.revokedAt && (
                  <div className="mc-tax-cert__actions">
                    <Button size="sm" variant="secondary" icon="share-outline" onClick={() => copy(c)}>
                      Copy link
                    </Button>
                    <Button size="sm" variant="secondary" icon="download-outline" onClick={() => pdf(c)}>
                      Download PDF
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRevoking(c)}>
                      Revoke
                    </Button>
                  </div>
                )}
                {rowError[c.id] && (
                  <p className="mc-tax-error" role="alert">
                    {rowError[c.id]}
                  </p>
                )}
              </div>
            ))}
          </Card>
        )}
        <p className="mc-tax-note">You can make {CERTIFICATE_MONTHLY_LIMIT} certificates a month.</p>
      </div>

      <ConfirmDialog
        open={revoking !== null}
        title="Revoke this certificate?"
        body="Anyone with the link will see it's no longer valid."
        confirmLabel="Revoke"
        destructive
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          if (!revoking) return;
          await api.post(`/certificates/${revoking.id}/revoke`);
          toast.show("Certificate revoked");
          reload();
        }}
      />
    </div>
  );
}

export default function CertificatePage() {
  return (
    <>
      <PageHeader title="Mileage certificate" back={{ href: "/dashboard/tax", label: "Tax" }}>
        A shareable record of the miles recorded in MileClear, for an insurer, employer, buyer or accountant.
      </PageHeader>
      <ProGate
        reason="certificate"
        page
        teaser={<p className="mc-tax-text">Pick a period, preview the figures, then share a link or PDF. Anyone with the link can check it.</p>}
      >
        <Certificates />
      </ProGate>
    </>
  );
}
