"use client";

import { useState, type KeyboardEvent } from "react";
import { compactAxis, labelEvery, niceTicks, roundedTopBar } from "./chartUtils";
import { formatNumber } from "./format";
import { useMeasuredWidth } from "./useMeasure";

export interface StackedSeries {
  key: string;
  label: string;
  /** A colour from STACK_COLOURS (in order), or STACK_OTHER / STACK_NONE for
   *  the catch-all groups. Never a status colour. */
  color: string;
}

export interface StackedDatum {
  /** Axis label, e.g. "28 Sep". */
  label: string;
  /** Longer label for the tooltip. */
  fullLabel?: string;
  /** One value per series, in the same order as `series`. */
  values: number[];
}

/** Categorical colours for a stack, stepped for the dark admin surface and
 *  checked for colour-blind separation between neighbours. Assign them in
 *  this order and never cycle: past six series, fold the rest into "Other". */
export const STACK_COLOURS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"] as const;
/** "Everything else". */
export const STACK_OTHER = "#64748b";
/** "Not known" (quieter than Other). */
export const STACK_NONE = "#3b475c";

interface StackedBarChartProps {
  data: StackedDatum[];
  series: StackedSeries[];
  /** What the chart shows, for screen readers and the hidden data table. */
  label: string;
  height?: number;
  formatValue?: (n: number) => string;
  /** Name of the measure in the tooltip, e.g. "sign-ups". */
  unit?: string;
  /** Index of a bar that is still filling in (today, this week). */
  partialIndex?: number;
}

const M = { top: 10, right: 6, bottom: 26, left: 34 };
const SEG_GAP = 1.5;

/** Vertical stacked bars over time: a total split into a few named groups.
 *  Six series at most plus catch-alls. A legend is always drawn, and the
 *  tooltip lists every group, so colour is never the only way to read it. */
export function StackedBarChart({ data, series, label, height = 240, formatValue = formatNumber, unit, partialIndex }: StackedBarChartProps) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const totals = data.map((d) => d.values.reduce((s, v) => s + v, 0));
  const ticks = niceTicks(Math.max(0, ...totals));
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = Math.max(10, height - M.top - M.bottom);
  const slot = innerW / Math.max(1, data.length);
  const gap = Math.min(8, Math.max(1, slot * 0.22));
  const barW = Math.max(1, slot - gap);
  const every = labelEvery(data.length, innerW);
  const y = (v: number) => M.top + innerH * (1 - v / top);

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!data.length) return;
    if (e.key === "ArrowRight") setActive((a) => (a === null ? 0 : Math.min(data.length - 1, a + 1)));
    else if (e.key === "ArrowLeft") setActive((a) => (a === null ? data.length - 1 : Math.max(0, a - 1)));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const a = active !== null ? data[active] : null;
  const tipX = active !== null ? M.left + active * slot + slot / 2 : 0;

  return (
    <div className="adm-chart-wrap">
      <div className="adm-legend" aria-hidden="true">
        {series.map((s) => (
          <span key={s.key} className="adm-legend__item">
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block" }} />
            {s.label}
          </span>
        ))}
      </div>
      <div
        ref={ref}
        className="adm-chart"
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use the left and right arrow keys to read each bar.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? "adm-chart__base" : "adm-chart__grid"} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="adm-chart__tick">
                {compactAxis(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = M.left + i * slot + gap / 2;
            const dim = active !== null && active !== i;
            const partial = i === partialIndex;
            // Segments from the baseline up; the topmost gets the rounded end.
            const lastNonZero = d.values.reduce((last, v, k) => (v > 0 ? k : last), -1);
            let acc = 0;
            return (
              <g key={i} opacity={dim ? 0.55 : partial ? 0.6 : 1} style={{ transition: "opacity 0.12s" }}>
                {d.values.map((v, k) => {
                  if (v <= 0) return null;
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  // Leave a thin surface gap between segments, never below 1px of colour.
                  const h = Math.max(1, y0 - y1 - (k === lastNonZero ? 0 : SEG_GAP));
                  const yy = y0 - h;
                  return k === lastNonZero ? (
                    <path key={k} d={roundedTopBar(x, yy, barW, h, 3)} fill={series[k]?.color} />
                  ) : (
                    <rect key={k} x={x} y={yy} width={barW} height={h} fill={series[k]?.color} />
                  );
                })}
                <rect x={M.left + i * slot} y={M.top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setActive(i)} />
                {i % every === 0 && (
                  <text x={M.left + i * slot + slot / 2} y={height - 8} textAnchor="middle" className="adm-chart__tick">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {a && active !== null && (
          <div
            className="adm-chart__tip"
            style={{ left: Math.min(Math.max(tipX, 95), width - 95), top: Math.max(0, y(totals[active]) - 8) }}
            role="status"
          >
            <span className="adm-chart__tip-label">{a.fullLabel ?? a.label}</span>
            <span className="adm-chart__tip-value">
              {formatValue(totals[active])}
              {unit ? ` ${unit}` : ""}
              {active === partialIndex ? " so far" : ""}
            </span>
            {series
              .map((s, k) => ({ s, v: a.values[k] ?? 0 }))
              .filter((r) => r.v > 0)
              .sort((p, q) => q.v - p.v)
              .map(({ s, v }) => (
                <span key={s.key} className="adm-chart__tip-compare" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flex: "none" }} />
                  <span style={{ flex: 1 }}>{s.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--adm-text-strong)" }}>{formatValue(v)}</span>
                </span>
              ))}
          </div>
        )}
        <table className="adm-sr">
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {series.map((s) => (
                <th key={s.key} scope="col">{s.label}</th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}>
                <th scope="row">{d.fullLabel ?? d.label}</th>
                {series.map((s, k) => (
                  <td key={s.key}>{formatValue(d.values[k] ?? 0)}</td>
                ))}
                <td>{formatValue(totals[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
