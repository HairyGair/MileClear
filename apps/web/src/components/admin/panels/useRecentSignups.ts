"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dayKey } from "../ui/format";
import type { AdminData } from "../ui/useAdminData";

// Daily sign-up counts, built from the newest-first users list because the
// API has no per-day sign-up endpoint yet. Pages of 50 (the list's cap) are
// fetched until one reaches past the window, up to MAX_PAGES. Deleted
// accounts are not in the list, so a day can read lower than it did.
// Replace with a dedicated aggregate endpoint when one exists.

const PAGE_SIZE = 50;
const MAX_PAGES = 16;

export interface SignupDay {
  date: string; // YYYY-MM-DD, local
  count: number;
}

export interface RecentSignups {
  days: SignupDay[]; // oldest first, ending today
  /** Sign-ups today up to now, and yesterday up to the same clock time. */
  todaySoFar: number;
  yesterdaySameTime: number;
  /** False when MAX_PAGES ran out before the window was covered. */
  complete: boolean;
}

interface UsersPage {
  data: Array<{ createdAt: string }>;
  totalPages: number;
}

export function useRecentSignups(windowDays = 30): AdminData<RecentSignups> {
  const [data, setData] = useState<RecentSignups | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (windowDays - 1));
      const stamps: Date[] = [];
      let complete = false;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await api.get<UsersPage>(`/admin/users?page=${page}&pageSize=${PAGE_SIZE}&sortBy=createdAt`);
        if (cancelled) return;
        for (const u of res.data) stamps.push(new Date(u.createdAt));
        const last = res.data[res.data.length - 1];
        if (!last || new Date(last.createdAt) < start || page >= res.totalPages) {
          complete = true;
          break;
        }
      }

      const counts = new Map<string, number>();
      for (const d of stamps) {
        if (d < start) continue;
        const k = dayKey(d);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const days: SignupDay[] = [];
      for (let i = 0; i < windowDays; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const k = dayKey(d);
        days.push({ date: k, count: counts.get(k) ?? 0 });
      }

      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yStart = new Date(todayStart.getTime() - 86_400_000);
      const ySame = new Date(now.getTime() - 86_400_000);
      const todaySoFar = stamps.filter((d) => d >= todayStart).length;
      const yesterdaySameTime = stamps.filter((d) => d >= yStart && d <= ySame).length;

      setData({ days, todaySoFar, yesterdaySameTime, complete });
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
