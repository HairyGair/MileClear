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
} from "@mileclear/shared";

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

export default function BusinessPage() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [monthlyRecap, setMonthlyRecap] = useState<PeriodRecap | null>(null);
  const [recentTrips, setRecentTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, recapRes, tripsRes] = await Promise.all([
          api.get<{ data: GamificationStats }>("/gamification/stats"),
          api.get<{ data: PeriodRecap }>("/gamification/recap?period=monthly"),
          api.get<PaginatedResponse<Trip>>("/trips/?pageSize=5&classification=business"),
        ]);
        setStats(statsRes.data);
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

  if (loading) return <DashboardSkeleton />;

  return (
    <>
      <PageHeader title="Business" subtitle="Tax deductions and business mileage" />

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

      {/* Business Stats Grid */}
      {stats && (
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
                        <Badge variant="business">{trip.platformTag}</Badge>
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
