import s from "./charts.module.css";

export interface BarListItem {
  name: string;
  value: number;
  /** Text shown on the right, e.g. "£12.40". */
  display: string;
}

/** Ranked breakdown. Bars in amber-dim with the value in amber text, never a pie. */
export function BarList({ items, label }: { items: BarListItem[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={s.barList} aria-label={label}>
      {items.map((i) => (
        <li key={i.name} className={s.barRow}>
          <span className={s.barFill} style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} aria-hidden="true" />
          <span className={s.barName}>{i.name}</span>
          <span className={s.barValue}>{i.display}</span>
        </li>
      ))}
    </ul>
  );
}
