"use client";

import { useState, type KeyboardEvent } from "react";
import { compactAxis, labelEvery, niceTicks, roundedTopBar, type ChartDatum } from "@/lib/charts/chartUtils";
import { useMeasuredWidth } from "@/lib/charts/useMeasure";
import { useMediaQuery } from "@/lib/dashboard/useMediaQuery";
import s from "./charts.module.css";

export interface BarChartProps {
  data: ChartDatum[];
  /** What the chart shows. Used for screen readers and the hidden data table. */
  label: string;
  /** Default 220 on desktop, 180 on phones. */
  height?: number;
  formatValue?: (n: number) => string;
  /** Name of the measure in the tooltip, e.g. "mi". */
  unit?: string;
  /** Index of a bar drawn at 40% (today, a partial period). */
  partialIndex?: number;
  /** Index of a bar to call out; the others dim a little. */
  highlightIndex?: number;
}

const M = { top: 10, right: 6, bottom: 26, left: 38 };
const plain = (n: number) => String(Math.round(n * 100) / 100);

/** Vertical bars, one series, amber. Arrow keys read each bar. Never renders without data: callers show an EmptyState instead. */
export function BarChart({ data, label, height, formatValue = plain, unit, partialIndex, highlightIndex }: BarChartProps) {
  const wide = useMediaQuery("(min-width: 768px)");
  const h = height ?? (wide ? 220 : 180);
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(320);
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max, 4, false);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = Math.max(10, h - M.top - M.bottom);
  const slot = innerW / Math.max(1, data.length);
  const gap = Math.min(10, Math.max(2, slot * 0.4));
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
      className={s.chart}
      style={{ height: h }}
      tabIndex={0}
      role="group"
      aria-label={`${label}. Use the left and right arrow keys to read each bar.`}
      data-testid="bar-chart"
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      onMouseLeave={() => setActive(null)}
    >
      <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} aria-hidden="true">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? s.base : s.grid} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className={s.tick}>
              {compactAxis(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = M.left + i * slot + gap / 2;
          const yy = y(d.value);
          const bh = M.top + innerH - yy;
          const dim = highlightIndex !== undefined && highlightIndex !== i;
          const cls = [s.bar, i === active ? s.active : "", i === partialIndex ? s.partial : "", dim ? s.dim : ""].filter(Boolean).join(" ");
          return (
            <g key={i}>
              {d.value > 0 && <path d={roundedTopBar(x, yy, barW, Math.max(bh, 1.5))} className={cls} />}
              <rect x={M.left + i * slot} y={M.top} width={slot} height={innerH} fill="transparent" onMouseEnter={() => setActive(i)} />
              {i % every === 0 && (
                <text x={M.left + i * slot + slot / 2} y={h - 8} textAnchor="middle" className={s.tick}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {a && (
        <div className={s.tip} style={{ left: Math.min(Math.max(tipX, 70), width - 70), top: Math.max(0, y(a.value) - 8) }} role="status">
          <span className={s.tipLabel}>{a.fullLabel ?? a.label}</span>
          <span className={s.tipValue}>
            {formatValue(a.value)}
            {unit ? ` ${unit}` : ""}
            {active === partialIndex ? " so far" : ""}
          </span>
        </div>
      )}
      <table className={s.srTable}>
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
