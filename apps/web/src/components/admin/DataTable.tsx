import type { ReactNode } from "react";
import { Empty } from "./Empty";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string | number;
  title?: string;
  /** Tabular numerals; set for numeric columns. */
  numeric?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string;
  empty?: ReactNode;
  /** Optional class for a row, e.g. to flag it. */
  rowClassName?: (row: T) => string | undefined;
}

// A plain table inside its own horizontal scroller, so a wide table never
// makes the page scroll sideways. No sorting or paging built in; a section
// that needs paging passes sliced rows.
export function DataTable<T>({ columns, rows, rowKey, empty, rowClassName }: DataTableProps<T>) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                title={c.title}
                style={{ textAlign: c.align ?? "left", width: c.width }}
                className={c.numeric ? "admin-table__num" : undefined}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : String(i)} className={rowClassName?.(row)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{ textAlign: c.align ?? "left" }}
                  className={c.numeric ? "admin-table__num" : undefined}
                >
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
