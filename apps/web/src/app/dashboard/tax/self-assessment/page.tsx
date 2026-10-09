"use client";

import { useState } from "react";
import { SA103_BOXES, getTaxYear, type Sa103Box } from "@mileclear/shared";
import { api } from "@/lib/api";
import { planHref } from "@/lib/dashboard/proReasons";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  ProChip,
  Skeleton,
  TaxYearPicker,
  formatMiles,
  formatPence,
  useData,
  useMe,
} from "@/components/dashboard/kit";
import { downloadFile, messageOf, todayStamp } from "@/components/dashboard/tax/tax-utils";
import "@/components/dashboard/tax/tax.css";

// The shape of GET /self-assessment/summary (apps/api/src/routes/selfAssessment).
interface SaSummary {
  taxYear: string;
  totalEarningsPence: number;
  platformBreakdown: { platform: string; totalPence: number; count: number }[];
  totalMiles: number;
  businessMiles: number;
  personalMiles: number;
  mileageDeductionPence: number;
  vehicleBreakdown: {
    vehicleId: string;
    make: string;
    model: string;
    vehicleType: string;
    businessMiles: number;
    personalMiles: number;
    totalMiles: number;
    deductionPence: number;
  }[];
  expenseBreakdown: { category: string; label: string; totalPence: number; deductibleWithMileage: boolean }[];
  allowableExpensesPence: number;
  nonMileageExpensesPence: number;
  taxableProfitPence: number;
  taxBandBreakdown: { band: string; type: string; ratePct: number | null; amountPence: number; description: string }[];
  totalTaxPence: number;
  effectiveRatePercent: number;
  sa103Values: Record<string, number>;
}

const PLATFORM: Record<string, string> = {
  uber: "Uber and Uber Eats",
  deliveroo: "Deliveroo",
  just_eat: "Just Eat",
  amazon_flex: "Amazon Flex",
  stuart: "Stuart",
  gophr: "Gophr",
  dpd: "DPD",
  yodel: "Yodel",
  evri: "Evri",
  other: "Other",
};

const VEHICLE_TYPE: Record<string, string> = { car: "Car", van: "Van", motorbike: "Motorbike" };

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key.replace(/_/g, " ");
}

function isEmptyYear(s: SaSummary): boolean {
  return s.totalEarningsPence === 0 && s.totalMiles === 0 && s.allowableExpensesPence === 0 && s.nonMileageExpensesPence === 0;
}

function BoxRow({ box, s }: { box: Sa103Box; s: SaSummary }) {
  const amount = s.sa103Values[box.dataKey] ?? 0;
  return (
    <li className="mc-tax-box">
      <div className="mc-tax-box__head">
        <span className="mc-tax-box__num">Box {box.box}</span>
        <span className="mc-tax-box__label">{box.label}</span>
        <span className="mc-tax-box__amount">{formatPence(amount)}</span>
      </div>
      <details>
        <summary>Where this comes from</summary>
        <div className="mc-tax-box__more">
          <p className="mc-tax-text">{box.description}</p>
          {box.dataKey === "totalEarnings" && s.platformBreakdown.length > 0 && (
            <ul className="mc-tax-kv">
              {s.platformBreakdown.map((p) => (
                <li key={p.platform}>
                  <span className="mc-tax-kv__label">
                    {label(PLATFORM, p.platform)}
                    <span className="mc-tax-kv__sub">{p.count} {p.count === 1 ? "entry" : "entries"}</span>
                  </span>
                  <span className="mc-tax-kv__value">{formatPence(p.totalPence)}</span>
                </li>
              ))}
            </ul>
          )}
          {box.dataKey === "carVanTravelExpenses" && (
            <ul className="mc-tax-kv">
              <li>
                <span className="mc-tax-kv__label">Mileage claim ({formatMiles(s.businessMiles)} business)</span>
                <span className="mc-tax-kv__value">{formatPence(s.mileageDeductionPence)}</span>
              </li>
              <li>
                <span className="mc-tax-kv__label">Parking, tolls and other travel costs</span>
                <span className="mc-tax-kv__value">{formatPence(Math.max(0, amount - s.mileageDeductionPence))}</span>
              </li>
            </ul>
          )}
        </div>
      </details>
    </li>
  );
}

