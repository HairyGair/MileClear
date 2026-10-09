"use client";

import type { ReactNode } from "react";
import { useMediaQuery } from "../../../lib/dashboard/useMediaQuery";
import { Skeleton } from "./States";
import { cx } from "./cx";

export interface Column<R> {
  key: string;
  label: string;
  align?: "left" | "right";
  render?: (r: R) => ReactNode;
  /** Hide this column below this viewport width. */
  hideBelow?: 768 | 1024;
}

/**
 * A real table from 768px up. Below that each row becomes a two-line list
 * row: the first column on the left, the last column as the figure on the
 * right. Pass `mobileRow` to draw the phone row yourself.
 *
 *   <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => router.push(...)} />
 */
export function DataTable<R>({
  columns,
  rows,
  rowKey,
  onRowClick,
  mobileRow,
  empty,
  loading,
}: {
  columns: Column<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  onRowClick?: (r: R) => void;
  mobileRow?: (r: R) => ReactNode;
  empty?: ReactNode;
  loading?: boolean;
}) {
  const wide = useMediaQuery("(min-width: 768px)");

  if (loading) return <Skeleton variant="row" count={6} />;
  if (rows.length === 0) return <>{empty ?? null}</>;

  const cell = (c: Column<R>, r: R): ReactNode =>
    c.render ? c.render(r) : ((r as Record<string, unknown>)[c.key] as ReactNode);

  if (!wide) {
    const first = columns[0];
    const rest = columns.slice(1, -1);
    const last = columns.length > 1 ? columns[columns.length - 1] : null;
    return (
      <div className="mc-card mc-card--flush mc-list">
        {rows.map((r) => {
          const inner = mobileRow ? (
            mobileRow(r)
          ) : (
            <>
              <span className="mc-list__main">
                <span className="mc-list__primary">{cell(first, r)}</span>
                {rest.length > 0 && (
                  <span className="mc-list__secondary">
                    {rest.map((c, i) => (
                      <span key={c.key}>
                        {i > 0 && " · "}
                        {cell(c, r)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              {last && <span className="mc-list__figure mc-num">{cell(last, r)}</span>}
            </>
          );
          return onRowClick ? (
            <button key={rowKey(r)} type="button" className="mc-list__row mc-list__row--click" onClick={() => onRowClick(r)}>
              {inner}
            </button>
          ) : (
            <div key={rowKey(r)} className="mc-list__row">
              {inner}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mc-card mc-card--flush mc-tablewrap">
      <table className="mc-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx(c.align === "right" && "is-right", c.hideBelow && `mc-hide-lt-${c.hideBelow}`)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className={cx(onRowClick && "is-click")}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter") onRowClick(r);
                    }
                  : undefined
              }
            >
              {columns.map((c) => (
                <td key={c.key} className={cx(c.align === "right" && "is-right mc-num", c.hideBelow && `mc-hide-lt-${c.hideBelow}`)}>
                  {cell(c, r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { DataTable as Table };
