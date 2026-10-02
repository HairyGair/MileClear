"use client";

import { useState, type KeyboardEvent } from "react";
import { compactAxis, labelEvery, niceTicks, roundedTopBar, type ChartDatum } from "./chartUtils";
import { formatNumber } from "./format";
import { useMeasuredWidth } from "./useMeasure";

interface BarChartProps {
  data: ChartDatum[];
  /** What the chart shows, for screen readers and the hidden data table. */
  label: string;
  height?: number;
  formatValue?: (n: number) => string;
  /** Name of the measure in the tooltip, e.g. "sign-ups". */
  unit?: string;
  /** Index of a bar to draw in a quieter shade, e.g. today's partial day. */
  partialIndex?: number;
}

const M = { top: 10, right: 6, bottom: 26, left: 34 };

/** Vertical bars over time or categories. One series, amber. Hover or use the
 *  arrow keys to read a bar. */
export function BarChart({ data, label, height = 220, formatValue = formatNumber, unit, partialIndex }: BarChartProps) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = Math.max(10, height - M.top - M.bottom);
  const slot = innerW / Math.max(1, data.length);
  const gap = Math.min(8, Math.max(2, slot * 0.22));
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
          const yy = y(d.value);
          const h = M.top + innerH - yy;
          const cls = `adm-chart__bar${i === active ? " adm-chart__bar--active" : ""}${i === partialIndex ? " adm-chart__bar--partial" : ""}`;
          return (
            <g key={i}>
              {d.value > 0 && <path d={roundedTopBar(x, yy, barW, Math.max(h, 1.5))} className={cls} />}
              {/* Hit target: the whole column, taller and wider than the bar. */}
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
      {a && (
        <div className="adm-chart__tip" style={{ left: Math.min(Math.max(tipX, 70), width - 70), top: Math.max(0, y(a.value) - 8) }} role="status">
          <span className="adm-chart__tip-label">{a.fullLabel ?? a.label}</span>
          <span className="adm-chart__tip-value">
            {formatValue(a.value)}
            {unit ? ` ${unit}` : ""}
            {active === partialIndex ? " so far" : ""}
          </span>
        </div>
      )}
      <table className="adm-sr">
        <caption>{label}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.fullLabel ?? d.label}</th>
              <td>{formatValue(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
