import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * A headline number with a label (and an optional sub line). White, never
 * amber. `estimated` adds a dashed "est." chip.
 *
 *   <Figure value="1,284.6 mi" label="Business miles this tax year" sub="About £706.30 at HMRC mileage rates" size="xl" />
 */
export function Figure({
  value,
  label,
  sub,
  size = "md",
  estimated,
}: {
  value: string;
  label: string;
  sub?: string;
  size?: "md" | "lg" | "xl";
  estimated?: boolean;
}) {
  return (
    <div className={cx("mc-figure", `mc-figure--${size}`)}>
      <p className="mc-figure__label">{label}</p>
      <p className="mc-figure__value mc-num">
        {value}
        {estimated && <span className="mc-figure__est">est.</span>}
      </p>
      {sub && <p className="mc-figure__sub">{sub}</p>}
    </div>
  );
}

/**
 * KPI tile. Missing data shows "No data yet", never 0.
 *
 *   <StatTile label="This week" value="142.8" unit="mi" href="/dashboard/trips" />
 */
export function StatTile({
  label,
  value,
  unit,
  href,
  note,
}: {
  label: string;
  value: string | null;
  unit?: string;
  href?: string;
  note?: ReactNode;
}) {
  const body = (
    <>
      <p className="mc-stat__label">{label}</p>
      {value === null ? (
        <p className="mc-stat__none">No data yet</p>
      ) : (
        <p className="mc-stat__value mc-num">
          {value}
          {unit && <span className="mc-stat__unit"> {unit}</span>}
        </p>
      )}
      {note && <p className="mc-stat__note">{note}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="mc-card mc-stat mc-card--link">
        {body}
      </Link>
    );
  }
  return <div className="mc-card mc-stat">{body}</div>;
}
