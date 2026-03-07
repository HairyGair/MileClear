"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { DashboardSkeleton } from "../../../components/ui/LoadingSkeleton";
import { RecapShareModal } from "../../../components/dashboard/RecapShareCard";
import type {
  GamificationStats,
  AchievementWithMeta,
  PeriodRecap,
  Trip,
  PaginatedResponse,
  Vehicle,
} from "@mileclear/shared";
import {
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_META,
  FREE_ACHIEVEMENT_TYPES,
  getDistanceEquivalent,
  getMilestoneProgress,
} from "@mileclear/shared";
import { useAuth } from "../../../lib/auth-context";

interface FuelLog {
  id: string;
  litres: number;
  costPence: number;
  stationName: string | null;
  loggedAt: string;
  vehicle?: { make: string; model: string } | null;
}

interface FuelLogsResponse {
  data: FuelLog[];
  total: number;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

type RecapView = "daily" | "weekly" | "monthly" | "yearly";

const freeSet = new Set<string>(FREE_ACHIEVEMENT_TYPES);

export default function PersonalPage() {
  const { user } = useAuth();
  const isPremium = user?.isPremium ?? false;
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [achievements, setAchievements] = useState<AchievementWithMeta[]>([]);
  const [dailyRecap, setDailyRecap] = useState<PeriodRecap | null>(null);
  const [weeklyRecap, setWeeklyRecap] = useState<PeriodRecap | null>(null);
  const [monthlyRecap, setMonthlyRecap] = useState<PeriodRecap | null>(null);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [fuelTotal, setFuelTotal] = useState(0);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [recapView, setRecapView] = useState<RecapView>(isPremium ? "monthly" : "daily");
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        // Current month date range for fuel logs
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const [statsRes, achRes, tripsRes, fuelRes, vehicleRes] = await Promise.all([
          api.get<{ data: GamificationStats }>("/gamification/stats"),
          api.get<{ data: AchievementWithMeta[] }>("/gamification/achievements"),
          api.get<PaginatedResponse<Trip>>("/trips/?pageSize=5&classification=personal"),
          api.get<FuelLogsResponse>(`/fuel/logs?pageSize=5&from=${monthStart.toISOString()}&to=${monthEnd.toISOString()}`).catch(() => null),
          api.get<{ data: Vehicle[] }>("/vehicles/").catch(() => null),
        ]);
        setStats(statsRes.data);
        setAchievements(achRes.data);
        setRecentTrips(tripsRes.data);

        // Daily recap is free (viral sharing); weekly/monthly are premium
        const dailyRes = await api.get<{ data: PeriodRecap }>("/gamification/recap?period=daily").catch(() => null);
        if (dailyRes) setDailyRecap(dailyRes.data);

        if (user?.isPremium) {
          const [weeklyRes, monthlyRes] = await Promise.all([
            api.get<{ data: PeriodRecap }>("/gamification/recap?period=weekly").catch(() => null),
            api.get<{ data: PeriodRecap }>("/gamification/recap?period=monthly").catch(() => null),
          ]);
          if (weeklyRes) setWeeklyRecap(weeklyRes.data);
          if (monthlyRes) setMonthlyRecap(monthlyRes.data);
        }
        if (fuelRes) {
          setFuelLogs(fuelRes.data);
          setFuelTotal(fuelRes.total);
        }
        if (vehicleRes) {
          setVehicles(vehicleRes.data);
        }
      } catch {
        // Handled by empty state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <DashboardSkeleton />;

  const earnedTypes = new Set(achievements.map((a) => a.type));

  return (
    <>
      <PageHeader title="Personal" subtitle="Your driving journey and achievements" />

      {/* Stats Grid */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
          {[
            { label: "Today", value: `${formatMiles(stats.todayMiles)} mi` },
            { label: "This Week", value: `${formatMiles(stats.weekMiles)} mi` },
            { label: "Total Miles", value: `${formatMiles(stats.totalMiles)} mi` },
            { label: "Streak", value: stats.currentStreakDays > 0 ? `${stats.currentStreakDays}d` : "None" },
          ].map((item) => (
            <div key={item.label} className="stat-card">
              <div className="stat-card__value">{item.value}</div>
              <div className="stat-card__label">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Mileage Milestone */}
      {stats && (() => {
        const ms = getMilestoneProgress(stats.totalMiles);
        if (ms.allComplete) return null;
        return (
          <div className="milestone-card" style={{ marginBottom: "var(--dash-gap)" }}>
            <div className="milestone-card__header">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber-400)" strokeWidth="2" strokeLinecap="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <line x1="4" y1="22" x2="4" y2="15" />
              </svg>
              <span>Next Milestone</span>
            </div>
            <div className="milestone-card__target">
              {ms.nextMilestone.toLocaleString("en-GB")} miles
            </div>
            <div className="milestone-card__bar-wrap">
              <div className="milestone-card__bar" style={{ width: `${Math.round(ms.progress * 100)}%` }} />
            </div>
            <div className="milestone-card__info">
              <span>{ms.milesRemaining.toLocaleString("en-GB")} miles to go</span>
              <span>{Math.round(ms.progress * 100)}%</span>
            </div>
            {ms.milestoneAfter && (
              <div className="milestone-card__after">
                Then: {ms.milestoneAfter.toLocaleString("en-GB")} miles
              </div>
            )}
          </div>
        );
      })()}

      {/* Driving Recap — daily is free, weekly/monthly/yearly are premium */}
      {(dailyRecap || (isPremium && (weeklyRecap || monthlyRecap || stats))) && (
        <div className="driving-recap" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="driving-recap__header">
            <div className="driving-recap__title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber-400)" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Driving Recap</span>
            </div>
            <div className="driving-recap__toggle">
              {(["daily", "weekly", "monthly", "yearly"] as const).map((v) => {
                const isLocked = !isPremium && v !== "daily";
                return (
                  <button
                    key={v}
                    className={`driving-recap__toggle-btn${recapView === v ? " driving-recap__toggle-btn--active" : ""}`}
                    onClick={() => isLocked ? undefined : setRecapView(v)}
                    disabled={isLocked}
                    title={isLocked ? "Upgrade to Pro" : undefined}
                    style={isLocked ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                  >
                    {isLocked ? "\uD83D\uDD12 " : ""}{v === "daily" ? "Day" : v === "weekly" ? "Week" : v === "monthly" ? "Month" : "Year"}
                  </button>
                );
              })}
            </div>
            <button className="driving-recap__share-btn" onClick={() => setShareOpen(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              Share
            </button>
          </div>

          <div className="driving-recap__subtitle">
            {recapView === "daily" && dailyRecap?.label}
            {recapView === "weekly" && weeklyRecap?.label}
            {recapView === "monthly" && monthlyRecap?.label}
            {recapView === "yearly" && stats && `Tax Year ${stats.taxYear}`}
          </div>

          {(() => {
            const recapSource = recapView === "daily" ? dailyRecap : recapView === "weekly" ? weeklyRecap : recapView === "monthly" ? monthlyRecap : null;
            const miles = recapView === "yearly" ? (stats?.totalMiles ?? 0) : (recapSource?.totalMiles ?? 0);
            const trips = recapView === "yearly" ? (stats?.totalTrips ?? 0) : (recapSource?.totalTrips ?? 0);
            const avg = trips > 0 ? miles / trips : 0;
            const busiest = recapView !== "yearly" && recapView !== "daily" ? (recapSource?.busiestDayLabel ?? null) : null;
            const busiestMiles = recapView !== "yearly" && recapView !== "daily" ? (recapSource?.busiestDayMiles ?? 0) : 0;
            const equiv = getDistanceEquivalent(miles, stats?.region);

            return (
              <>
                <div className="driving-recap__stats">
                  <div className="driving-recap__stat">
                    <div className="driving-recap__stat-value">{formatMiles(miles)}</div>
                    <div className="driving-recap__stat-label">miles</div>
                  </div>
                  <div className="driving-recap__stat-divider" />
                  <div className="driving-recap__stat">
                    <div className="driving-recap__stat-value">{trips}</div>
                    <div className="driving-recap__stat-label">{trips === 1 ? "trip" : "trips"}</div>
                  </div>
                  <div className="driving-recap__stat-divider" />
                  <div className="driving-recap__stat">
                    <div className="driving-recap__stat-value">{avg < 10 ? avg.toFixed(1) : Math.round(avg)}</div>
                    <div className="driving-recap__stat-label">avg mi</div>
                  </div>
                </div>

                <div className="driving-recap__insights">
                  {busiest && (
                    <div className="driving-recap__insight">
                      <span className="driving-recap__insight-icon driving-recap__insight-icon--amber">&#9733;</span>
                      <span>Busiest day: <strong>{busiest}</strong> ({formatMiles(busiestMiles ?? 0)} mi)</span>
                    </div>
                  )}
                  {equiv && (
                    <div className="driving-recap__insight">
                      <span className="driving-recap__insight-icon driving-recap__insight-icon--amber">&#8599;</span>
                      <span>{equiv}</span>
                    </div>
                  )}
                </div>

                <RecapShareModal
                  open={shareOpen}
                  onClose={() => setShareOpen(false)}
                  period={recapView === "yearly" ? "yearly" : recapView}
                  label={recapView === "daily" ? (dailyRecap?.label ?? "Today")
                    : recapView === "weekly" ? (weeklyRecap?.label ?? "This Week")
                    : recapView === "monthly" ? (monthlyRecap?.label ?? "This Month")
                    : `Tax Year ${stats?.taxYear ?? ""}`}
                  miles={miles}
                  trips={trips}
                  deductionPence={0}
                  totalMiles={stats?.totalMiles ?? 0}
                  busiestDay={busiest}
                  busiestDayMiles={busiestMiles}
                  equiv={equiv}
                  region={stats?.region}
                />
              </>
            );
          })()}
        </div>
      )}

      {/* Driving Patterns */}
      {stats?.drivingPatterns && (
        <div className="driving-patterns" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="driving-patterns__header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--amber-400)" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
            <span>Driving Patterns</span>
          </div>

          <div className="driving-patterns__grid">
            {/* Day of week */}
            <div className="driving-patterns__section">
              <div className="driving-patterns__section-title">Busiest Days</div>
              <div className="driving-patterns__days">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => {
                  const max = Math.max(...stats.drivingPatterns!.dayOfWeek);
                  const pct = max > 0 ? (stats.drivingPatterns!.dayOfWeek[i] / max) * 100 : 0;
                  return (
                    <div key={day} className="driving-patterns__day">
                      <div className="driving-patterns__day-bar-wrap">
                        <div className="driving-patterns__day-bar" style={{ height: `${Math.max(4, pct)}%` }} />
                      </div>
                      <span className="driving-patterns__day-label">{day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Time of day */}
            <div className="driving-patterns__section">
              <div className="driving-patterns__section-title">Peak Hours</div>
              <div className="driving-patterns__times">
                {[
                  { label: "Night", range: "00–04", icon: "🌙" },
                  { label: "Early", range: "04–08", icon: "🌅" },
                  { label: "Morning", range: "08–12", icon: "☀️" },
                  { label: "Afternoon", range: "12–16", icon: "🌤️" },
                  { label: "Evening", range: "16–20", icon: "🌆" },
                  { label: "Late", range: "20–24", icon: "🌃" },
                ].map((slot, i) => {
                  const max = Math.max(...stats.drivingPatterns!.timeOfDay);
                  const pct = max > 0 ? (stats.drivingPatterns!.timeOfDay[i] / max) * 100 : 0;
                  const isPeak = stats.drivingPatterns!.timeOfDay[i] === max && max > 0;
                  return (
                    <div key={slot.label} className={`driving-patterns__time${isPeak ? " driving-patterns__time--peak" : ""}`}>
                      <span className="driving-patterns__time-icon">{slot.icon}</span>
                      <div className="driving-patterns__time-bar-wrap">
                        <div className="driving-patterns__time-bar" style={{ width: `${Math.max(4, pct)}%` }} />
                      </div>
                      <span className="driving-patterns__time-count">{stats.drivingPatterns!.timeOfDay[i]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="driving-patterns__stats">
            <div className="driving-patterns__stat">
              <span className="driving-patterns__stat-value">{stats.drivingPatterns.avgTripsPerWeek}</span>
              <span className="driving-patterns__stat-label">trips/week avg</span>
            </div>
          </div>

          {/* Top Places */}
          {stats.drivingPatterns.topPlaces.length > 0 && (
            <div className="driving-patterns__places">
              <div className="driving-patterns__section-title">Most Visited</div>
              {stats.drivingPatterns.topPlaces.map((place, i) => (
                <div key={i} className="driving-patterns__place">
                  <span className="driving-patterns__place-rank">{i + 1}</span>
                  <span className="driving-patterns__place-name">{place.name}</span>
                  <span className="driving-patterns__place-count">{place.count} {place.count === 1 ? "trip" : "trips"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Achievements */}
      <Card
        title={`Achievements (${achievements.length}/${ACHIEVEMENT_TYPES.length})`}
        style={{ marginBottom: "var(--dash-gap)" }}
      >
        <div className="achievement-grid">
          {ACHIEVEMENT_TYPES.map((type) => {
            const meta = ACHIEVEMENT_META[type];
            if (!meta) return null;
            const isEarned = earnedTypes.has(type);
            const ach = achievements.find((a) => a.type === type);
            const isFree = freeSet.has(type);
            const isLocked = !isPremium && !isFree;

            return (
              <div
                key={type}
                className={`achievement ${isEarned && !isLocked ? "achievement--earned" : "achievement--locked"}`}
                style={isLocked ? { opacity: 0.25 } : undefined}
              >
                <div className="achievement__emoji">{isLocked ? "\uD83D\uDD12" : meta.emoji}</div>
                <div className="achievement__name">{meta.label}</div>
                <div className="achievement__desc">{isLocked ? "Pro feature" : meta.description}</div>
                {isEarned && !isLocked && ach && (
                  <div className="achievement__date">
                    {new Date(ach.achievedAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Personal Records — premium */}
      {isPremium && stats && stats.personalRecords && stats.personalRecords.mostMilesInDay > 0 && (
        <Card title="Personal Records" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="stats-grid">
            {[
              { label: "Best Day", value: `${stats.personalRecords.mostMilesInDay.toFixed(1)} mi` },
              { label: "Most Trips/Shift", value: String(stats.personalRecords.mostTripsInShift) },
              { label: "Longest Trip", value: `${stats.personalRecords.longestSingleTrip.toFixed(1)} mi` },
              { label: "Best Streak", value: `${stats.personalRecords.longestStreakDays}d` },
            ].map((item) => (
              <div key={item.label} className="stat-card">
                <div className="stat-card__value stat-card__value--amber">{item.value}</div>
                <div className="stat-card__label">{item.label}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Fuel & Running Costs */}
      {(() => {
        const monthMiles = monthlyRecap?.totalMiles ?? weeklyRecap?.totalMiles ?? 0;
        const fuelSpendPence = fuelLogs.reduce((sum, l) => sum + l.costPence, 0);
        const fuelLitres = fuelLogs.reduce((sum, l) => sum + l.litres, 0);
        const primary = vehicles.find((v) => v.isPrimary) ?? vehicles[0];
        const mpg = primary?.estimatedMpg ?? primary?.actualMpg ?? 35;
        const LITRES_PER_GALLON = 4.54609;
        const fuelType = primary?.fuelType ?? "petrol";
        const ppl = fuelLitres > 0
          ? Math.round(fuelSpendPence / fuelLitres)
          : fuelType === "diesel" ? 145 : 138;

        // Estimated cost if no fuel logs
        const estimatedGallons = monthMiles / mpg;
        const estimatedLitres = estimatedGallons * LITRES_PER_GALLON;
        const estimatedCostPence = Math.round(estimatedLitres * ppl);

        const costPerMile = monthMiles > 0 && fuelSpendPence > 0
          ? (fuelSpendPence / monthMiles / 100).toFixed(2)
          : monthMiles > 0
          ? (estimatedCostPence / monthMiles / 100).toFixed(2)
          : null;

        const displayCost = fuelSpendPence > 0 ? fuelSpendPence : estimatedCostPence;
        const isEstimate = fuelSpendPence === 0;
        const monthLabel = new Date().toLocaleDateString("en-GB", { month: "long" });

        return (
          <Card
            title="Fuel & Running Costs"
            subtitle={isEstimate && monthMiles > 0 ? `Estimated for ${monthLabel}` : monthLabel}
            action={
              <Link href="/dashboard/fuel" className="btn btn--ghost btn--sm">
                Fuel logs
              </Link>
            }
            style={{ marginBottom: "var(--dash-gap)" }}
          >
            {monthMiles < 1 && fuelLogs.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Start driving and logging fill-ups to see your running costs here.
              </p>
            ) : (
              <>
                <div className="stats-grid" style={{ marginBottom: fuelLogs.length > 0 ? "1rem" : 0 }}>
                  <div className="stat-card">
                    <div className="stat-card__value stat-card__value--amber">
                      {isEstimate ? "~" : ""}{"\u00A3"}{(displayCost / 100).toFixed(2)}
                    </div>
                    <div className="stat-card__label">
                      {isEstimate ? "Est. Fuel Cost" : "Fuel Spend"}
                    </div>
                  </div>
                  {costPerMile && (
                    <div className="stat-card">
                      <div className="stat-card__value">{"\u00A3"}{costPerMile}</div>
                      <div className="stat-card__label">Per Mile</div>
                    </div>
                  )}
                  <div className="stat-card">
                    <div className="stat-card__value">{mpg}</div>
                    <div className="stat-card__label">
                      {primary?.estimatedMpg || primary?.actualMpg ? "MPG" : "Est. MPG"}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card__value">{fuelTotal}</div>
                    <div className="stat-card__label">Fill-ups</div>
                  </div>
                </div>

                {fuelLogs.length > 0 && (
                  <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Station</th>
                          <th>Litres</th>
                          <th>Cost</th>
                          <th className="hide-mobile">Cost/L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fuelLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: "nowrap" }}>
                              {new Date(log.loggedAt).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                              })}
                            </td>
                            <td style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {log.stationName || <span style={{ color: "var(--text-faint)" }}>&mdash;</span>}
                            </td>
                            <td>{log.litres.toFixed(1)}L</td>
                            <td style={{ fontWeight: 600 }}>{formatPence(log.costPence)}</td>
                            <td className="hide-mobile">
                              {(log.costPence / log.litres / 100).toFixed(1)}p/L
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {isEstimate && monthMiles > 0 && (
                  <p style={{
                    color: "var(--text-muted)",
                    fontSize: "0.75rem",
                    marginTop: "0.75rem",
                    lineHeight: 1.5,
                  }}>
                    Based on {mpg} MPG and {(ppl / 100).toFixed(1)}p/L average.{" "}
                    <Link href="/dashboard/fuel" style={{ color: "var(--amber-400)" }}>
                      Log a fill-up
                    </Link>
                    {" "}for accurate costs.
                  </p>
                )}
              </>
            )}
          </Card>
        );
      })()}

      {/* Recent Personal Trips */}
      {recentTrips.length > 0 && (
        <Card
          title="Recent Trips"
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
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {trip.startAddress || "Unknown"} &rarr; {trip.endAddress || "Unknown"}
                    </td>
                    <td>{trip.distanceMiles?.toFixed(1) || "0"} mi</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Premium upgrade teaser */}
      {!isPremium && (
        <div className="premium-gate" style={{ marginTop: "var(--dash-gap)" }}>
          <div className="premium-gate__icon">&#9888;</div>
          <h2 className="premium-gate__title">Unlock More Insights</h2>
          <p className="premium-gate__text">
            Driving recaps, personal records, all {ACHIEVEMENT_TYPES.length} achievements, and detailed analytics are available with MileClear Pro.
          </p>
          <a href="/dashboard/settings" className="btn btn--primary">Upgrade to Pro</a>
        </div>
      )}
    </>
  );
}
