"use client";

import { useId, useState } from "react";
import { HMRC_RATES_BY_TAX_YEAR, HMRC_THRESHOLD_MILES } from "@mileclear/shared";

type TaxYear = keyof typeof HMRC_RATES_BY_TAX_YEAR;
type Vehicle = "car" | "motorbike" | "bicycle";

// Bicycles are an employee-only AMAP rate (20p flat, unchanged in 2026-27).
// The shared constants only cover what the app tracks, so it lives here.
const BICYCLE_PENCE = 20;

const TAX_YEARS: { value: TaxYear; label: string }[] = [
  { value: "2026-27", label: "2026/27 (6 Apr 2026 to 5 Apr 2027)" },
  { value: "2025-26", label: "2025/26 (6 Apr 2025 to 5 Apr 2026)" },
];

const VEHICLES: { value: Vehicle; label: string }[] = [
  { value: "car", label: "Car or van" },
  { value: "motorbike", label: "Motorcycle" },
  { value: "bicycle", label: "Bicycle" },
];

function parseWhole(input: string, max: number): number {
  const n = parseInt(input.replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

function gbp(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function miles(n: number): string {
  return n.toLocaleString("en-GB");
}

export default function RateCalculator() {
  const id = useId();
  const [taxYear, setTaxYear] = useState<TaxYear>("2026-27");
  const [vehicle, setVehicle] = useState<Vehicle>("car");
  const [milesInput, setMilesInput] = useState("12000");
  const [paidInput, setPaidInput] = useState("");

  const businessMiles = parseWhole(milesInput, 500_000);
  const employerPence = parseWhole(paidInput, 200);
  const rates = HMRC_RATES_BY_TAX_YEAR[taxYear];

  let claimPence: number;
  let breakdown: string;
  if (vehicle === "car") {
    const first = Math.min(businessMiles, HMRC_THRESHOLD_MILES);
    const after = Math.max(0, businessMiles - HMRC_THRESHOLD_MILES);
    claimPence = first * rates.car.first10000 + after * rates.car.after10000;
    breakdown =
      after > 0
        ? `${miles(first)} × ${rates.car.first10000}p + ${miles(after)} × ${rates.car.after10000}p`
        : `${miles(first)} × ${rates.car.first10000}p`;
  } else {
    const rate = vehicle === "motorbike" ? rates.motorbike.flat : BICYCLE_PENCE;
    claimPence = businessMiles * rate;
    breakdown = `${miles(businessMiles)} × ${rate}p`;
  }

  const paidPence = businessMiles * employerPence;
  const gapPence = Math.max(0, claimPence - paidPence);
  const overPence = Math.max(0, paidPence - claimPence);
  const showEmployer = paidInput.trim() !== "" && businessMiles > 0;

  return (
    <form
      className="hr-calc"
      onSubmit={(e) => e.preventDefault()}
      aria-labelledby={`${id}-title`}
    >
      <h3 id={`${id}-title`} className="hr-calc__title">
        Mileage claim calculator
      </h3>

      <div className="hr-calc__fields">
        <div className="hr-field">
          <label htmlFor={`${id}-year`}>Tax year</label>
          <select
            id={`${id}-year`}
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value as TaxYear)}
          >
            {TAX_YEARS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="hr-field">
          <label htmlFor={`${id}-miles`}>Business miles in that tax year</label>
          <input
            id={`${id}-miles`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={milesInput}
            onChange={(e) => setMilesInput(e.target.value)}
          />
        </div>

        <fieldset className="hr-field hr-field--wide">
          <legend>Vehicle</legend>
          <div className="hr-seg">
            {VEHICLES.map((v) => (
              <label key={v.value} className="hr-seg__opt">
                <input
                  type="radio"
                  name={`${id}-vehicle`}
                  value={v.value}
                  checked={vehicle === v.value}
                  onChange={() => setVehicle(v.value)}
                />
                <span>{v.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="hr-field hr-field--wide">
          <label htmlFor={`${id}-paid`}>
            Employees only: your employer pays (pence per mile, optional)
          </label>
          <input
            id={`${id}-paid`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 30"
            value={paidInput}
            onChange={(e) => setPaidInput(e.target.value)}
            aria-describedby={`${id}-paid-hint`}
          />
          <span id={`${id}-paid-hint`} className="hr-field__hint">
            Leave blank if you are self-employed.
          </span>
        </div>
      </div>

      <div className="hr-calc__result" aria-live="polite">
        <div className="hr-calc__row">
          <span>{vehicle === "bicycle" ? "Approved amount" : "Mileage allowance at HMRC rates"}</span>
          <strong className="hr-calc__big">{gbp(claimPence)}</strong>
        </div>
        <p className="hr-calc__sum">{businessMiles > 0 ? breakdown : "Enter your business miles"}</p>

        {vehicle === "bicycle" && (
          <p className="hr-calc__note">
            The 20p bicycle rate is for employees (AMAP). Simplified expenses for
            the self-employed cover cars, goods vehicles and motorcycles only.
          </p>
        )}

        {showEmployer && (
          <div className="hr-calc__employer">
            <div className="hr-calc__row">
              <span>Your employer paid ({miles(businessMiles)} × {employerPence}p)</span>
              <strong>{gbp(paidPence)}</strong>
            </div>
            {gapPence > 0 ? (
              <div className="hr-calc__row hr-calc__row--accent">
                <span>Mileage Allowance Relief you can claim on</span>
                <strong>{gbp(gapPence)}</strong>
              </div>
            ) : (
              <p className="hr-calc__note">
                No Mileage Allowance Relief: your employer paid at least the approved amount.
                {overPence > 0 &&
                  ` The ${gbp(overPence)} paid above it is taxable and goes through payroll or a P11D.`}
              </p>
            )}
            {gapPence > 0 && (
              <p className="hr-calc__note">
                The relief is tax relief on {gbp(gapPence)}, not a payment of it: at
                20% basic rate that is {gbp(Math.round(gapPence * 0.2))} off your tax,
                at 40% it is {gbp(Math.round(gapPence * 0.4))}.
              </p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
