// The live facts behind the More tab's sentences. Everything is either on the
// phone already (saved places, work hours, fuel logs, shifts) or a small call
// another screen already makes, through the shared Insights request cache so
// coming back to More inside a minute sends nothing.
//
// Rows render at once: the last answers are kept in memory for this driver, and
// before the first answer each row says its plain description (see
// lib/more/sentences.ts). Every read is best-effort; a failure leaves the
// calm description, never an error.
//
// Only the facts a visible row needs are asked for (`want`).

import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ACHIEVEMENT_TYPES, ACHIEVEMENT_META } from "@mileclear/shared";
import { getDatabase } from "../../lib/db";
import { getSchedule } from "../../lib/schedule";
import { fetchBillingStatus } from "../../lib/api/billing";
import { fetchCheapestToday } from "../../lib/api/fuel";
import { fetchRoadAlerts } from "../../lib/api/roadAlerts";
import { fetchEarnings, fetchBankConnections } from "../../lib/api/earnings";
import { fetchExpenses } from "../../lib/api/expenses";
import { fetchInvoices } from "../../lib/api/invoices";
import { fetchInboxCount } from "../../lib/api/inbox";
import { cachedAchievements, cachedRecap, cachedStats, cachedVehicles, dateParam } from "../../lib/insights/api";
import { insightsCache } from "../../lib/insights/requestCache";
import { getPeriodRange } from "../../lib/insights/period";
import { nextBadges } from "../../lib/insights/badges";
import type { SlotLike } from "../../lib/settings/summaries";
import type { BankFacts, CarFacts, InvoiceFacts, PlanFacts, RoadFacts } from "../../lib/more/sentences";
import type { MoreRowId } from "../../lib/more/rows";

export interface MoreFacts {
  plan: PlanFacts | null;
  cars: (CarFacts & { fuelType: string })[] | null;
  lastFillUpAt: string | null | undefined;
  cheapestPence: number | null;
  places: string[] | null;
  road: RoadFacts | null;
  /** undefined: not read yet; null: no shift ever. */
  lastShift: { startedAt: string; endedAt: string | null } | null | undefined;
  slots: SlotLike[] | null;
  earnings: { pence: number; platforms: number } | null;
  /** Earnings ever saved on this phone (an employee with some keeps the row). */
  earningsEver: number | null;
  expenses: { pence: number } | null;
  invoices: InvoiceFacts | null;
  bank: BankFacts | null;
  week: { totalMiles: number; totalTrips: number } | null;
  badges: { earned: number; total: number; next: { label: string; progressText: string } | null } | null;
}

const EMPTY: MoreFacts = {
  plan: null,
  cars: null,
  lastFillUpAt: undefined,
  cheapestPence: null,
  places: null,
  road: null,
  lastShift: undefined,
  slots: null,
  earnings: null,
  earningsEver: null,
  expenses: null,
  invoices: null,
  bank: null,
  week: null,
  badges: null,
};

// The last answers, for this driver only, so a return visit draws at once.
let memory: { userId: string | null; facts: MoreFacts } = { userId: null, facts: EMPTY };

const FIVE_MIN = 5 * 60_000;

export interface MoreFactsArgs {
  userId: string | null | undefined;
  isPro: boolean;
  isWork: boolean;
  /** The rows on the page; facts for other rows are not asked for. */
  want: ReadonlySet<MoreRowId>;
}

