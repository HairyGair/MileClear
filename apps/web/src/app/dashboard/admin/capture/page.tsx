"use client";

// Capture section of the admin area (Sep 2026 redesign).

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import Link from "next/link";
import { AdminPage } from "@/components/admin";
import { LiveActivityHealth } from "@/components/admin/sections/LiveActivityHealth";
import { TripQuality } from "@/components/admin/sections/TripQuality";


interface AutoTripData {
  autoTripsTotal: number;
  autoTripsClassified: number;
  autoTripsUnclassified: number;
  manualTripsTotal: number;
  classificationRatePercent: number;
  usersWithAutoTrips7d: number;
  usersWithPushToken: number;
  detectionAdoptionPercent: number;
  avgTripDurationMinutes: number;
  avgAutoTripDistanceMiles: number;
  dailyAutoTrips: Array<{ date: string; autoCount: number; manualCount: number }>;
}

interface DetectionFleetData {
  engineSplit: {
    nativeOn: number;
    jsEngine: number;
    nativeFresh: number;
    nativeStale: number;
    nativeNever: number;
    dumpsTotal: number;
      dumpWindowDays?: number;
    staleDumpsExcluded?: number;
  };
  quietDrivers: Array<{
    email: string;
    displayName: string | null;
    lastTripAt: string;
    priorTrips: number;
    daysSinceLastTrip: number;
  }>;
  kpis: {
    activeDrivers7d: number;
    autoTrips7d: number;
    manualTrips7d: number;
    autoSharePercent: number;
    shortAutoTrips7d: number;
    shortManualTrips7d: number;
    shortAutoSharePercent: number;
  };
}