export default function SelfAssessmentPage() {
  const { isPro } = useMe();
  const [taxYear, setTaxYear] = useState(() => getTaxYear(new Date()));
  const [busy, setBusy] = useState(false);
  const [dlError, setDlError] = useState<string | null>(null);
  const { data, error, loading, reload } = useData<SaSummary>(`sa-summary-${taxYear}`, () =>
    api.get<{ data: SaSummary }>(`/self-assessment/summary?taxYear=${taxYear}`).then((r) => r.data)
  );

  async function download() {
    setBusy(true);
    setDlError(null);
    try {
      await downloadFile(`/exports/self-assessment?taxYear=${taxYear}`, `mileclear-self-assessment-${taxYear}-${todayStamp()}.pdf`);
    } catch (e) {
      setDlError(messageOf(e, "Couldn't download the PDF. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  const empty = !!data && isEmptyYear(data);
  const pdf = empty ? undefined : isPro ? (
    <Button variant="primary" icon="download-outline" loading={busy} onClick={download}>
      Download PDF
    </Button>
  ) : (
    <Button variant="primary" icon="download-outline" href={planHref("sa_pdf")}>
      Download PDF <ProChip />
    </Button>
  );

  const boxes = data
    ? SA103_BOXES.filter((b) => b.key || (data.sa103Values[b.dataKey] ?? 0) !== 0)
    : [];

  return (
    <>
      <PageHeader title="Self Assessment" back={{ href: "/dashboard/tax", label: "Tax" }} primary={pdf}>
        Your records laid out against the short self-employment pages (SA103S).
      </PageHeader>
      <div className="mc-tax-page">
        <div className="mc-tax-toolbar">
          <div className="mc-tax-picker">
            <TaxYearPicker value={taxYear} onChange={setTaxYear} />
          </div>
        </div>

        {dlError && (
          <p className="mc-tax-error" role="alert">
            {dlError}
          </p>
        )}

        {loading && !data && <Skeleton variant="card" count={3} />}
        {error && !data && <ErrorState title="Couldn't load your tax figures" onRetry={reload} />}

        {data && empty && (
          <EmptyState
            icon="calculator-outline"
            title={`No records for ${taxYear} yet`}
            body="Trips, earnings and expenses for this tax year show up here."
            action={{ label: "Go to trips", href: "/dashboard/trips" }}
          />
        )}

        {data && !empty && (
          <>
            <Card title="Your SA103 boxes" padded={false}>
              <ul className="mc-tax-boxes">
                {boxes.map((b) => (
                  <BoxRow key={b.box} box={b} s={data} />
                ))}
              </ul>
            </Card>

            <Card title="Estimated tax">
              <ul className="mc-tax-kv">
                {data.taxBandBreakdown.map((r, i) => (
                  <li key={`${r.band}-${i}`}>
                    <span className="mc-tax-kv__label">
                      {r.band}
                      {r.ratePct !== null && r.ratePct > 0 ? ` (${Math.round(r.ratePct * 1000) / 10}%)` : ""}
                      <span className="mc-tax-kv__sub">{r.description}</span>
                    </span>
                    <span className="mc-tax-kv__value">{formatPence(r.amountPence)}</span>
                  </li>
                ))}
                <li className="is-total">
                  <span className="mc-tax-kv__label">
                    Total you may owe
                    <span className="mc-tax-kv__sub">{data.effectiveRatePercent}% of your earnings</span>
                  </span>
                  <span className="mc-tax-kv__value">{formatPence(data.totalTaxPence)}</span>
                </li>
              </ul>
              <p className="mc-tax-note">An estimate from what you have recorded. Your real bill comes from your return.</p>
            </Card>

            <Card title="Miles and mileage claim, by vehicle" padded={false}>
              {data.vehicleBreakdown.length === 0 ? (
                <div className="mc-tax-note mc-tax-padded">No trips recorded for this tax year.</div>
              ) : (
                <ul className="mc-tax-kv mc-tax-pad">
                  {data.vehicleBreakdown.map((v) => (
                    <li key={v.vehicleId}>
                      <span className="mc-tax-kv__label">
                        {`${v.make} ${v.model}`.trim()} ({label(VEHICLE_TYPE, v.vehicleType)})
                        <span className="mc-tax-kv__sub">
                          {formatMiles(v.businessMiles)} business, {formatMiles(v.personalMiles)} personal
                          {v.businessMiles > 0 && v.deductionPence === 0 ? ". Someone else pays for this vehicle, so no claim." : ""}
                        </span>
                      </span>
                      <span className="mc-tax-kv__value">{formatPence(v.deductionPence)}</span>
                    </li>
                  ))}
                  <li className="is-total">
                    <span className="mc-tax-kv__label">Mileage claim</span>
                    <span className="mc-tax-kv__value">{formatPence(data.mileageDeductionPence)}</span>
                  </li>
                </ul>
              )}
            </Card>

            {data.expenseBreakdown.length > 0 && (
              <Card title="Expenses" padded={false}>
                <ul className="mc-tax-kv mc-tax-pad">
                  {data.expenseBreakdown.map((e) => (
                    <li key={e.category}>
                      <span className="mc-tax-kv__label">
                        {e.label}
                        {!e.deductibleWithMileage && (
                          <span className="mc-tax-kv__sub">Not claimed alongside the mileage rate</span>
                        )}
                      </span>
                      <span className="mc-tax-kv__value">{formatPence(e.totalPence)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
