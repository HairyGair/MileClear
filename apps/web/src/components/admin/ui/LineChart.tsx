"use client";

import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { compactAxis, labelEvery, niceTicks, type ChartDatum } from "./chartUtils";
import { formatNumber } from "./format";
import { useMeasuredWidth } from "./useMeasure";

interface LineChartProps {
  data: ChartDatum[];
  label: string;
  /** Name of the main series, shown in the legend when there is a comparison. */
  seriesLabel?: string;
  /** Optional second series drawn as a grey dashed line (same length as data),
   *  e.g. the previous period. */
  compare?: number[];
  compareLabel?: string;
  height?: number;
  formatValue?: (n: number) => string;
  /** Allow fractional axis ticks (rates, percentages). */
  decimals?: boolean;
}

const M = { top: 12, right: 10, bottom: 26, left: 38 };

/** A trend over time. One amber series, optionally against a grey dashed
 *  comparison. Hover or use the arrow keys for a crosshair readout. */
export function LineChart({
  data,
  label,
  seriesLabel = "This period",
  compare,
  compareLabel = "Previous period",
  height = 220,
  formatValue = formatNumber,
  decimals = false,
}: LineChartProps) {
  const { ref, width } = useMeasuredWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradId = `adm-fill-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const all = [...data.map((d) => d.value), ...(compare ?? [])];
  const ticks = niceTicks(Math.max(0, ...all), 4, !decimals);
  const top = ticks[ticks.length - 1] || 1;
  const innerW = Math.max(10, width - M.left - M.right);
  const innerH = Math.max(10, height - M.top - M.bottom);
  const n = data.length;
  const x = (i: number) => M.left + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (v: number) => M.top + innerH * (1 - v / top);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const main = path(data.map((d) => d.value));
  const area = n > 1 ? `${main} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z` : "";
  const every = labelEvery(n, innerW, 60);

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement ?? e.currentTarget).getBoundingClientRect();
    const px = e.clientX - box.left - M.left;
    const i = n <= 1 ? 0 : Math.round((px / innerW) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };
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
    <div className="adm-chart-wrap">
      {compare && (
        <div className="adm-legend" aria-hidden="true">
          <span className="adm-legend__item"><span className="adm-legend__swatch adm-legend__swatch--accent" />{seriesLabel}</span>
          <span className="adm-legend__item"><span className="adm-legend__swatch adm-legend__swatch--compare" />{compareLabel}</span>
        </div>
      )}
      <div
        ref={ref}
        className="adm-chart"
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${label}. Use the left and right arrow keys to read each point.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onMouseLeave={() => setActive(null)}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--adm-accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--adm-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? "adm-chart__base" : "adm-chart__grid"} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="adm-chart__tick">
                {compactAxis(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % every === 0 ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="adm-chart__tick">
                {d.label}
              </text>
            ) : null
          )}
          {area && <path d={area} fill={`url(#${gradId})`} />}
          {compare && compare.length === n && <path d={path(compare)} className="adm-chart__line adm-chart__line--compare" />}
          <path d={main} className="adm-chart__line" />
          {active !== null && (
            <>
              <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + innerH} className="adm-chart__cross" />
              {compare && compare.length === n && <circle cx={x(active)} cy={y(compare[active])} r={4} className="adm-chart__dot adm-chart__dot--compare" />}
              <circle cx={x(active)} cy={y(data[active].value)} r={4.5} className="adm-chart__dot" />
            </>
          )}
          <rect x={M.left} y={M.top} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} />
        </svg>
        {a && active !== null && (
          <div className="adm-chart__tip" style={{ left: Math.min(Math.max(x(active), 80), width - 80), top: Math.max(0, y(a.value) - 12) }} role="status">
            <span className="adm-chart__tip-label">{a.fullLabel ?? a.label}</span>
            <span className="adm-chart__tip-value">{formatValue(a.value)}</span>
            {compare && compare.length === n && (
              <span className="adm-chart__tip-compare">{compareLabel}: {formatValue(compare[active])}</span>
            )}
          </div>
        )}
        <table className="adm-sr">
          <caption>{label}</caption>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}>
                <th scope="row">{d.fullLabel ?? d.label}</th>
                <td>{formatValue(d.value)}</td>
                {compare && <td>{formatValue(compare[i] ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
