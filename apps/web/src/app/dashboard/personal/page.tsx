"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { DashboardSkeleton } from "../../../components/ui/LoadingSkeleton";
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
} from "@mileclear/shared";

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function getDistanceEquivalent(miles: number): string | null {
  if (miles < 1) return null;
  if (miles >= 2000) return `Like driving Land\u2019s End to John o\u2019 Groats ${Math.round(miles / 874)} times`;
  if (miles >= 874) return "That\u2019s the length of Britain \u2014 Land\u2019s End to John o\u2019 Groats!";
  if (miles >= 500) return `Like ${Math.round(miles / 210)} trips to Paris from London`;
  if (miles >= 250) return "Equivalent to London to Edinburgh";
  if (miles >= 100) return `About ${Math.round(miles / 60)} London-to-Brighton trips`;
  if (miles >= 50) return `Like driving across London ${Math.round(miles / 15)} times`;
  if (miles >= 20) return `About ${Math.round(miles * 20)} laps of a running track`;
  if (miles >= 5) return `About ${Math.round(miles * 100)} football pitches end-to-end`;
  return null;
}

type RecapView = "weekly" | "monthly" | "yearly";

export default function PersonalPage() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [achievements, setAchievements] = useState<AchievementWithMeta[]>([]);
  const [weeklyRecap, setWeeklyRecap] = useState<PeriodRecap | null>(null);
  const [monthlyRecap, setMonthlyRecap] = useState<PeriodRecap | null>(null);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [recapView, setRecapView] = useState<RecapView>("monthly");

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, achRes, weeklyRes, monthlyRes, tripsRes] = await Promise.all([
          api.get<{ data: GamificationStats }>("/gamification/stats"),
          api.get<{ data: AchievementWithMeta[] }>("/gamification/achievements"),
          api.get<{ data: PeriodRecap }>("/gamification/recap?period=weekly"),
          api.get<{ data: PeriodRecap }>("/gamification/recap?period=monthly"),
          api.get<PaginatedResponse<Trip>>("/trips/?pageSize=5&classification=personal"),
        ]);
        setStats(statsRes.data);
        setAchievements(achRes.data);
        setWeeklyRecap(weeklyRes.data);
        setMonthlyRecap(monthlyRes.data);
        setRecentTrips(tripsRes.data);
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

      {/* Driving Recap */}
      {(weeklyRecap || monthlyRecap || stats) && (
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
              {(["weekly", "monthly", "yearly"] as const).map((v) => (
                <button
                  key={v}
                  className={`driving-recap__toggle-btn${recapView === v ? " driving-recap__toggle-btn--active" : ""}`}
                  onClick={() => setRecapView(v)}
                >
                  {v === "weekly" ? "Week" : v === "monthly" ? "Month" : "Year"}
                </button>
              ))}
            </div>
          </div>

          <div className="driving-recap__subtitle">
            {recapView === "weekly" && weeklyRecap?.label}
            {recapView === "monthly" && monthlyRecap?.label}
            {recapView === "yearly" && stats && `Tax Year ${stats.taxYear}`}
          </div>

          {(() => {
            const miles = recapView === "yearly" ? (stats?.totalMiles ?? 0) : recapView === "monthly" ? (monthlyRecap?.totalMiles ?? 0) : (weeklyRecap?.totalMiles ?? 0);
            const trips = recapView === "yearly" ? (stats?.totalTrips ?? 0) : recapView === "monthly" ? (monthlyRecap?.totalTrips ?? 0) : (weeklyRecap?.totalTrips ?? 0);
            const avg = trips > 0 ? miles / trips : 0;
            const busiest = recapView !== "yearly" ? (recapView === "monthly" ? monthlyRecap?.busiestDayLabel : weeklyRecap?.busiestDayLabel) : null;
            const busiestMiles = recapView !== "yearly" ? (recapView === "monthly" ? monthlyRecap?.busiestDayMiles : weeklyRecap?.busiestDayMiles) : 0;
            const equiv = getDistanceEquivalent(miles);

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
              </>
            );
          })()}
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
    </>
  );
}
