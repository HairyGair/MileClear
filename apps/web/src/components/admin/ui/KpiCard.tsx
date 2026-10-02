import type { ReactNode } from "react";
import Link from "next/link";
import { AdminIcon } from "./icons";
import { Sparkline } from "./Sparkline";
import { LoadingSkeleton } from "./States";
import { formatNumber, percentChange } from "./format";
import type { Tone } from "./types";

export interface KpiDelta {
  current: number;
  previous: number;
  /** What the comparison is against, e.g. "vs previous 7 days". */
  label?: string;
  /** Which way is good. Most counts go "up"; churn and backlogs go "down". */
  goodDirection?: "up" | "down";
}

interface KpiCardProps {
  label: string;
  value: ReactNode;
  /** One short line under the value. */
  hint?: ReactNode;
  delta?: KpiDelta;
  sparkline?: number[];
  sparklineLabel?: string;
  /** Colours the value. Leave neutral unless the number itself is a status. */
  tone?: Tone;
  href?: string;
  title?: string;
  loading?: boolean;
  /** Shown instead of the value when this card's data failed. */
  error?: string | null;
}

function Delta({ current, previous, label, goodDirection = "up" }: KpiDelta) {
  const diff = current - previous;
  const pct = percentChange(current, previous);
  const dir = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  const tone = dir === "flat" ? "neutral" : dir === goodDirection ? "good" : "bad";
  const amount = pct === null ? `${diff > 0 ? "+" : ""}${formatNumber(diff)}` : `${Math.abs(Math.round(pct))}%`;
  const spoken = dir === "flat" ? "No change" : `${dir === "up" ? "Up" : "Down"} ${amount}`;
  return (
    <span className={`adm-delta adm-delta--${tone}`} title={`${formatNumber(previous)} before`}>
      {dir !== "flat" && <AdminIcon name={dir === "up" ? "arrowUp" : "arrowDown"} size={12} strokeWidth={2.25} />}
      <span className="adm-sr">{spoken}</span>
      <span aria-hidden="true">{dir === "flat" ? "No change" : amount}</span>
      {label && <span className="adm-delta__label">{label}</span>}
    </span>
  );
}

/** One headline number. Use in a row of three to six at the top of a page. */
export function KpiCard({ label, value, hint, delta, sparkline, sparklineLabel, tone = "neutral", href, title, loading, error }: KpiCardProps) {
  let body: ReactNode;
  if (loading) body = <LoadingSkeleton variant="kpi" />;
  else
    body = (
      <>
        <p className="adm-kpi__label">{label}</p>
        {error ? (
          <p className="adm-kpi__error" title={error}>Couldn&apos;t load</p>
        ) : (
          <p className={`adm-kpi__value adm-kpi__value--${tone}`}>{typeof value === "number" ? formatNumber(value) : value}</p>
        )}
        {!error && delta && <Delta {...delta} />}
        {!error && hint && <p className="adm-kpi__hint">{hint}</p>}
        {!error && sparkline && sparkline.length > 1 && (
          <div className="adm-kpi__spark">
            <Sparkline values={sparkline} label={sparklineLabel} />
          </div>
        )}
      </>
    );
  if (href && !loading) {
    return (
      <Link href={href} className="adm-kpi adm-kpi--link" title={title}>
        {body}
      </Link>
    );
  }
  return (
    <div className="adm-kpi" title={title} aria-busy={loading || undefined}>
      {body}
    </div>
  );
}
