"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dayKey } from "../ui/format";
import type { AdminData } from "../ui/useAdminData";

// Daily sign-up counts from GET /admin/signups/daily (one grouped count on
// the server, UK calendar days). Two things that endpoint cannot give come
// from a light read of the newest-first users list:
//   - yesterdaySameTime needs sign-up times, not day totals, so the first
//     page or two of the list are read until they reach past yesterday's
//     start (normally one page of 50).
//   - if the daily endpoint fails (for example the API has not been deployed
//     with it yet), the whole series falls back to paging the users list,
//     as this hook did before.
// Deleted accounts are not counted either way.

const PAGE_SIZE = 50;
const MAX_PAGES = 16;
const RECENT_PAGES = 3;

export interface SignupDay {
  date: string; // YYYY-MM-DD, UK day
  count: number;
}

export interface RecentSignups {
  days: SignupDay[]; // oldest first, ending today
  /** Sign-ups today up to now, and yesterday up to the same clock time. */
  todaySoFar: number;
  yesterdaySameTime: number;
  /** False when the users-list fallback ran out of pages before the window was covered. */
  complete: boolean;
}

interface UsersPage {
  data: Array<{ createdAt: string }>;
  totalPages: number;
}

interface DailyResponse {
  data: { days: SignupDay[]; total: number };
}

/** Newest-first sign-up times back to `since`, at most `maxPages` pages. */
async function readSignupTimes(since: Date, maxPages: number, isCancelled: () => boolean) {
  const stamps: Date[] = [];
  let complete = false;
  for (let page = 1; page <= maxPages; page++) {
    const res = await api.get<UsersPage>(`/admin/users?page=${page}&pageSize=${PAGE_SIZE}&sortBy=createdAt`);
    if (isCancelled()) return null;
    for (const u of res.data) stamps.push(new Date(u.createdAt));
    const last = res.data[res.data.length - 1];
    if (!last || new Date(last.createdAt) < since || page >= res.totalPages) {
      complete = true;
      break;
    }
  }
  return { stamps, complete };
}

export function useRecentSignups(windowDays = 30): AdminData<RecentSignups> {
  const [data, setData] = useState<RecentSignups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    setLoading(true);
    setError(null);

    (async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yStart = new Date(todayStart.getTime() - 86_400_000);
      const ySame = new Date(now.getTime() - 86_400_000);

      const [daily, recent] = await Promise.all([
        api.get<DailyResponse>(`/admin/signups/daily?days=${windowDays}`).catch(() => null),
        readSignupTimes(yStart, RECENT_PAGES, isCancelled),
      ]);
      if (cancelled || !recent) return;

      const yesterdaySameTime = recent.stamps.filter((d) => d >= yStart && d <= ySame).length;

      if (daily?.data?.days?.length) {
        const days = daily.data.days;
        setData({ days, todaySoFar: days[days.length - 1].count, yesterdaySameTime, complete: true });
        return;
      }

      // Fallback: build the series from the users list.
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (windowDays - 1));
      const full = await readSignupTimes(start, MAX_PAGES, isCancelled);
      if (!full) return;
      const counts = new Map<string, number>();
      for (const d of full.stamps) {
        if (d < start) continue;
        const k = dayKey(d);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const days: SignupDay[] = [];
      for (let i = 0; i < windowDays; i++) {
        const k = dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
        days.push({ date: k, count: counts.get(k) ?? 0 });
      }
      const todaySoFar = full.stamps.filter((d) => d >= todayStart).length;
      setData({ days, todaySoFar, yesterdaySameTime, complete: full.complete });
    })()
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load sign-ups");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [windowDays, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}
