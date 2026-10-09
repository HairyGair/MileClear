"use client";

import { useMediaQuery } from "@/lib/dashboard/useMediaQuery";
import s from "./charts.module.css";

export interface HeatCell {
  row: number;
  col: number;
  value: number;
}

export interface HeatmapProps {
  rows: string[];
  cols: string[];
  /** Sparse cells; any missing cell is zero. */
  cells: HeatCell[];
  label: string;
  /** Text for a cell's title and the data table, e.g. "Fri 18:00: 4 trips". */
  describe: (row: string, col: string, value: number) => string;
  /** Show only every nth column label. */
  colLabelEvery?: number;
}

/** Five steps of amber over the surface. 0 is the empty tile, then 12, 30, 55 and 85 percent. */
export function Heatmap({ rows, cols, cells, label, describe, colLabelEvery = 1 }: HeatmapProps) {
  const wide = useMediaQuery("(min-width: 1024px)");
  const cell = wide ? 14 : 12;
  const map = new Map<string, number>();
  let max = 0;
  for (const c of cells) {
    map.set(`${c.row}:${c.col}`, c.value);
    if (c.value > max) max = c.value;
  }
  const level = (v: number) => (v <= 0 || max <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((v / max) * 4))));

  return (
    <div className={s.heat} data-testid="heatmap">
      <div className={s.heatScroll} role="img" aria-label={label}>
        <div className={s.heatGrid} style={{ ["--cols" as string]: cols.length, ["--cell" as string]: `${cell}px` }}>
          <span />
          {cols.map((c, i) => (
            <span key={c} className={s.heatColLabel}>
              {i % colLabelEvery === 0 ? c : ""}
            </span>
          ))}
          {rows.map((r, ri) => (
            <HeatRow key={r} row={r} ri={ri} cols={cols} map={map} level={level} describe={describe} />
          ))}
        </div>
      </div>
      <div className={s.legend} aria-hidden="true">
        Less
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={s.legendCell} data-level={l} />
        ))}
        More
      </div>
      <table className={s.srTable}>
        <caption>{label}</caption>
        <tbody>
          {rows.flatMap((r, ri) =>
            cols.map((c, ci) => {
              const v = map.get(`${ri}:${ci}`) ?? 0;
              return v > 0 ? (
                <tr key={`${ri}:${ci}`}>
                  <th scope="row">{describe(r, c, v)}</th>
                </tr>
              ) : null;
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function HeatRow({
  row, ri, cols, map, level, describe,
}: {
  row: string;
  ri: number;
  cols: string[];
  map: Map<string, number>;
  level: (v: number) => number;
  describe: HeatmapProps["describe"];
}) {
  return (
    <>
      <span className={s.heatRowLabel}>{row}</span>
      {cols.map((c, ci) => {
        const v = map.get(`${ri}:${ci}`) ?? 0;
        return <span key={c} className={s.cell} data-level={level(v)} title={describe(row, c, v)} />;
      })}
    </>
  );
}
