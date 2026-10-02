import type { ReactNode } from "react";
import { formatNumber } from "./format";

export interface BarListItem {
  key: string;
  label: ReactNode;
  value: number;
  /** Text after the number, e.g. "34%". */
  note?: ReactNode;
}

interface BarListProps {
  items: BarListItem[];
  /** Bars are scaled to this; defaults to the largest value. */
  max?: number;
  formatValue?: (n: number) => string;
  /** Show at most this many; the rest are summed into one line. */
  limit?: number;
  label?: string;
}

/** A ranked list with a bar behind each row: sources, regions, platforms.
 *  Easier to read than a pie and works at phone width. */
export function BarList({ items, max, formatValue = formatNumber, limit, label }: BarListProps) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  let shown = sorted;
  if (limit && sorted.length > limit) {
    const rest = sorted.slice(limit);
    shown = [
      ...sorted.slice(0, limit),
      { key: "__rest", label: `${rest.length} more`, value: rest.reduce((s, r) => s + r.value, 0) },
    ];
  }
  const top = max ?? Math.max(1, ...shown.map((i) => i.value));
  return (
    <ul className="adm-barlist" aria-label={label}>
      {shown.map((i) => (
        <li key={i.key} className="adm-barlist__row">
          <span className="adm-barlist__bar" style={{ width: `${Math.max(1.5, (i.value / top) * 100)}%` }} aria-hidden="true" />
          <span className="adm-barlist__label">{i.label}</span>
          <span className="adm-barlist__value">
            {formatValue(i.value)}
            {i.note && <span className="adm-barlist__note">{i.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
