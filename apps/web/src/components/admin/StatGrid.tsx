import type { ReactNode } from "react";
import Link from "next/link";
import type { AdminTone } from "./types";
import { formatNumber } from "./format";

interface StatProps {
  label: string;
  value: string | number;
  note?: string;
  tone?: AdminTone;
  href?: string;
  title?: string;
}

// One stat tile. Numbers are always shown in full with thousands separators;
// the day the fleet passed a thousand users the old tile read "1.0K".
export function Stat({ label, value, note, tone = "neutral", href, title }: StatProps) {
  const shown = typeof value === "number" ? formatNumber(value) : value;
  const body = (
    <>
      <p className="admin-stat__label">{label}</p>
      <p className={`admin-stat__value admin-stat__value--${tone}`}>{shown}</p>
      {note && <p className="admin-stat__note">{note}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="admin-stat admin-stat--link" title={title}>
        {body}
      </Link>
    );
  }
  return (
    <div className="admin-stat" title={title}>
      {body}
    </div>
  );
}

interface StatGridProps {
  children: ReactNode;
  /** Minimum tile width in px; the grid wraps to fit. */
  min?: number;
}

export function StatGrid({ children, min = 160 }: StatGridProps) {
  return (
    <div className="admin-stat-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>
      {children}
    </div>
  );
}
