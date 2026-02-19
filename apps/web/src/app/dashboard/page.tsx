"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type {
  GamificationStats,
  AchievementWithMeta,
  PeriodRecap,
} from "@mileclear/shared";
import {
  ACHIEVEMENT_TYPES,
  ACHIEVEMENT_META,
  type AchievementType,
} from "@mileclear/shared";

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatMiles(miles: number): string {
  return `${miles.toLocaleString("en-GB", { maximumFractionDigits: 1 })} mi`;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [achievements, setAchievements] = useState<AchievementWithMeta[]>([]);
  const [recap, setRecap] = useState<PeriodRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, achRes, recapRes] = await Promise.all([
          api.get<{ data: GamificationStats }>("/gamification/stats"),
          api.get<{ data: AchievementWithMeta[] }>("/gamification/achievements"),
          api.get<{ data: PeriodRecap }>("/gamification/recap?period=weekly"),
        ]);
        setStats(statsRes.data);
        setAchievements(achRes.data);
        setRecap(recapRes.data);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <main style={{ padding: "2rem", color: "#fff" }}>
        <p>Loading dashboard...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ padding: "2rem", color: "#fff" }}>
        <p style={{ color: "#ef4444" }}>{error}</p>
      </main>
    );
  }

  const earnedTypes = new Set(achievements.map((a) => a.type));

  return (
    <main style={{ padding: "2rem", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", marginBottom: "1.5rem" }}>
        Dashboard
      </h1>

      {/* Tax Savings Banner */}
      {stats && (
        <div
          style={{
            background: "#111827",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: "1.5rem",
            border: "1px solid rgba(245, 158, 11, 0.3)",
          }}
        >
          <div style={{ fontSize: "0.75rem", color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
            Tax Deduction ({stats.taxYear})
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#f59e0b", marginBottom: 2 }}>
            {formatPence(stats.deductionPence)}
          </div>
          <div style={{ fontSize: "0.875rem", color: "#9ca3af" }}>
            {formatMiles(stats.businessMiles)} business miles
            {stats.currentStreakDays > 0 && (
              <span style={{ marginLeft: 16, color: "#ef4444" }}>
                {stats.currentStreakDays} day streak
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: "1.5rem",
          }}
        >
          {[
            { label: "Today", value: formatMiles(stats.todayMiles) },
            { label: "This Week", value: formatMiles(stats.weekMiles) },
            { label: "Total Trips", value: String(stats.totalTrips) },
            { label: "Total Shifts", value: String(stats.totalShifts) },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: "#111827",
                borderRadius: 12,
                padding: "1rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                {item.value}
              </div>
              <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Weekly Recap */}
      {recap && (
        <div
          style={{
            background: "#111827",
            borderRadius: 12,
            padding: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: 4 }}>
            Weekly Recap
          </div>
          <div style={{ fontSize: "0.8rem", color: "#9ca3af", marginBottom: 12 }}>
            {recap.label}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>
                {formatMiles(recap.totalMiles)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Total</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>
                {recap.totalTrips}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Trips</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff" }}>
                {formatPence(recap.deductionPence)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Deduction</div>
            </div>
          </div>
          {recap.busiestDayLabel && (
            <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
              Busiest day: {recap.busiestDayLabel} ({formatMiles(recap.busiestDayMiles)})
            </div>
          )}
        </div>
      )}

      {/* Achievements Grid */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: 12 }}>
          Achievements ({achievements.length}/{ACHIEVEMENT_TYPES.length})
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {ACHIEVEMENT_TYPES.map((type) => {
            const meta = ACHIEVEMENT_META[type];
            const isEarned = earnedTypes.has(type);
            const ach = achievements.find((a) => a.type === type);

            return (
              <div
                key={type}
                style={{
                  background: "#111827",
                  borderRadius: 10,
                  padding: "0.75rem",
                  textAlign: "center",
                  opacity: isEarned ? 1 : 0.35,
                }}
              >
                <div style={{ fontSize: "1.75rem", marginBottom: 4 }}>
                  {meta.emoji}
                </div>
                <div
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: isEarned ? "#fff" : "#6b7280",
                    marginBottom: 2,
                  }}
                >
                  {meta.label}
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: isEarned ? "#9ca3af" : "#4b5563",
                  }}
                >
                  {meta.description}
                </div>
                {isEarned && ach && (
                  <div style={{ fontSize: "0.65rem", color: "#f59e0b", marginTop: 4 }}>
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
      </div>

      {/* Personal Records */}
      {stats && stats.personalRecords.mostMilesInDay > 0 && (
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: 12 }}>
            Personal Records
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
            }}
          >
            {[
              { label: "Best Day", value: `${stats.personalRecords.mostMilesInDay.toFixed(1)} mi` },
              { label: "Most Trips/Shift", value: String(stats.personalRecords.mostTripsInShift) },
              { label: "Longest Trip", value: `${stats.personalRecords.longestSingleTrip.toFixed(1)} mi` },
              { label: "Best Streak", value: `${stats.personalRecords.longestStreakDays}d` },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "#111827",
                  borderRadius: 10,
                  padding: "0.75rem",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#fff", marginBottom: 2 }}>
                  {item.value}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#9ca3af" }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
