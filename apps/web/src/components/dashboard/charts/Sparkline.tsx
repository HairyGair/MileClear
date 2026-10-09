import s from "./charts.module.css";

/** A 24px amber line with no axes and no fill, for the foot of a card. */
export function Sparkline({ values, label, width = 120 }: { values: number[]; label?: string; width?: number }) {
  if (values.length < 2) return null;
  const height = 24;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);
  const d = values
    .map((v, i) => `${i ? "L" : "M"}${(pad + i * step).toFixed(1)},${(pad + (height - pad * 2) * (1 - (v - min) / span)).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      className={s.spark}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={d} className={s.sparkLine} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