function AutoTripsTab() {
  const [data, setData] = useState<AutoTripData | null>(null);
  const [fleet, setFleet] = useState<DetectionFleetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api
        .get<{ data: AutoTripData }>("/admin/auto-trip-health")
        .then((res) => setData(res.data)),
      api
        .get<{ data: DetectionFleetData }>("/admin/detection-fleet")
        .then((res) => setFleet(res.data))
        .catch(() => {}), // fleet view is non-fatal context
    ])
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
          <p className="stat-card__label">Auto Trips (30d)</p>
          <p className="stat-card__value stat-card__value--amber">{data.autoTripsTotal}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Classification Rate</p>
          <p className="stat-card__value" style={{
            color: data.classificationRatePercent >= 70 ? "var(--emerald-400)" : data.classificationRatePercent >= 40 ? "var(--amber-400)" : "var(--dash-red)",
          }}>
            {data.classificationRatePercent}%
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
            {data.autoTripsClassified} classified / {data.autoTripsUnclassified} pending
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Detection Adoption</p>
          <p className="stat-card__value">{data.detectionAdoptionPercent}%</p>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>
            {data.usersWithAutoTrips7d} of {data.usersWithPushToken} with app
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Manual Trips (30d)</p>
          <p className="stat-card__value">{data.manualTripsTotal}</p>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="stat-card">
          <p className="stat-card__label">Avg Duration</p>
          <p className="stat-card__value">{data.avgTripDurationMinutes} min</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Avg Distance</p>
          <p className="stat-card__value">{data.avgAutoTripDistanceMiles} mi</p>
        </div>
      </div>

      {fleet && (
        <>
          <h3 style={{ fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", margin: "1rem 0 -0.25rem" }}>
            Fleet detection health
          </h3>
          <div className="stats-grid">
            <div className="stat-card">
              <p className="stat-card__label">Active Drivers (7d)</p>
              <p className="stat-card__value stat-card__value--amber">{fleet.kpis.activeDrivers7d}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Auto Share (7d)</p>
              <p className="stat-card__value" style={{ color: fleet.kpis.autoSharePercent >= 60 ? "var(--emerald-400)" : "var(--amber-400)" }}>{fleet.kpis.autoSharePercent}%</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>{fleet.kpis.autoTrips7d} auto / {fleet.kpis.manualTrips7d} manual</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Native Engine</p>
              <p className="stat-card__value">{fleet.engineSplit.nativeOn}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>vs {fleet.engineSplit.jsEngine} JS · {fleet.engineSplit.dumpsTotal} dumps in {fleet.engineSplit.dumpWindowDays ?? 14}d{fleet.engineSplit.staleDumpsExcluded ? ` (${fleet.engineSplit.staleDumpsExcluded} older excluded)` : ""}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Native Healthy</p>
              <p className="stat-card__value" style={{ color: fleet.engineSplit.nativeStale + fleet.engineSplit.nativeNever === 0 ? "var(--emerald-400)" : "var(--amber-400)" }}>{fleet.engineSplit.nativeFresh}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>{fleet.engineSplit.nativeStale} stale / {fleet.engineSplit.nativeNever} no fix</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Short-trip Auto-share (7d)</p>
              <p className="stat-card__value" style={{ color: fleet.kpis.shortAutoSharePercent >= 70 ? "var(--emerald-400)" : fleet.kpis.shortAutoSharePercent >= 50 ? "var(--amber-400)" : "var(--dash-red)" }}>{fleet.kpis.shortAutoSharePercent}%</p>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}>&lt;2mi · {fleet.kpis.shortAutoTrips7d} auto / {fleet.kpis.shortManualTrips7d} manual</p>
            </div>
          </div>

          <Card title={`Drivers gone quiet (${fleet.quietDrivers.length})`}>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
              Were capturing (≥3 auto-trips in the prior 30→7 days) but have recorded nothing in the last 7 days - the silent-capture-failure / churn signal.
            </p>
            {fleet.quietDrivers.length === 0 ? (
              <p style={{ fontSize: "0.875rem", color: "var(--emerald-400)" }}>None - every recently-active driver is still capturing.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Driver</th><th style={{ textAlign: "right" }}>Prior trips</th><th style={{ textAlign: "right" }}>Last trip</th><th style={{ textAlign: "right" }}>Quiet for</th></tr></thead>
                  <tbody>
                    {fleet.quietDrivers.map((q) => (
                      <tr key={q.email}>
                        <td>{q.displayName || q.email}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{q.priorTrips}</td>
                        <td style={{ textAlign: "right" }}>{new Date(q.lastTripAt).toLocaleDateString("en-GB")}</td>
                        <td style={{ textAlign: "right", fontWeight: 600, color: q.daysSinceLastTrip >= 10 ? "var(--dash-red)" : "var(--amber-400)" }}>{q.daysSinceLastTrip}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* The old "native engine needs attention" panel (stale
              lastNativeLocationAt) was removed 10 Jun 2026 - it false-flagged
              parked devices and missed real silent non-capture (the metric
              refreshes on every app open). Capture-outcome health lives on
              the dedicated page: */}
          <Card title="Per-device capture health">
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
              Capture counts, trigger signatures and silent non-capture flags for every
              native-engine device are on{" "}
              <a href="/dashboard/admin/cleartrack" style={{ color: "var(--amber-400)" }}>
                ClearTrack Capture Health →
              </a>
            </p>
          </Card>
        </>
      )}

      {data.dailyAutoTrips.length > 0 && (
        <Card title="Daily Breakdown (7d)">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Auto</th>
                  <th style={{ textAlign: "right" }}>Manual</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyAutoTrips.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--amber-400)" }}>{row.autoCount}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.manualCount}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{row.autoCount + row.manualCount}</td>
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


export default function AdminAutoTripsTabPage() {
  return (
    <AdminPage title="Capture" intro="Is the fleet recording drives? Engine health, activation and ClearTrack.">
      <p className="admin-page__intro">Also in this section: <Link href="/dashboard/admin/activation" className="admin-nav__item">Activation</Link> <Link href="/dashboard/admin/cleartrack" className="admin-nav__item">ClearTrack</Link></p>
      <TripQuality />
      <LiveActivityHealth />
      <AutoTripsTab />
    </AdminPage>
  );
}
