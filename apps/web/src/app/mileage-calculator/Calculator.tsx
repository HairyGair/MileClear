"use client";

import { useMemo, useState } from "react";
import {
  calculateMileageDeduction,
  getTaxYear,
  HMRC_THRESHOLD_MILES,
} from "@mileclear/shared";

type VehicleType = "car" | "van" | "motorbike";
type TaxYear = "2025-26" | "2026-27";

const LITRES_PER_GALLON = 4.54609;

// Integer pence -> "£1,234.56". Shared formatPence() has no thousands
// separator, which reads poorly once claims run into 4-5 figures.
function gbp(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function clampNumber(raw: string, min: number, max: number): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return min;
  return Math.min(max, Math.max(min, parsed));
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.78rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: "0.4rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.7rem 0.9rem",
  fontSize: "1.0625rem",
  fontFamily: "var(--font-display)",
  color: "var(--text-white)",
  background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
};

const panel: React.CSSProperties = {
  background: "var(--bg-card-solid)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--r-lg)",
  padding: "clamp(1.25rem, 3vw, 2rem)",
};

/**
 * `initialPencePerLitre` is the current UK average pump price, fetched on the
 * server from our own fuel feed. Opening on a real price rather than a
 * hardcoded guess is the difference between a toy and a tool, and we already
 * pull this data for the app. Falls back to a stated average if unavailable.
 */
