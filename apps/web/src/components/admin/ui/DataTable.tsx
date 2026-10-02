"use client";

import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { AdminIcon } from "./icons";
import { EmptyState } from "./States";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  /** Cell content. Defaults to row[key]. */
  render?: (row: T) => ReactNode;
  /** Value to sort by. Setting this makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  /** Right-aligned tabular figures. */
  numeric?: boolean;
  width?: string | number;
  /** Tooltip on the header, to explain a column in plain words. */
  title?: string;
  /** Hide on phones (under 640px). Keep the columns that identify the row. */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  /** Names the table for screen readers. */
  caption: string;
  onRowClick?: (row: T) => void;
  /** Starting sort. */
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** Caps the height and keeps the header in view while the body scrolls. */
  maxHeight?: number;
  emptyTitle?: string;
  empty?: ReactNode;
  rowTone?: (row: T) => "good" | "warn" | "bad" | undefined;
  dense?: boolean;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

/** A table with a sticky header, optional sorting and optional row click. It
 *  scrolls sideways inside itself so the page never does. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  onRowClick,
  initialSort,
  maxHeight,
  emptyTitle = "Nothing to show",
  empty,
  rowTone,
  dense,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
      return String(av).localeCompare(String(bv), "en-GB", { numeric: true }) * mul;
    });
  }, [rows, sort, columns]);

  if (rows.length === 0) {
    return <EmptyState compact title={emptyTitle}>{empty}</EmptyState>;
  }

  const toggle = (key: string) => {
    setSort((s) => {
      if (!s || s.key !== key) {
        const col = columns.find((c) => c.key === key);
        return { key, dir: col?.numeric ? "desc" : "asc" };
      }
      return { key, dir: s.dir === "asc" ? "desc" : "asc" };
    });
  };

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  return (
    <div className={`adm-table-scroll${dense ? " adm-table-scroll--dense" : ""}`} style={maxHeight ? { maxHeight } : undefined}>
      <table className="adm-dtable">
        <caption className="adm-sr">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const align = c.align ?? (c.numeric ? "right" : "left");
              const isSorted = sort?.key === c.key;
              const cls = `${c.hideOnMobile ? "adm-hide-sm " : ""}adm-dtable__th--${align}`;
              return (
                <th
                  key={c.key}
                  scope="col"
                  title={c.title}
                  className={cls}
                  style={{ width: c.width }}
                  aria-sort={isSorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sortValue ? (
                    <button type="button" className="adm-dtable__sort" onClick={() => toggle(c.key)}>
                      {c.header}
                      <AdminIcon
                        name={isSorted ? (sort.dir === "asc" ? "sortUp" : "sortDown") : "sort"}
                        size={14}
                        className={isSorted ? "adm-dtable__sort-icon adm-dtable__sort-icon--on" : "adm-dtable__sort-icon"}
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const tone = rowTone?.(row);
            return (
              <tr
                key={rowKey(row, i)}
                className={`${onRowClick ? "adm-dtable__row--click " : ""}${tone ? `adm-dtable__row--${tone}` : ""}`.trim() || undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((c) => {
                  const align = c.align ?? (c.numeric ? "right" : "left");
                  return (
                    <td
                      key={c.key}
                      className={`adm-dtable__td--${align}${c.numeric ? " adm-num" : ""}${c.hideOnMobile ? " adm-hide-sm" : ""}`}
                    >
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
