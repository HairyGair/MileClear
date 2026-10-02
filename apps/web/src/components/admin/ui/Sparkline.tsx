import type { Tone } from "./types";

interface SparklineProps {
  values: number[];
  /** Drawing size; the SVG scales to its container width. */
  width?: number;
  height?: number;
  tone?: Tone;
  /** Soft fill under the line. */
  area?: boolean;
  /** Describes the trend for screen readers, e.g. "Sign-ups, last 14 days". */
  label?: string;
}

/** A tiny trend line with no axes, for KPI cards and table cells. */
export function Sparkline({ values, width = 120, height = 32, tone = "accent", area = true, label }: SparklineProps) {
  if (values.length < 2) return null;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, pad + (height - pad * 2) * (1 - (v - min) / span)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fill = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  return (
    <svg
      className={`adm-spark adm-spark--${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {area && <path d={fill} className="adm-spark__area" />}
      <path d={line} className="adm-spark__line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
