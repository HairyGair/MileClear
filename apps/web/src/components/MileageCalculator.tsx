"use client";

import { useState } from "react";
import { HMRC_RATES_BY_TAX_YEAR, HMRC_THRESHOLD_MILES } from "@mileclear/shared";

type VehicleType = "car" | "motorbike";

// Returns the AMAP deduction in pence for a given business mileage + tax year.
function deductionPence(miles: number, vehicle: VehicleType, taxYear: "2025-26" | "2026-27"): number {
  const rates = HMRC_RATES_BY_TAX_YEAR[taxYear];
  if (vehicle === "motorbike") return Math.round(miles * rates.motorbike.flat);
  const first = Math.min(miles, HMRC_THRESHOLD_MILES);
  const after = Math.max(0, miles - HMRC_THRESHOLD_MILES);
  return Math.round(first * rates.car.first10000 + after * rates.car.after10000);
}

function gbp(pence: number): string {
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  padding: "1.5rem",
};

export default function MileageCalculator() {
  const [milesInput, setMilesInput] = useState("8000");
  const [vehicle, setVehicle] = useState<VehicleType>("car");

  const miles = Math.max(0, Math.min(200000, parseInt(milesInput.replace(/[^0-9]/g, ""), 10) || 0));
  const now = deductionPence(miles, vehicle, "2026-27");
  const prev = deductionPence(miles, vehicle, "2025-26");
  const diff = now - prev;

  const r = HMRC_RATES_BY_TAX_YEAR["2026-27"];
  const first = Math.min(miles, HMRC_THRESHOLD_MILES);
  const after = Math.max(0, miles - HMRC_THRESHOLD_MILES);

  const breakdown =
    vehicle === "motorbike"
      ? `${miles.toLocaleString("en-GB")} mi × ${r.motorbike.flat}p`
      : after > 0
        ? `${first.toLocaleString("en-GB")} mi × ${r.car.first10000}p + ${after.toLocaleString("en-GB")} mi × ${r.car.after10000}p`
        : `${first.toLocaleString("en-GB")} mi × ${r.car.first10000}p`;

  return (
    <div style={card}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <label style={{ flex: "1 1 200px", display: "block" }}>
          <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Business miles this tax year
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={milesInput}
            onChange={(e) => setMilesInput(e.target.value)}
            aria-label="Business miles this tax year"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "0.75rem 1rem",
              fontSize: "1.25rem",
              fontFamily: "var(--font-display)",
              color: "var(--text-white)",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
            }}
          />
        </label>
        <label style={{ flex: "1 1 200px", display: "block" }}>
          <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Vehicle
          </span>
          <select
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value as VehicleType)}
            aria-label="Vehicle type"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "0.75rem 1rem",
              fontSize: "1.25rem",
              fontFamily: "var(--font-display)",
              color: "var(--text-white)",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
            }}
          >
            <option value="car">Car or van</option>
            <option value="motorbike">Motorbike</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ flex: "1 1 220px", background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.22)", borderRadius: 12, padding: "1.1rem 1.25rem" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--amber-400)", textTransform: "uppercase", letterSpacing: "0.05em" }}>2026-27 (current, 55p)</span>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 700, color: "var(--text-white)", lineHeight: 1.1, margin: "0.3rem 0 0.2rem" }}>
            {gbp(now)}
          </div>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{breakdown}</span>
        </div>
        <div style={{ flex: "1 1 220px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "1.1rem 1.25rem" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>2025-26 (old, 45p)</span>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "2rem", fontWeight: 700, color: "var(--text-secondary)", lineHeight: 1.1, margin: "0.3rem 0 0.2rem" }}>
            {gbp(prev)}
          </div>
          {diff > 0 && (
            <span style={{ fontSize: "0.85rem", color: "#34d399", fontWeight: 600 }}>
              +{gbp(diff)} more under the new rate
            </span>
          )}
        </div>
      </div>

      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "1.25rem 0 0", lineHeight: 1.5 }}>
        Estimate only. The 55p first-tier rate applies to business miles driven from 6 April 2026 (tax year 2026-27);
        miles before that use 45p. MileClear applies the correct rate to every trip automatically by its date.
      </p>
    </div>
  );
}
