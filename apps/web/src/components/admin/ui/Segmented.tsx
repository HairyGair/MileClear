"use client";

import type { ReactNode } from "react";

export interface SegmentedOption<V extends string | number> {
  value: V;
  label: ReactNode;
  /** Full name for screen readers and the tooltip when `label` is short. */
  title?: string;
}

interface SegmentedProps<V extends string | number> {
  value: V;
  onChange: (value: V) => void;
  options: SegmentedOption<V>[];
  /** Names the group for screen readers. */
  label: string;
  /** Show the label above the control as a small caption. */
  showLabel?: boolean;
}

/** A segmented single-choice control with any options (the DateRange look,
 *  for filters that are not a 7d / 30d / 90d / All range). Wraps onto a
 *  second line at phone width instead of pushing the page sideways. */
export function Segmented<V extends string | number>({ value, onChange, options, label, showLabel }: SegmentedProps<V>) {
  const control = (
    <div className="adm-seg" role="radiogroup" aria-label={label} style={{ flexWrap: "wrap", maxWidth: "100%" }}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.title}
          title={o.title}
          className={`adm-seg__opt${o.value === value ? " adm-seg__opt--active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
  if (!showLabel) return control;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s1)", minWidth: 0 }}>
      <span style={{ fontSize: "0.72rem", color: "var(--adm-text-3)" }}>{label}</span>
      {control}
    </div>
  );
}
