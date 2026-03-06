"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { DashboardSkeleton } from "../../../components/ui/LoadingSkeleton";
import type {
  GamificationStats,
  PeriodRecap,
  Trip,
  PaginatedResponse,
  BusinessInsights,
  WeeklyPnL,
} from "@mileclear/shared";

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function trendArrow(percent: number | null): string {
  if (percent === null) return "";
  if (percent > 0) return `\u2191 ${percent}%`;
  if (percent < 0) return `\u2193 ${Math.abs(percent)}%`;
  return "— 0%";
}

function platformLabel(tag: string): string {
  const map: Record<string, string> = {
    uber: "Uber",
    deliveroo: "Deliveroo",
    just_eat: "Just Eat",
    amazon_flex: "Amazon Flex",
    stuart: "Stuart",
    gophr: "Gophr",
    dpd: "DPD",
    yodel: "Yodel",
    evri: "Evri",
    other: "Other",
  };
  return map[tag] ?? tag;
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "var(--emerald-400)";
    case "B": return "var(--amber-300)";
    case "C": return "var(--amber-500)";
    case "D": return "var(--dash-red)";
    case "F": return "var(--dash-red)";
    default: return "var(--text-muted)";
  }
}

export default function BusinessPage() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [insights, setInsights] = useState<BusinessInsights | null>(null);
  const [pnl, setPnl] = useState<WeeklyPnL | null>(null);
  const [monthlyRecap, setMonthlyRecap] = useState<PeriodRecap | null>(null);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [pnlWeek, setPnlWeek] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, insightsRes, pnlRes, recapRes, tripsRes] = await Promise.all([
          api.get<{ data: GamificationStats }>("/gamification/stats"),
          api.get<{ data: BusinessInsights }>("/business-insights"),
          api.get<{ data: WeeklyPnL }>("/business-insights/pnl"),
          api.get<{ data: PeriodRecap }>("/gamification/recap?period=monthly"),
          api.get<PaginatedResponse<Trip>>("/trips/?pageSize=5&classification=business"),
        ]);
        setStats(statsRes.data);
        setInsights(insightsRes.data);
        setPnl(pnlRes.data);
        setMonthlyRecap(recapRes.data);
        setRecentTrips(tripsRes.data);
      } catch {
        // Handled by empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Fetch P&L for different weeks
  useEffect(() => {
    if (pnlWeek === 0) return; // already loaded in initial fetch
    api
      .get<{ data: WeeklyPnL }>(`/business-insights/pnl?weeksBack=${pnlWeek}`)
      .then((res) => setPnl(res.data))
      .catch(() => {});
  }, [pnlWeek]);

  if (loading) return <DashboardSkeleton />;

  const hasInsights = insights && (insights.totalEarningsPence > 0 || insights.totalBusinessMiles > 0);

  return (
    <>
      <PageHeader title="Business" subtitle="Tax deductions, efficiency, and business intelligence" />

      {/* Tax Deduction Hero */}
      {stats && (
        <div className="hero-card" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="hero-card__label">
            HMRC Deduction ({stats.taxYear})
          </div>
          <div className="hero-card__value">{formatPence(stats.deductionPence)}</div>
          <div className="hero-card__meta">
            <span>{formatMiles(stats.businessMiles)} business miles</span>
            {stats.currentStreakDays > 0 && (
              <span className="hero-card__streak">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1L8.5 5.5L13 7L8.5 8.5L7 13L5.5 8.5L1 7L5.5 5.5L7 1Z" fill="currentColor" />
                </svg>
                {stats.currentStreakDays} day streak
              </span>
            )}
          </div>
        </div>
      )}

      {/* Efficiency Metrics */}
      {hasInsights && (
        <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
          {[
            {
              label: "Earnings / Mile",
              value: formatPence(insights.earningsPerMilePence),
              trend: insights.mileTrendPercent,
            },
            {
              label: "Earnings / Hour",
              value: formatPence(insights.earningsPerHourPence),
              trend: insights.earningsTrendPercent,
            },
            {
              label: "Shift Hours",
              value: formatHours(insights.totalShiftHours),
              trend: null,
            },
            {
              label: "Avg Trips / Shift",
              value: String(insights.avgTripsPerShift),
              trend: null,
            },
          ].map((item) => (
            <div key={item.label} className="stat-card">
              <div className="stat-card__value">{item.value}</div>
              <div className="stat-card__label">{item.label}</div>
              {item.trend !== null && (
                <div
                  className="stat-card__trend"
                  style={{ color: item.trend > 0 ? "var(--emerald-400)" : item.trend < 0 ? "var(--dash-red)" : "var(--text-muted)" }}
                >
                  {trendArrow(item.trend)} vs last week
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Fallback stats grid when no insights data yet */}
      {!hasInsights && stats && (
        <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
          {[
            { label: "Business Miles", value: `${formatMiles(stats.businessMiles)} mi` },
            { label: "Total Miles", value: `${formatMiles(stats.totalMiles)} mi` },
            { label: "Total Trips", value: String(stats.totalTrips) },
            { label: "Total Shifts", value: String(stats.totalShifts) },
          ].map((item) => (
            <div key={item.label} className="stat-card">
              <div className="stat-card__value">{item.value}</div>
              <div className="stat-card__label">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Platform Comparison */}
      {insights && insights.platformPerformance.length > 0 && (
        <div className="biz-insights-section" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="biz-insights-section__header">
            <h3 className="biz-insights-section__title">Platform Performance</h3>
            {insights.bestPlatform && (
              <Badge variant="pro">Best: {platformLabel(insights.bestPlatform)}</Badge>
            )}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th style={{ textAlign: "right" }}>Earnings</th>
                  <th style={{ textAlign: "right" }}>Trips</th>
                  <th style={{ textAlign: "right" }}>Miles</th>
                  <th style={{ textAlign: "right" }}>&pound;/Mile</th>
                  <th style={{ textAlign: "right" }}>&pound;/Trip</th>
                </tr>
              </thead>
              <tbody>
                {insights.platformPerformance.map((p) => (
                  <tr key={p.platform} className={p.platform === insights.bestPlatform ? "table__row--highlight" : ""}>
                    <td>
                      <Badge variant="business">{platformLabel(p.platform)}</Badge>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{formatPence(p.totalEarningsPence)}</td>
                    <td style={{ textAlign: "right" }}>{p.tripCount}</td>
                    <td style={{ textAlign: "right" }}>{formatMiles(p.totalMiles)}</td>
                    <td style={{ textAlign: "right", color: "var(--emerald-400)" }}>{formatPence(p.earningsPerMilePence)}</td>
                    <td style={{ textAlign: "right" }}>{formatPence(p.earningsPerTripPence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Shifts with Grades */}
      {insights && insights.recentShifts.length > 0 && (
        <div className="biz-insights-section" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="biz-insights-section__header">
            <h3 className="biz-insights-section__title">Shift Performance</h3>
            {insights.avgShiftGrade && (
              <div className="biz-shift-avg-grade">
                Avg grade: <span style={{ color: gradeColor(insights.avgShiftGrade), fontWeight: 700 }}>{insights.avgShiftGrade}</span>
              </div>
            )}
          </div>
          <div className="biz-shift-grid">
            {insights.recentShifts.slice(0, 6).map((shift) => (
              <div key={shift.shiftId} className="biz-shift-card">
                <div className="biz-shift-card__header">
                  <div className="biz-shift-card__date">
                    {new Date(shift.startedAt).toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </div>
                  <div
                    className="biz-shift-card__grade"
                    style={{ background: gradeColor(shift.grade) }}
                  >
                    {shift.grade}
                  </div>
                </div>
                <div className="biz-shift-card__stats">
                  <div>
                    <span className="biz-shift-card__stat-value">{formatPence(shift.earningsPence)}</span>
                    <span className="biz-shift-card__stat-label">earned</span>
                  </div>
                  <div>
                    <span className="biz-shift-card__stat-value">{formatMiles(shift.totalMiles)} mi</span>
                    <span className="biz-shift-card__stat-label">{shift.tripsCompleted} trips</span>
                  </div>
                  <div>
                    <span className="biz-shift-card__stat-value">{formatDuration(shift.durationSeconds)}</span>
                    <span className="biz-shift-card__stat-label">{shift.utilisationPercent}% active</span>
                  </div>
                </div>
                <div className="biz-shift-card__footer">
                  <span>{formatPence(shift.earningsPerHourPence)}/hr</span>
                  <span>{formatPence(shift.earningsPerMilePence)}/mi</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Peak Performance — Golden Hours */}
      {insights && insights.goldenHours.length > 0 && (
        <div className="biz-insights-row" style={{ marginBottom: "var(--dash-gap)" }}>
          <Card title="Golden Hours" subtitle="Your most profitable time slots" style={{ flex: 1 }}>
            <div className="biz-golden-hours">
              {insights.goldenHours.map((gh, i) => (
                <div key={gh.label} className="biz-golden-hour">
                  <div className="biz-golden-hour__rank">#{i + 1}</div>
                  <div className="biz-golden-hour__info">
                    <div className="biz-golden-hour__label">{gh.label}</div>
                    <div className="biz-golden-hour__meta">
                      {gh.tripCount} {gh.tripCount === 1 ? "session" : "sessions"} &middot; avg {formatPence(gh.avgEarningsPence)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {insights.busiestDay && (
              <div className="recap-note" style={{ marginTop: "0.75rem" }}>
                Your busiest day overall: <strong>{insights.busiestDay}</strong>
              </div>
            )}
          </Card>

          {/* Fuel Economy */}
          <Card title="Fuel Economy" style={{ flex: 1 }}>
            <div className="biz-fuel-stats">
              {insights.actualMpg !== null && (
                <div className="biz-fuel-stat">
                  <div className="biz-fuel-stat__value">{insights.actualMpg}</div>
                  <div className="biz-fuel-stat__label">Actual MPG</div>
                </div>
              )}
              {insights.fuelCostPerMilePence !== null && (
                <div className="biz-fuel-stat">
                  <div className="biz-fuel-stat__value">{insights.fuelCostPerMilePence}p</div>
                  <div className="biz-fuel-stat__label">Cost / Mile</div>
                </div>
              )}
              {insights.estimatedFuelCostPence !== null && (
                <div className="biz-fuel-stat">
                  <div className="biz-fuel-stat__value">{formatPence(insights.estimatedFuelCostPence)}</div>
                  <div className="biz-fuel-stat__label">Est. Fuel Cost (YTD)</div>
                </div>
              )}
              {insights.actualMpg === null && insights.fuelCostPerMilePence === null && (
                <div className="biz-fuel-empty">
                  Log fuel fill-ups with odometer readings to see your real MPG and cost per mile.
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Weekly P&L */}
      {pnl && (
        <div className="biz-insights-section" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="biz-insights-section__header">
            <h3 className="biz-insights-section__title">Weekly P&amp;L</h3>
            <div className="biz-pnl-nav">
              <button
                className="biz-pnl-nav__btn"
                onClick={() => setPnlWeek((w) => w + 1)}
                disabled={pnlWeek >= 12}
              >
                &larr; Prev
              </button>
              <span className="biz-pnl-nav__label">{pnl.periodLabel}</span>
              <button
                className="biz-pnl-nav__btn"
                onClick={() => setPnlWeek((w) => Math.max(0, w - 1))}
                disabled={pnlWeek === 0}
              >
                Next &rarr;
              </button>
            </div>
          </div>
          <div className="biz-pnl">
            <div className="biz-pnl__row">
              <span>Gross Earnings</span>
              <span className="biz-pnl__value biz-pnl__value--positive">{formatPence(pnl.grossEarningsPence)}</span>
            </div>
            <div className="biz-pnl__row">
              <span>Fuel Cost</span>
              <span className="biz-pnl__value biz-pnl__value--negative">
                {pnl.estimatedFuelCostPence > 0 ? `- ${formatPence(pnl.estimatedFuelCostPence)}` : "\u2014"}
              </span>
            </div>
            <div className="biz-pnl__row">
              <span>Vehicle Wear (est.)</span>
              <span className="biz-pnl__value biz-pnl__value--negative">
                {pnl.estimatedWearCostPence > 0 ? `- ${formatPence(pnl.estimatedWearCostPence)}` : "\u2014"}
              </span>
            </div>
            <div className="biz-pnl__divider" />
            <div className="biz-pnl__row biz-pnl__row--total">
              <span>Net Profit</span>
              <span className={`biz-pnl__value ${pnl.netProfitPence >= 0 ? "biz-pnl__value--positive" : "biz-pnl__value--negative"}`}>
                {formatPence(pnl.netProfitPence)}
              </span>
            </div>
            <div className="biz-pnl__row biz-pnl__row--muted">
              <span>HMRC Deduction</span>
              <span className="biz-pnl__value">{formatPence(pnl.hmrcDeductionPence)}</span>
            </div>
            <div className="biz-pnl__meta">
              {pnl.businessMiles} mi &middot; {pnl.totalTrips} trips
            </div>
          </div>
        </div>
      )}

      {/* Monthly Summary */}
      {monthlyRecap && (
        <Card
          title="This Month"
          subtitle={monthlyRecap.label}
          style={{ marginBottom: "var(--dash-gap)" }}
        >
          <div className="recap-grid">
            <div className="recap-stat">
              <div className="recap-stat__value">{formatMiles(monthlyRecap.totalMiles)} mi</div>
              <div className="recap-stat__label">Miles</div>
            </div>
            <div className="recap-stat">
              <div className="recap-stat__value">{monthlyRecap.totalTrips}</div>
              <div className="recap-stat__label">Trips</div>
            </div>
            <div className="recap-stat">
              <div className="recap-stat__value">{formatPence(monthlyRecap.deductionPence)}</div>
              <div className="recap-stat__label">Deduction</div>
            </div>
          </div>
          {monthlyRecap.busiestDayLabel && (
            <div className="recap-note">
              Busiest day: {monthlyRecap.busiestDayLabel} ({formatMiles(monthlyRecap.busiestDayMiles)} mi)
            </div>
          )}
        </Card>
      )}

      {/* HMRC Rate Info */}
      <Card title="HMRC Mileage Rates" style={{ marginBottom: "var(--dash-gap)" }}>
        <div className="recap-grid">
          <div className="recap-stat">
            <div className="recap-stat__value">45p</div>
            <div className="recap-stat__label">First 10,000 mi</div>
          </div>
          <div className="recap-stat">
            <div className="recap-stat__value">25p</div>
            <div className="recap-stat__label">Above 10,000 mi</div>
          </div>
          <div className="recap-stat">
            <div className="recap-stat__value">24p</div>
            <div className="recap-stat__label">Motorbike (flat)</div>
          </div>
        </div>
      </Card>

      {/* Recent Business Trips */}
      {recentTrips.length > 0 && (
        <Card
          title="Recent Business Trips"
          action={
            <Link href="/dashboard/trips" className="btn btn--ghost btn--sm">
              View all
            </Link>
          }
        >
          <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Route</th>
                  <th>Distance</th>
                  <th>Platform</th>
                </tr>
              </thead>
              <tbody>
                {recentTrips.map((trip) => (
                  <tr key={trip.id}>
                    <td>
                      {new Date(trip.startedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                    <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {trip.startAddress || "Unknown"} &rarr; {trip.endAddress || "Unknown"}
                    </td>
                    <td>{trip.distanceMiles?.toFixed(1) || "0"} mi</td>
                    <td>
                      {trip.platformTag ? (
                        <Badge variant="business">{platformLabel(trip.platformTag)}</Badge>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>&mdash;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
