"use client";

import { useState, type KeyboardEvent } from "react";
import { compactAxis, labelEvery, niceTicks, type ChartDatum } from "@/lib/charts/chartUtils";
import { useMeasuredWidth } from "@/lib/charts/useMeasure";
import { useMediaQuery } from "@/lib/dashboard/useMediaQuery";
import s from "./charts.module.css";

export interface LineChartProps {
  data: ChartDatum[];
  label: string;
  height?: number;
  formatValue?: (n: number) => string;
  unit?: string;
  /** Last period, drawn as a 1.5px dashed grey line. Same length as `data`. */
  compare?: number[];
}

const M = { top: 12, right: 12, bottom: 26, left: 38 };
const plain = (n: number) => String(Math.round(n * 100) / 100);

/** One amber line over time. Arrow keys step through points. */
export function LineChart({ data, label, height, formatValue = plain, unit, compare }: LineChartProps) {
  const wide = useMediaQuery("(min-width: 768px)");
  const h = height ?? (wide ? 220 : 180);
  const { ref, width } = useMeasuredWidth<HTMLDivElement>(320);
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(0, ...data.map((d) => d.value), ...(compare ?? []));
  const ticks = niceTicks(max, 4, false);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = Math.max(10, h - M.top - M.bottom);
  const n = data.length;
  const x = (i: number) => M.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => M.top + innerH * (1 - v / top);
  const every = labelEvery(n, innerW);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return;
    if (e.key === "ArrowRight") setActive((a) => (a === null ? 0 : Math.min(n - 1, a + 1)));
    else if (e.key === "ArrowLeft") setActive((a) => (a === null ? n - 1 : Math.max(0, a - 1)));
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };
  const a = active !== null ? data[active] : null;

  return (
    <div
      ref={ref}
      className={s.chart}
      style={{ height: h }}
      tabIndex={0}
      role="group"
      aria-label={`${label}. Use the left and right arrow keys to read each point.`}
      data-testid="line-chart"
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
        {compare && compare.length > 1 && <path d={path(compare)} className={s.lineCompare} />}
        {n > 0 && <path d={path(data.map((d) => d.value))} className={s.line} />}
        {data.map((d, i) => (
          <g key={i}>
            <rect
              x={x(i) - (innerW / Math.max(1, n)) / 2}
              y={M.top}
              width={innerW / Math.max(1, n)}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
            />
            {i % every === 0 && (
              <text x={x(i)} y={h - 8} textAnchor="middle" className={s.tick}>
                {d.label}
              </text>
            )}
          </g>
        ))}
        {active !== null && a && <circle cx={x(active)} cy={y(a.value)} r={5} className={s.dot} />}
        {n === 1 && <circle cx={x(0)} cy={y(data[0].value)} r={4} className={s.dot} />}
      </svg>
      {a && active !== null && (
        <div className={s.tip} style={{ left: Math.min(Math.max(x(active), 70), width - 70), top: Math.max(0, y(a.value) - 12) }} role="status">
          <span className={s.tipLabel}>{a.fullLabel ?? a.label}</span>
          <span className={s.tipValue}>
            {formatValue(a.value)}
            {unit ? ` ${unit}` : ""}
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
