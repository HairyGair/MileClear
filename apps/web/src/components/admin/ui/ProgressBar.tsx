import type { ReactNode } from "react";
import type { Tone } from "./types";

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: ReactNode;
  /** Text on the right, e.g. "3 / 5" or "42%". Defaults to the percentage. */
  valueLabel?: ReactNode;
  tone?: Tone;
  size?: "sm" | "md";
}

/** A share of a whole, or progress towards a target. */
export function ProgressBar({ value, max = 100, label, valueLabel, tone = "accent", size = "md" }: ProgressBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const shown = valueLabel ?? `${Math.round(pct)}%`;
  return (
    <div className={`adm-progress adm-progress--${size}`}>
      {(label || shown) && (
        <div className="adm-progress__row">
          {label && <span className="adm-progress__label">{label}</span>}
          <span className="adm-progress__value">{shown}</span>
        </div>
      )}
      <div
        className="adm-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={typeof label === "string" ? label : undefined}
      >
        <div className={`adm-progress__fill adm-progress__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
