"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { DashboardSkeleton } from "../../components/ui/LoadingSkeleton";
import type {
  GamificationStats,
  AchievementWithMeta,
  PeriodRecap,
  Trip,
  PaginatedResponse,
} from "@mileclear/shared";
import {
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_META,
  getDistanceEquivalent,
} from "@mileclear/shared";

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

type RecapView = "daily" | "weekly" | "monthly" | "yearly";

export default function DashboardPage() {
  const { user } = useAuth();
  const isPremium = user?.isPremium ?? false;
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [achievements, setAchievements] = useState<AchievementWithMeta[]>([]);
  const [dailyRecap, setDailyRecap] = useState<PeriodRecap | null>(null);
  const [weeklyRecap, setWeeklyRecap] = useState<PeriodRecap | null>(null);
  const [monthlyRecap, setMonthlyRecap] = useState<PeriodRecap | null>(null);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recapView, setRecapView] = useState<RecapView>("daily");

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, achRes, dailyRes, tripsRes] = await Promise.all([
          api.get<{ data: GamificationStats }>("/gamification/stats"),
          api.get<{ data: AchievementWithMeta[] }>("/gamification/achievements"),
          api.get<{ data: PeriodRecap }>("/gamification/recap?period=daily"),
          api.get<PaginatedResponse<Trip>>("/trips/?pageSize=5"),
        ]);
        setStats(statsRes.data);
        setAchievements(achRes.data);
        setDailyRecap(dailyRes.data);
        setRecentTrips(tripsRes.data);

        // Weekly/monthly recaps require premium
        if (isPremium) {
          const [weeklyRes, monthlyRes] = await Promise.all([
            api.get<{ data: PeriodRecap }>("/gamification/recap?period=weekly").catch(() => null),
            api.get<{ data: PeriodRecap }>("/gamification/recap?period=monthly").catch(() => null),
          ]);
          if (weeklyRes) setWeeklyRecap(weeklyRes.data);
          if (monthlyRes) setMonthlyRecap(monthlyRes.data);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isPremium]);

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="alert alert--error">{error}</div>
      </>
    );
  }

  const earnedTypes = new Set(achievements.map((a) => a.type));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your driving overview" />

      {/* Tax Deduction Hero */}
      {stats && (
        <div className="hero-card" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="hero-card__label">
            Tax Deduction ({stats.taxYear})
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

      {/* Stats Grid */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
          {[
            { label: "Today", value: `${formatMiles(stats.todayMiles)} mi` },
            { label: "This Week", value: `${formatMiles(stats.weekMiles)} mi` },
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

      {/* Driving Recap */}
      {(dailyRecap || weeklyRecap || monthlyRecap || stats) && (
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
                const locked = !isPremium && (v === "weekly" || v === "monthly" || v === "yearly");
                return (
                  <button
                    key={v}
                    className={`driving-recap__toggle-btn${recapView === v ? " driving-recap__toggle-btn--active" : ""}${locked ? " driving-recap__toggle-btn--locked" : ""}`}
                    onClick={() => !locked && setRecapView(v)}
                    disabled={locked}
                    title={locked ? "Upgrade to Pro" : undefined}
                  >
                    {v === "daily" ? "Today" : v === "weekly" ? "Week" : v === "monthly" ? "Month" : "Year"}
                    {locked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 3 }}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="driving-recap__subtitle">
            {recapView === "daily" && dailyRecap?.label}
            {recapView === "weekly" && weeklyRecap?.label}
            {recapView === "monthly" && monthlyRecap?.label}
            {recapView === "yearly" && stats && `Tax Year ${stats.taxYear}`}
          </div>

          {/* Stats grid */}
          {(() => {
            const recapSource = recapView === "daily" ? dailyRecap : recapView === "weekly" ? weeklyRecap : recapView === "monthly" ? monthlyRecap : null;
            const miles = recapView === "yearly" ? (stats?.totalMiles ?? 0) : (recapSource?.totalMiles ?? 0);
            const trips = recapView === "yearly" ? (stats?.totalTrips ?? 0) : (recapSource?.totalTrips ?? 0);
            const avg = trips > 0 ? miles / trips : 0;
            const deduction = recapView === "yearly" ? (stats?.deductionPence ?? 0) : (recapSource?.deductionPence ?? 0);
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
                      <span className="driving-recap__insight-icon driving-recap__insight-icon--amber">★</span>
                      <span>Busiest day: <strong>{busiest}</strong> ({formatMiles(busiestMiles ?? 0)} mi)</span>
                    </div>
                  )}

                  {recapView === "yearly" && stats && stats.businessMiles > 0 && (
                    <div className="driving-recap__insight">
                      <span className="driving-recap__insight-icon driving-recap__insight-icon--green">✓</span>
                      <span>{formatMiles(stats.businessMiles)} business miles claimed</span>
                    </div>
                  )}

                  {deduction > 0 && (
                    <div className="driving-recap__insight">
                      <span className="driving-recap__insight-icon driving-recap__insight-icon--green">£</span>
                      <span>{formatPence(deduction)} HMRC deduction{recapView === "yearly" ? " so far" : ""}</span>
                    </div>
                  )}

                  {equiv && (
                    <div className="driving-recap__insight">
                      <span className="driving-recap__insight-icon driving-recap__insight-icon--amber">↗</span>
                      <span>{equiv}</span>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Recent Trips */}
      {recentTrips.length > 0 && (
        <Card
          title="Recent Trips"
          action={
            <Link href="/dashboard/trips" className="btn btn--ghost btn--sm">
              View all
            </Link>
          }
          style={{ marginBottom: "var(--dash-gap)" }}
        >
          <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Route</th>
                  <th>Distance</th>
                  <th>Type</th>
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
                      {trip.startAddress || "Unknown"} → {trip.endAddress || "Unknown"}
                    </td>
                    <td>{trip.distanceMiles?.toFixed(1) || "0"} mi</td>
                    <td>
                      <Badge variant={trip.classification === "business" ? "business" : "personal"}>
                        {trip.classification}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Achievements */}
      <Card
        title={`Achievements (${achievements.length}/${ACHIEVEMENT_TYPES.length})`}
        action={
          achievements.length > 8 ? (
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Scroll to see all
            </span>
          ) : undefined
        }
        style={{ marginBottom: "var(--dash-gap)" }}
      >
        <div className="achievement-grid">
          {ACHIEVEMENT_TYPES.map((type) => {
            const meta = ACHIEVEMENT_META[type];
            if (!meta) return null;
            const isEarned = earnedTypes.has(type);
            const ach = achievements.find((a) => a.type === type);

            return (
              <div
                key={type}
                className={`achievement ${isEarned ? "achievement--earned" : "achievement--locked"}`}
              >
                <div className="achievement__emoji">{meta.emoji}</div>
                <div className="achievement__name">{meta.label}</div>
                <div className="achievement__desc">{meta.description}</div>
                {isEarned && ach && (
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

      {/* Personal Records */}
      {stats && stats.personalRecords && stats.personalRecords.mostMilesInDay > 0 && (
        <Card title="Personal Records">
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
    </>
  );
}
