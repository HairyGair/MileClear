"use client";

import type { RangeKey } from "./types";

const LABELS: Record<RangeKey, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days", all: "All time" };
const SHORT: Record<RangeKey, string> = { "7d": "7d", "30d": "30d", "90d": "90d", all: "All" };

interface DateRangeProps {
  value: RangeKey;
  onChange: (value: RangeKey) => void;
  /** Which ranges to offer. Leave out any the page's data cannot answer. */
  options?: RangeKey[];
  label?: string;
}

/** Segmented 7d / 30d / 90d / All control. Sits in a PageHeader or Panel. */
export function DateRange({ value, onChange, options = ["7d", "30d", "90d", "all"], label = "Date range" }: DateRangeProps) {
  return (
    <div className="adm-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          aria-label={LABELS[o]}
          title={LABELS[o]}
          className={`adm-seg__opt${o === value ? " adm-seg__opt--active" : ""}`}
          onClick={() => onChange(o)}
        >
          {SHORT[o]}
        </button>
      ))}
    </div>
  );
}
