"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import type { GamificationStats, Trip, PaginatedResponse } from "@mileclear/shared";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPence(p: number) {
  return `\u00A3${(p / 100).toFixed(2)}`;
}

function formatMiles(m: number) {
  return m.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

/** Return the ISO year + week number (Mon-based) for a given date as a string key "YYYY-WW". */
function isoWeekKey(date: Date): string {
  // Copy date so we don't mutate
  const d = new Date(date.getTime());
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

/** Format the Monday of the week containing `date` as "6 Jan" style. */
function weekLabel(date: Date): string {
  const d = new Date(date.getTime());
  const day = d.getUTCDay() || 7; // Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() - day + 1); // rewind to Monday
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

interface WeekBucket {
  key: string;
  label: string;
  miles: number;
  trips: number;
}

/** Aggregate trips into the last N complete weeks (Mon–Sun), returning chronological buckets. */
function buildWeekBuckets(trips: Trip[], numWeeks = 12): WeekBucket[] {
  // Build the last numWeeks Monday-anchored week boundaries
  const now = new Date();
  const currentDayOfWeek = now.getUTCDay() || 7; // Mon=1
  // Start of the current week (Monday)
  const thisMonday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - currentDayOfWeek + 1)
  );

  const buckets: WeekBucket[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const monday = new Date(thisMonday.getTime() - i * 7 * 86400000);
    buckets.push({
      key: isoWeekKey(monday),
      label: weekLabel(monday),
      miles: 0,
      trips: 0,
    });
  }

  // Index buckets by key for quick lookup
  const bucketMap = new Map<string, WeekBucket>();
  for (const b of buckets) {
    bucketMap.set(b.key, b);
  }

  for (const trip of trips) {
    const tripDate = new Date(trip.startedAt);
    const key = isoWeekKey(tripDate);
    const bucket = bucketMap.get(key);
    if (bucket) {
      bucket.miles += trip.distanceMiles ?? 0;
      bucket.trips += 1;
    }
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// UK tax year helpers
// ---------------------------------------------------------------------------

/** UK tax year starts 6 April. Returns the year the tax year *starts* in. */
function currentTaxYearStart(): Date {
  const today = new Date();
  const year = today.getFullYear();
  const aprilSixth = new Date(year, 3, 6); // month is 0-indexed
  return today >= aprilSixth
    ? new Date(year, 3, 6)
    : new Date(year - 1, 3, 6);
}

function currentTaxYearEnd(start: Date): Date {
  return new Date(start.getFullYear() + 1, 3, 5, 23, 59, 59);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface MonthBucket {
  label: string;
  year: number;
  month: number; // 0-indexed
  miles: number;
  trips: number;
  deductionPence: number;
}

/**
 * HMRC deduction (car/van rate: 45p first 10k, 25p after).
 * cumulativeMilesBefore = business miles already driven before this month.
 */
function calcMonthDeduction(monthMiles: number, cumulativeMilesBefore: number): number {
  const THRESHOLD = 10000;
  const HIGH_RATE = 45; // pence
  const LOW_RATE = 25; // pence

  let deduction = 0;
  let remaining = monthMiles;

  if (cumulativeMilesBefore < THRESHOLD) {
    const atHighRate = Math.min(remaining, THRESHOLD - cumulativeMilesBefore);
    deduction += atHighRate * HIGH_RATE;
    remaining -= atHighRate;
  }

  if (remaining > 0) {
    deduction += remaining * LOW_RATE;
  }

  return deduction;
}

function buildMonthBuckets(trips: Trip[], taxYearStart: Date): MonthBucket[] {
  // Tax year months in order: April(3) → March(2) of next year
  const buckets: MonthBucket[] = [];
  for (let i = 0; i < 12; i++) {
    const rawMonth = (taxYearStart.getMonth() + i) % 12; // 0-indexed
    const year =
      taxYearStart.getFullYear() + Math.floor((taxYearStart.getMonth() + i) / 12);
    buckets.push({
      label: MONTH_NAMES[rawMonth],
      year,
      month: rawMonth,
      miles: 0,
      trips: 0,
      deductionPence: 0,
    });
  }

  for (const trip of trips) {
    const d = new Date(trip.startedAt);
    const m = d.getMonth();
    const y = d.getFullYear();
    const bucket = buckets.find((b) => b.month === m && b.year === y);
    if (bucket) {
      bucket.miles += trip.distanceMiles ?? 0;
      bucket.trips += 1;
    }
  }

  // Calculate deductions in order, carrying cumulative mileage
  let cumulative = 0;
  for (const bucket of buckets) {
    bucket.deductionPence = calcMonthDeduction(bucket.miles, cumulative);
    cumulative += bucket.miles;
  }

  return buckets;
}

// ---------------------------------------------------------------------------
// Bar chart sub-components (pure CSS, no library)
// ---------------------------------------------------------------------------

interface BarChartProps {
  title: string;
  data: { label: string; value: number }[];
  color: "amber" | "emerald";
  formatValue?: (v: number) => string;
}

function BarChart({ title, data, color, formatValue }: BarChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  const barGradient =
    color === "amber"
      ? "linear-gradient(to top, var(--amber-500, #f59e0b), var(--amber-400, #fbbf24))"
      : "linear-gradient(to top, #059669, #34d399)";

  const barGlowColor =
    color === "amber"
      ? "rgba(245, 158, 11, 0.25)"
      : "rgba(52, 211, 153, 0.2)";

  const display = formatValue ?? ((v: number) => v.toFixed(0));

  return (
    <div
      style={{
        background: "var(--dash-card-bg)",
        border: "1px solid var(--dash-card-border)",
        borderRadius: "var(--r-md)",
        padding: "1.25rem",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.9375rem",
          fontWeight: 600,
          color: "var(--text-white)",
          marginBottom: "1.25rem",
        }}
      >
        {title}
      </div>

      {/* Bar area */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "4px",
          height: "200px",
          padding: "0 4px",
        }}
      >
        {data.map((d, idx) => {
          const heightPct = maxValue > 0 ? (d.value / maxValue) * 100 : 0;
          const isEmpty = d.value === 0;

          return (
            <div
              key={idx}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                height: "100%",
                gap: "4px",
                minWidth: 0,
              }}
            >
              {/* Value label above bar */}
              <span
                style={{
                  fontSize: "0.625rem",
                  fontWeight: 600,
                  color: isEmpty ? "transparent" : (color === "amber" ? "var(--amber-400)" : "#34d399"),
                  whiteSpace: "nowrap",
                  lineHeight: 1,
                  marginBottom: "2px",
                }}
              >
                {isEmpty ? "0" : display(d.value)}
              </span>

              {/* The bar itself */}
              <div
                style={{
                  width: "100%",
                  height: isEmpty ? "3px" : `${heightPct}%`,
                  background: isEmpty
                    ? "rgba(255,255,255,0.06)"
                    : barGradient,
                  borderRadius: isEmpty ? "2px" : "4px 4px 2px 2px",
                  boxShadow: isEmpty ? "none" : `0 0 8px ${barGlowColor}`,
                  transition: "height 0.3s ease",
                  minHeight: isEmpty ? undefined : "4px",
                  flexShrink: 0,
                }}
              />

              {/* Week label below bar */}
              <span
                style={{
                  fontSize: "0.5625rem",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "100%",
                  textAlign: "center",
                  lineHeight: 1.2,
                  paddingTop: "2px",
                }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Baseline rule */}
      <div
        style={{
          height: "1px",
          background: "var(--border-subtle)",
          marginTop: "2px",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics skeleton
// ---------------------------------------------------------------------------

function AnalyticsSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="skeleton skeleton--title" style={{ width: "28%" }} />
      <div className="skeleton skeleton--text" style={{ width: "44%" }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton skeleton--card" style={{ height: 90 }} />
        ))}
      </div>
      <div className="skeleton skeleton--card" style={{ height: 260 }} />
      <div className="skeleton skeleton--card" style={{ height: 260 }} />
      <div className="skeleton skeleton--card" style={{ height: 320 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Determine date range: start of 12 weeks ago → now
        const now = new Date();
        const currentDayOfWeek = now.getUTCDay() || 7;
        const thisMonday = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - currentDayOfWeek + 1
          )
        );
        const twelveWeeksAgo = new Date(thisMonday.getTime() - 11 * 7 * 86400000);

        // Also fetch from tax year start for the monthly table
        const taxYearStart = currentTaxYearStart();
        const taxYearEnd = currentTaxYearEnd(taxYearStart);

        // Use the earlier of the two start dates
        const fetchFrom = taxYearStart < twelveWeeksAgo ? taxYearStart : twelveWeeksAgo;

        const [statsRes, tripsRes] = await Promise.all([
          api.get<{ data: GamificationStats }>("/gamification/stats"),
          api.get<PaginatedResponse<Trip>>(
            `/trips/?pageSize=100&from=${fetchFrom.toISOString()}&to=${taxYearEnd.toISOString()}`
          ),
        ]);

        setStats(statsRes.data);
        setTrips(tripsRes.data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load analytics";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) return <AnalyticsSkeleton />;

  if (error) {
    return (
      <>
        <PageHeader title="Analytics" subtitle="Your driving trends and insights" />
        <div className="alert alert--error">{error}</div>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Aggregations
  // -------------------------------------------------------------------------

  const taxYearStart = currentTaxYearStart();
  const weekBuckets = buildWeekBuckets(trips, 12);
  const monthBuckets = buildMonthBuckets(trips, taxYearStart);

  const totalMilesYear = stats?.businessMiles ?? 0;
  const totalTripsYear = stats?.totalTrips ?? 0;
  const taxDeduction = stats?.deductionPence ?? 0;

  // Average miles per day — days elapsed in current tax year
  const today = new Date();
  const daysElapsed = Math.max(
    1,
    Math.floor((today.getTime() - taxYearStart.getTime()) / (1000 * 60 * 60 * 24))
  );
  const avgMilesPerDay = totalMilesYear / daysElapsed;

  // Chart data
  const milesChartData = weekBuckets.map((b) => ({
    label: b.label,
    value: parseFloat(b.miles.toFixed(1)),
  }));

  const tripsChartData = weekBuckets.map((b) => ({
    label: b.label,
    value: b.trips,
  }));

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <PageHeader title="Analytics" subtitle="Your driving trends and insights" />

      {/* Stats grid */}
      <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--amber">
            {formatMiles(totalMilesYear)} mi
          </div>
          <div className="stat-card__label">Business miles this year</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__value">{totalTripsYear.toLocaleString("en-GB")}</div>
          <div className="stat-card__label">Total trips this year</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__value stat-card__value--emerald">
            {formatMiles(avgMilesPerDay)} mi
          </div>
          <div className="stat-card__label">Avg miles per day</div>
        </div>

        <div className="stat-card">
          <div className="stat-card__value stat-card__value--amber">
            {formatPence(taxDeduction)}
          </div>
          <div className="stat-card__label">Tax deduction ({stats?.taxYear})</div>
        </div>
      </div>

      {/* Miles per week bar chart */}
      <div style={{ marginBottom: "var(--dash-gap)" }}>
        <BarChart
          title="Miles per Week (last 12 weeks)"
          data={milesChartData}
          color="amber"
          formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0))}
        />
      </div>

      {/* Trips per week bar chart */}
      <div style={{ marginBottom: "var(--dash-gap)" }}>
        <BarChart
          title="Trips per Week (last 12 weeks)"
          data={tripsChartData}
          color="emerald"
          formatValue={(v) => String(Math.round(v))}
        />
      </div>

      {/* Monthly breakdown table */}
      <Card
        title={`Monthly Breakdown — ${stats?.taxYear ?? "Current Tax Year"}`}
        subtitle="Business miles, trips, and HMRC deduction per month (Apr–Mar)"
      >
        <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Miles</th>
                <th>Trips</th>
                <th>HMRC Deduction</th>
                <th>Cumulative Miles</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let cumulative = 0;
                return monthBuckets.map((bucket, idx) => {
                  const prevCumulative = cumulative;
                  cumulative += bucket.miles;

                  const isCurrentMonth =
                    today.getMonth() === bucket.month &&
                    today.getFullYear() === bucket.year;

                  const isFuture =
                    new Date(bucket.year, bucket.month, 1) > today;

                  return (
                    <tr
                      key={idx}
                      style={
                        isCurrentMonth
                          ? { background: "rgba(234,179,8,0.04)" }
                          : undefined
                      }
                    >
                      <td>
                        <span
                          style={{
                            fontWeight: isCurrentMonth ? 600 : undefined,
                            color: isCurrentMonth
                              ? "var(--amber-400)"
                              : isFuture
                              ? "var(--text-faint, var(--text-muted))"
                              : undefined,
                          }}
                        >
                          {bucket.label} {bucket.year}
                          {isCurrentMonth && (
                            <span
                              style={{
                                marginLeft: "0.5rem",
                                fontSize: "0.625rem",
                                fontWeight: 700,
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                color: "var(--amber-400)",
                                opacity: 0.8,
                              }}
                            >
                              current
                            </span>
                          )}
                        </span>
                      </td>
                      <td
                        style={{
                          color: isFuture
                            ? "var(--text-faint, var(--text-muted))"
                            : undefined,
                        }}
                      >
                        {isFuture ? "—" : `${formatMiles(bucket.miles)} mi`}
                      </td>
                      <td
                        style={{
                          color: isFuture
                            ? "var(--text-faint, var(--text-muted))"
                            : undefined,
                        }}
                      >
                        {isFuture ? "—" : bucket.trips}
                      </td>
                      <td
                        style={{
                          color: isFuture
                            ? "var(--text-faint, var(--text-muted))"
                            : "var(--emerald-400)",
                          fontWeight: isFuture ? undefined : 600,
                        }}
                      >
                        {isFuture ? "—" : formatPence(bucket.deductionPence)}
                      </td>
                      <td
                        style={{
                          color: isFuture
                            ? "var(--text-faint, var(--text-muted))"
                            : "var(--text-secondary)",
                          fontSize: "0.8125rem",
                        }}
                      >
                        {isFuture
                          ? "—"
                          : `${formatMiles(prevCumulative + bucket.miles)} mi`}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>

            {/* Totals footer */}
            <tfoot>
              <tr
                style={{
                  borderTop: "1px solid var(--border-default)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <td
                  style={{
                    padding: "0.75rem 1rem",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    fontSize: "0.875rem",
                  }}
                >
                  Total
                </td>
                <td
                  style={{
                    padding: "0.75rem 1rem",
                    fontWeight: 700,
                    color: "var(--amber-400)",
                    fontSize: "0.875rem",
                  }}
                >
                  {formatMiles(monthBuckets.reduce((s, b) => s + b.miles, 0))} mi
                </td>
                <td
                  style={{
                    padding: "0.75rem 1rem",
                    fontWeight: 700,
                    color: "var(--text-white)",
                    fontSize: "0.875rem",
                  }}
                >
                  {monthBuckets.reduce((s, b) => s + b.trips, 0)}
                </td>
                <td
                  style={{
                    padding: "0.75rem 1rem",
                    fontWeight: 700,
                    color: "var(--emerald-400)",
                    fontSize: "0.875rem",
                  }}
                >
                  {formatPence(monthBuckets.reduce((s, b) => s + b.deductionPence, 0))}
                </td>
                <td style={{ padding: "0.75rem 1rem" }} />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* HMRC rate note */}
        <p
          style={{
            marginTop: "0.875rem",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          Deductions calculated using HMRC approved mileage rates: 45p/mi for the first 10,000 business miles,
          25p/mi thereafter. Car and van rates applied.
        </p>
      </Card>
    </>
  );
}