export default function Calculator({ initialPencePerLitre }: { initialPencePerLitre?: string }) {
  const defaultTaxYear = useMemo<TaxYear>(() => {
    const t = getTaxYear(new Date());
    return t === "2025-26" ? "2025-26" : "2026-27";
  }, []);

  const [milesInput, setMilesInput] = useState("8000");
  const [vehicle, setVehicle] = useState<VehicleType>("car");
  const [taxYear, setTaxYear] = useState<TaxYear>(defaultTaxYear);
  const [mpgInput, setMpgInput] = useState("45");
  const [ppLInput, setPpLInput] = useState(initialPencePerLitre ?? "145.9");

  const miles = clampNumber(milesInput, 0, 200000);
  const mpg = clampNumber(mpgInput, 0, 150);
  const penceLitre = clampNumber(ppLInput, 0, 500);

  const claim = calculateMileageDeduction(vehicle, miles, { taxYear });
  const firstTierMiles = Math.min(miles, HMRC_THRESHOLD_MILES);
  const afterTierMiles = Math.max(0, miles - HMRC_THRESHOLD_MILES);

  const hasFuelInputs = mpg > 0 && penceLitre > 0 && miles > 0;
  const fuelCostPence = hasFuelInputs
    ? Math.round(((miles / mpg) * LITRES_PER_GALLON) * penceLitre)
    : null;

  const gapPence = fuelCostPence !== null ? claim.deductionPence - fuelCostPence : null;

  const vehicleLabel = vehicle === "motorbike" ? "motorbike" : vehicle === "van" ? "van" : "car";

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {/* Shared inputs */}
      <div style={panel}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.0625rem",
            fontWeight: 700,
            color: "var(--text-white)",
            marginBottom: "1.1rem",
          }}
        >
          Your trip details
        </h2>
        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          <div>
            <label htmlFor="mc-miles" style={fieldLabel}>
              Business miles
            </label>
            <input
              id="mc-miles"
              type="text"
              inputMode="numeric"
              value={milesInput}
              onChange={(e) => setMilesInput(e.target.value)}
              style={fieldInput}
            />
          </div>
          <div>
            <label htmlFor="mc-vehicle" style={fieldLabel}>
              Vehicle
            </label>
            <select
              id="mc-vehicle"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value as VehicleType)}
              style={fieldInput}
            >
              <option value="car">Car</option>
              <option value="van">Van</option>
              <option value="motorbike">Motorbike</option>
            </select>
          </div>
          <div>
            <label htmlFor="mc-tax-year" style={fieldLabel}>
              Tax year
            </label>
            <select
              id="mc-tax-year"
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value as TaxYear)}
              style={fieldInput}
            >
              <option value="2026-27">2026-27 (current, from 6 Apr 2026)</option>
              <option value="2025-26">2025-26 (and earlier)</option>
            </select>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: "1.25rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}
        aria-live="polite"
      >
        {/* HMRC claim */}
        <div style={panel}>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--amber-400)",
            }}
          >
            What you can claim
          </span>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.5rem",
              fontWeight: 700,
              color: "var(--text-white)",
              lineHeight: 1.1,
              margin: "0.5rem 0 0.35rem",
            }}
          >
            {gbp(claim.deductionPence)}
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "0.75rem" }}>
            HMRC approved mileage allowance for {miles.toLocaleString("en-GB")} business miles
            in a {vehicleLabel}, tax year {taxYear}.
          </p>
          {vehicle === "motorbike" ? (
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {miles.toLocaleString("en-GB")} mi &times; {claim.rateFirst10kPence}p flat rate
            </div>
          ) : (
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", display: "grid", gap: "0.25rem" }}>
              <div>
                First {firstTierMiles.toLocaleString("en-GB")} mi &times; {claim.rateFirst10kPence}p
                {afterTierMiles > 0 ? "" : " (all miles this tax year)"}
              </div>
              {afterTierMiles > 0 && (
                <div>
                  Remaining {afterTierMiles.toLocaleString("en-GB")} mi &times; {claim.rateAfter10kPence}p
                  (over the {HMRC_THRESHOLD_MILES.toLocaleString("en-GB")} mile threshold)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fuel cost */}
        <div style={panel}>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-secondary)",
            }}
          >
            What the fuel actually cost
          </span>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "2.5rem",
              fontWeight: 700,
              color: "var(--text-white)",
              lineHeight: 1.1,
              margin: "0.5rem 0 0.9rem",
            }}
          >
            {fuelCostPence !== null ? gbp(fuelCostPence) : "\u2013"}
          </div>
          <div
            style={{
              display: "grid",
              gap: "0.85rem",
              gridTemplateColumns: "1fr 1fr",
              marginBottom: "0.5rem",
            }}
          >
            <div>
              <label htmlFor="mc-mpg" style={fieldLabel}>
                MPG
              </label>
              <input
                id="mc-mpg"
                type="text"
                inputMode="decimal"
                value={mpgInput}
                onChange={(e) => setMpgInput(e.target.value)}
                aria-describedby="mc-mpg-hint"
                style={fieldInput}
              />
            </div>
            <div>
              <label htmlFor="mc-ppl" style={fieldLabel}>
                Price, pence/litre
              </label>
              <input
                id="mc-ppl"
                type="text"
                inputMode="decimal"
                value={ppLInput}
                onChange={(e) => setPpLInput(e.target.value)}
                style={fieldInput}
              />
            </div>
          </div>
          <p id="mc-mpg-hint" style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
            UK miles per (imperial) gallon, from your logbook or manufacturer figures. Defaults
            are typical UK averages, not live prices, replace them with your own for an exact figure.
          </p>
        </div>
      </div>

      {/* The gap */}
      {gapPence !== null && (
        <div
          style={{
            ...panel,
            background: gapPence >= 0 ? "rgba(16, 185, 129, 0.04)" : "rgba(239, 68, 68, 0.05)",
            border: `1px solid ${gapPence >= 0 ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)"}`,
          }}
          aria-live="polite"
        >
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: gapPence >= 0 ? "var(--emerald-400)" : "#fca5a5",
            }}
          >
            The gap
          </span>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--text-white)",
              margin: "0.5rem 0 0.6rem",
            }}
          >
            {gapPence >= 0 ? "+" : "−"}
            {gbp(Math.abs(gapPence))}
          </div>
          {gapPence >= 0 ? (
            <p style={{ fontSize: "0.9375rem", color: "var(--text-primary)", lineHeight: 1.7 }}>
              Your claim covers the fuel cost with {gbp(gapPence)} left over. That is not
              profit, the HMRC rate is deliberately set above pure fuel cost because it is also
              meant to cover insurance, servicing, tyres, road tax and general wear on the vehicle
              (see how the rate is built up below).
            </p>
          ) : (
            <p style={{ fontSize: "0.9375rem", color: "var(--text-primary)", lineHeight: 1.7 }}>
              On these figures, fuel alone cost {gbp(Math.abs(gapPence))} more than the
              approved mileage rate covers. That usually means a low MPG figure or a high fuel
              price relative to typical UK averages, worth double-checking both before drawing
              conclusions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
