"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
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
} from "@mileclear/shared";

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

export default function DashboardPage() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [achievements, setAchievements] = useState<AchievementWithMeta[]>([]);
  const [recap, setRecap] = useState<PeriodRecap | null>(null);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, achRes, recapRes, tripsRes] = await Promise.all([
          api.get<{ data: GamificationStats }>("/gamification/stats"),
          api.get<{ data: AchievementWithMeta[] }>("/gamification/achievements"),
          api.get<{ data: PeriodRecap }>("/gamification/recap?period=weekly"),
          api.get<PaginatedResponse<Trip>>("/trips/?pageSize=5"),
        ]);
        setStats(statsRes.data);
        setAchievements(achRes.data);
        setRecap(recapRes.data);
        setRecentTrips(tripsRes.data);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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

      {/* Weekly Recap */}
      {recap && (
        <Card
          title="Weekly Recap"
          subtitle={recap.label}
          className=""
          style={{ marginBottom: "var(--dash-gap)" }}
        >
          <div className="recap-grid">
            <div className="recap-stat">
              <div className="recap-stat__value">{formatMiles(recap.totalMiles)} mi</div>
              <div className="recap-stat__label">Total</div>
            </div>
            <div className="recap-stat">
              <div className="recap-stat__value">{recap.totalTrips}</div>
              <div className="recap-stat__label">Trips</div>
            </div>
            <div className="recap-stat">
              <div className="recap-stat__value">{formatPence(recap.deductionPence)}</div>
              <div className="recap-stat__label">Deduction</div>
            </div>
          </div>
          {recap.busiestDayLabel && (
            <div className="recap-note">
              Busiest day: {recap.busiestDayLabel} ({formatMiles(recap.busiestDayMiles)} mi)
            </div>
          )}
        </Card>
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
