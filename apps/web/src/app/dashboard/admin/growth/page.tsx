"use client";

// Growth section of the admin area (Sep 2026 redesign).

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import Link from "next/link";
import { AdminPage } from "@/components/admin";


// ---------------------------------------------------------------------------
// Engagement Tab
// ---------------------------------------------------------------------------

interface EngagementData {
  dau: number;
  wau: number;
  mau: number;
  totalUsers: number;
  usersWithZeroTrips: number;
  retentionCurve: Array<{
    month: string;
    signups: number;
    retainedCount: number;
    retentionPercent: number;
  }>;
  recentlyActive: Array<{
    userId: string;
    email: string;
    displayName: string | null;
    lastTripAt: string;
    tripCount: number;
  }>;
}

function EngagementTab() {
  const [data, setData] = useState<EngagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: EngagementData }>("/admin/engagement")
      .then((res) => setData(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="card" count={2} style={{ height: 90 }} />;
  if (error) return <div className="alert alert--error">{error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">DAU</p>
          <p className="stat-card__value stat-card__value--emerald">{data.dau}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">WAU</p>
          <p className="stat-card__value">{data.wau}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">MAU</p>
          <p className="stat-card__value">{data.mau}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Zero Trips</p>
          <p className="stat-card__value" style={{ color: data.usersWithZeroTrips > 0 ? "var(--dash-red)" : undefined }}>
            {data.usersWithZeroTrips}
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
            of {data.totalUsers} users
          </p>
        </div>
      </div>

      {/* Retention curve */}
      {data.retentionCurve.length > 0 && (
        <Card title="Retention by Signup Month">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cohort</th>
                  <th style={{ textAlign: "right" }}>Signups</th>
                  <th style={{ textAlign: "right" }}>Active (30d)</th>
                  <th style={{ textAlign: "right" }}>Retention</th>
                </tr>
              </thead>
              <tbody>
                {data.retentionCurve.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.signups}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.retainedCount}</td>
                    <td style={{
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 500,
                      color: row.retentionPercent >= 50 ? "var(--emerald-400)" : row.retentionPercent >= 25 ? "var(--amber-400)" : "var(--dash-red)",
                    }}>
                      {row.retentionPercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recently active */}
      {data.recentlyActive.length > 0 && (
        <Card title="Recently Active Users">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th style={{ textAlign: "right" }}>Trips</th>
                  <th>Last Active</th>
                </tr>
              </thead>
              <tbody>
                {data.recentlyActive.map((u) => (
                  <tr key={u.userId}>
                    <td style={{ fontSize: "0.875rem" }}>{u.email}</td>
                    <td style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{u.displayName || "-"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{u.tripCount}</td>
                    <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {new Date(u.lastTripAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-trip Health Tab
// ---------------------------------------------------------------------------


export default function AdminEngagementTabPage() {
  return (
    <AdminPage title="Growth" intro="Engagement, retention and the activation funnel.">
      <p className="admin-page__intro">Also in this section: <Link href="/dashboard/admin/funnel" className="admin-nav__item">Funnel</Link> <Link href="/dashboard/admin/geographic-density" className="admin-nav__item">Geographic density</Link> <Link href="/dashboard/admin/insights" className="admin-nav__item">Insights</Link></p>
      <EngagementTab />
    </AdminPage>
  );
}
