"use client";

import { useState } from "react";
import type { CalendarDay } from "@mileclear/shared";
import { Button, Card, useData, useMe } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, DAYS_MON_FIRST, withBoundary } from "./ui";
import s from "./insights.module.css";

/** A month of working days, shaded by miles. Work view only. */
function WorkCalendarCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement | null {
  const { mode } = useMe();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const on = mode === "work";
  const { data, error, loading, reload } = useData<CalendarDay[]>(on ? `calendar-${cursor.y}-${cursor.m}` : null, () =>
    getData(`/user/calendar?year=${cursor.y}&month=${cursor.m}`)
  );

  if (!on) return null;
  if (loading && !data) return <CardLoading title="Working calendar" />;
  if (error) return <CardFailed title="Working calendar" onRetry={reload} />;

  const byDate = new Map((data ?? []).map((d) => [d.date.slice(0, 10), d]));
  const maxMiles = Math.max(0, ...(data ?? []).map((d) => d.miles));
  const first = new Date(cursor.y, cursor.m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(cursor.y, cursor.m, 0).getDate();
  const label = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const level = (v: number) => (v <= 0 || maxMiles <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((v / maxMiles) * 4))));
  const move = (delta: number) => setCursor((c) => {
    const d = new Date(c.y, c.m - 1 + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });
  const anyDriving = (data ?? []).some((d) => d.miles > 0);

  return (
    <Card title="Working calendar">
      <div className={s.weekNav}>
        <Button variant="ghost" size="sm" icon="chevron-back" aria-label="Previous month" onClick={() => move(-1)} />
        <span className={s.weekLabel}>{label}</span>
        <Button variant="ghost" size="sm" icon="chevron-forward" aria-label="Next month" onClick={() => move(1)} />
      </div>
      <div className={s.cal} role="grid" aria-label={`Miles driven each day in ${label}`}>
        {DAYS_MON_FIRST.map((d) => (
          <span key={d} className={s.calHead} role="columnheader">
            {d.slice(0, 2)}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {Array.from({ length: daysIn }, (_, i) => {
          const day = i + 1;
          const key = `${cursor.y}-${String(cursor.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entry = byDate.get(key);
          const v = entry?.miles ?? 0;
          return (
            <span key={key} className={s.calDay} data-level={level(v)} role="gridcell" title={`${day} ${label}: ${v > 0 ? `${Math.round(v * 10) / 10} mi` : "no driving"}`}>
              {day}
            </span>
          );
        })}
      </div>
      {!anyDriving && <p className={s.note}>No driving recorded this month.</p>}
    </Card>
  );
}

export const WorkCalendarCard = withBoundary(WorkCalendarCardImpl);