export function useMoreFacts(a: MoreFactsArgs): MoreFacts {
  const userId = a.userId ?? null;
  const [facts, setFacts] = useState<MoreFacts>(() => (memory.userId === userId ? memory.facts : EMPTY));

  useEffect(() => {
    if (memory.userId !== userId) {
      memory = { userId, facts: EMPTY };
      setFacts(EMPTY);
    }
  }, [userId]);

  const wantKey = [...a.want].sort().join(",");

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      if (memory.userId !== userId) memory = { userId, facts: EMPTY };
      let live = true;
      const put = (patch: Partial<MoreFacts>) => {
        if (!live || memory.userId !== userId) return;
        memory = { userId, facts: { ...memory.facts, ...patch } };
        setFacts(memory.facts);
      };
      const want = new Set(wantKey.split(",") as MoreRowId[]);
      const now = new Date();

      // Name card.
      insightsCache
        .get("more|billing", () => fetchBillingStatus().then((r) => r.data), FIVE_MIN)
        .then((b) =>
          put({
            plan: {
              isPremium: b.isPremium,
              source: b.premiumSource,
              currentPeriodEnd: b.currentPeriodEnd,
              cancelAtPeriodEnd: b.cancelAtPeriodEnd,
              referralProUntil: b.referralProUntil,
            },
          })
        )
        .catch(() => put({ plan: memory.facts.plan ?? { isPremium: a.isPro } }));

      // Your car: one list call carries the car, its MOT date and the odometer.
      cachedVehicles()
        .then((list) => {
          const cars = list.map((v) => ({
            make: v.make,
            model: v.model,
            isPrimary: v.isPrimary,
            fuelType: v.fuelType,
            motExpiryDate: (v as { motExpiryDate?: string | null }).motExpiryDate ?? null,
            odometer: v.odometer ?? null,
          }));
          put({ cars });
          const main = cars.find((c) => c.isPrimary) ?? cars[0];
          if (want.has("fuel") && main && main.fuelType !== "electric") {
            insightsCache
              .get("more|cheapest", () => fetchCheapestToday(), FIVE_MIN)
              .then((res) => {
                const d = res.data as { kind?: string; pencePerLitre?: number } | null;
                put({ cheapestPence: d && d.kind === "fuel" && typeof d.pencePerLitre === "number" ? d.pencePerLitre : null });
              })
              .catch(() => {});
          }
        })
        .catch(() => {});

      getDatabase()
        .then(async (db) => {
          const places = await db
            .getAllAsync<{ name: string }>("SELECT name FROM saved_locations ORDER BY name")
            .catch(() => null);
          if (places) put({ places: places.map((p) => p.name) });
          if (want.has("fuel")) {
            const fill = await db
              .getFirstAsync<{ logged_at: string }>("SELECT logged_at FROM fuel_logs ORDER BY logged_at DESC LIMIT 1")
              .catch(() => undefined);
            if (fill !== undefined) put({ lastFillUpAt: fill?.logged_at ?? null });
          }
          const ever = await db
            .getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM earnings")
            .catch(() => null);
          if (ever) put({ earningsEver: ever.n });
          const shift = await db
            .getFirstAsync<{ started_at: string; ended_at: string | null }>(
              "SELECT started_at, ended_at FROM shifts WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1"
            )
            .catch(() => undefined);
          if (shift !== undefined) {
            put({ lastShift: shift ? { startedAt: shift.started_at, endedAt: shift.ended_at } : null });
          }
        })
        .catch(() => {});

      if (want.has("road")) {
        insightsCache
          .get("more|road", () => fetchRoadAlerts(), FIVE_MIN)
          .then((res) => {
            const d = res.data;
            put({
              road: {
                enabled: d.enabled,
                available: d.available,
                hasUsualRoads: d.hasUsualRoads,
                current: d.current.length + (d.ongoing?.length ?? 0),
                upcoming: d.upcoming.length,
              },
            });
          })
          .catch(() => {});
      }

      if (want.has("work_hours")) {
        getSchedule()
          .then((s) => put({ slots: s }))
          .catch(() => {});
      }

      const month = getPeriodRange("month", 0, now);
      const fromIso = month.start.toISOString();
      const toIso = new Date(month.end.getTime() - 1).toISOString();

      if (want.has("earnings")) {
        insightsCache
          .get(`more|earnings|${fromIso}`, () => fetchEarnings({ from: fromIso, to: toIso, pageSize: 100 }))
          .then((res) => {
            const pence = res.data.reduce((sum, e) => sum + e.amountPence, 0);
            put({ earnings: { pence, platforms: new Set(res.data.map((e) => e.platform)).size } });
          })
          .catch(() => {});
      }

      if (want.has("expenses")) {
        insightsCache
          .get(`more|expenses|${fromIso}`, () => fetchExpenses({ from: fromIso, to: toIso, pageSize: 100 }))
          .then((res) => {
            // Only a full month is summed; a partial sum would understate it.
            if (res.total > res.data.length) return;
            put({ expenses: { pence: res.data.reduce((sum, e) => sum + e.amountPence, 0) } });
          })
          .catch(() => {});
      }

      if (want.has("invoices")) {
        insightsCache
          .get("more|invoices", () => fetchInvoices({ pageSize: 1 }))
          .then((res) => {
            const s = res.summary;
            const total = Object.values(s).reduce((n, v) => n + (v?.count ?? 0), 0);
            put({
              invoices: {
                total,
                waitingCount: s.sent?.count ?? 0,
                waitingPence: s.sent?.totalPence ?? 0,
                overdueCount: s.overdue?.count ?? 0,
                overduePence: s.overdue?.totalPence ?? 0,
              },
            });
          })
          .catch(() => {});
      }

      // Bank: only Pro drivers can link one, so a free driver sends nothing.
      if (want.has("bank") && a.isPro) {
        insightsCache
          .get("more|banks", () => fetchBankConnections().then((r) => r.data))
          .then(async (conns) => {
            const banks = conns
              .filter((c) => c.status !== "disconnected")
              .map((c) => c.institutionName || "Your bank");
            let toSort: number | null = null;
            if (banks.length > 0) {
              toSort = await insightsCache
                .get("more|inbox-count", () => fetchInboxCount().then((r) => r.data.count))
                .catch(() => null);
            }
            put({ bank: { banks, toSort } });
          })
          .catch(() => {});
      }

      if (want.has("insights") && a.isWork) {
        const week = getPeriodRange("week", 0, now);
        // Same request as Home's door and Insights' week, so the figures agree.
        cachedRecap("weekly", dateParam(week.anchor), a.isPro)
          .then((r) => put({ week: { totalMiles: r.totalMiles, totalTrips: r.totalTrips } }))
          .catch(() => {});
      }

      if (want.has("badges")) {
        Promise.all([cachedAchievements(), cachedStats()])
          .then(([list, stats]) => {
            const earned = new Set(list.map((x) => x.type));
            const next = nextBadges(
              ACHIEVEMENT_TYPES as readonly string[],
              earned,
              {
                totalMiles: stats.lifetimeMiles ?? stats.totalMiles,
                totalTrips: stats.totalTrips,
                totalShifts: stats.totalShifts,
                longestStreakDays: stats.longestStreakDays,
              },
              a.isWork ? "work" : "personal",
              1
            )[0];
            const label = next ? (ACHIEVEMENT_META as Record<string, { label: string }>)[next.type]?.label : null;
            put({
              badges: {
                earned: ACHIEVEMENT_TYPES.filter((t) => earned.has(t)).length,
                total: ACHIEVEMENT_TYPES.length,
                next: next && label ? { label, progressText: next.progressText } : null,
              },
            });
          })
          .catch(() => {});
      }

      return () => {
        live = false;
      };
    }, [userId, a.isPro, a.isWork, wantKey])
  );

  return facts;
}
