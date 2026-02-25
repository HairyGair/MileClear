"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Select } from "../../../components/ui/Select";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import { HMRC_RATES } from "@mileclear/shared";

interface GamificationStats {
  taxYear: string;
  deductionPence: number;
  businessMiles: number;
  totalTrips: number;
  totalShifts: number;
}

interface Trip {
  id: string;
  distanceMiles: number;
  classification: string;
  startedAt: string;
  platformTag: string | null;
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
  vehicleType: string;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

function formatMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

function calculateDeduction(miles: number, vehicleType: string = "car"): number {
  if (vehicleType === "motorbike") {
    return Math.round(miles * HMRC_RATES.motorbike.flat);
  }
  const threshold = 10000;
  if (miles <= threshold) {
    return Math.round(miles * HMRC_RATES.car.first10000);
  }
  const firstPortion = threshold * HMRC_RATES.car.first10000;
  const remainder = (miles - threshold) * HMRC_RATES.car.after10000;
  return Math.round(firstPortion + remainder);
}

// UK tax year months: April through March
const TAX_MONTHS = [
  "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "January", "February", "March",
];

function getTaxYearOptions(): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const currentTaxStartYear = month >= 3 ? year : year - 1; // April = month 3
  const options = [];
  for (let i = 0; i < 4; i++) {
    const startYear = currentTaxStartYear - i;
    const endYear = startYear + 1;
    options.push({
      value: `${startYear}-${String(endYear).slice(2)}`,
      label: `${startYear}/${endYear}`,
    });
  }
  return options;
}

interface MonthData {
  month: string;
  trips: number;
  businessMiles: number;
  personalMiles: number;
  deductionPence: number;
}

export default function TaxPage() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taxYear, setTaxYear] = useState(getTaxYearOptions()[0]?.value || "");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Parse tax year to date range
      const startYear = parseInt(taxYear.split("-")[0]);
      const from = new Date(startYear, 3, 6); // April 6
      const to = new Date(startYear + 1, 3, 5, 23, 59, 59); // April 5 next year

      const [statsRes, tripsRes, vehiclesRes] = await Promise.all([
        api.get<{ data: GamificationStats }>("/gamification/stats"),
        api.get<{ data: Trip[]; total: number }>(
          `/trips/?pageSize=1000&from=${from.toISOString()}&to=${to.toISOString()}`
        ),
        api.get<{ data: Vehicle[] }>("/vehicles/"),
      ]);
      setStats(statsRes.data);
      setTrips(tripsRes.data);
      setVehicles(vehiclesRes.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [taxYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Aggregate by month
  const startYear = parseInt(taxYear.split("-")[0]);
  const monthlyData: MonthData[] = TAX_MONTHS.map((month, i) => {
    const monthNum = (i + 3) % 12; // April=3, May=4, ..., March=2
    const year = monthNum >= 3 ? startYear : startYear + 1;

    const monthTrips = trips.filter((t) => {
      const d = new Date(t.startedAt);
      return d.getMonth() === monthNum && d.getFullYear() === year;
    });

    const businessMiles = monthTrips
      .filter((t) => t.classification === "business")
      .reduce((sum, t) => sum + (t.distanceMiles || 0), 0);
    const personalMiles = monthTrips
      .filter((t) => t.classification === "personal")
      .reduce((sum, t) => sum + (t.distanceMiles || 0), 0);

    return {
      month,
      trips: monthTrips.length,
      businessMiles,
      personalMiles,
      deductionPence: calculateDeduction(businessMiles),
    };
  });

  // Totals
  const totalBusinessMiles = trips
    .filter((t) => t.classification === "business")
    .reduce((sum, t) => sum + (t.distanceMiles || 0), 0);
  const totalPersonalMiles = trips
    .filter((t) => t.classification === "personal")
    .reduce((sum, t) => sum + (t.distanceMiles || 0), 0);
  const totalDeduction = calculateDeduction(totalBusinessMiles);

  // Platform breakdown
  const platformMap = new Map<string, { trips: number; miles: number }>();
  for (const trip of trips.filter((t) => t.classification === "business")) {
    const platform = trip.platformTag || "Untagged";
    const existing = platformMap.get(platform) || { trips: 0, miles: 0 };
    existing.trips++;
    existing.miles += trip.distanceMiles || 0;
    platformMap.set(platform, existing);
  }
  const platformBreakdown = Array.from(platformMap.entries())
    .sort((a, b) => b[1].miles - a[1].miles);

  // HMRC rate info
  const rateInfo = totalBusinessMiles <= 10000
    ? "45p per mile (first 10,000)"
    : "45p first 10,000 + 25p thereafter";

  return (
    <>
      <PageHeader
        title="Tax Summary"
        subtitle="HMRC mileage deduction overview"
        action={
          <div style={{ maxWidth: 180 }}>
            <Select
              id="taxYear"
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
              options={getTaxYearOptions()}
            />
          </div>
        }
      />

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="card" count={3} style={{ marginBottom: 12 }} />
      ) : (
        <>
          {/* Hero */}
          <div className="hero-card" style={{ marginBottom: "var(--dash-gap)" }}>
            <div className="hero-card__label">Tax Deduction ({taxYear})</div>
            <div className="hero-card__value">{formatPence(totalDeduction)}</div>
            <div className="hero-card__meta">
              <span>{formatMiles(totalBusinessMiles)} business miles</span>
              <span>{rateInfo}</span>
            </div>
          </div>

          {/* Stats */}
          <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
            <div className="stat-card">
              <div className="stat-card__value stat-card__value--amber">{formatMiles(totalBusinessMiles)} mi</div>
              <div className="stat-card__label">Business Miles</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value">{formatMiles(totalPersonalMiles)} mi</div>
              <div className="stat-card__label">Personal Miles</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value">{trips.length}</div>
              <div className="stat-card__label">Total Trips</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__value stat-card__value--emerald">{formatMiles(totalBusinessMiles + totalPersonalMiles)} mi</div>
              <div className="stat-card__label">All Miles</div>
            </div>
          </div>

          {/* Monthly Breakdown */}
          <Card title="Monthly Breakdown" style={{ marginBottom: "var(--dash-gap)" }}>
            <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Trips</th>
                    <th>Business</th>
                    <th className="hide-mobile">Personal</th>
                    <th>Deduction</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map((m) => (
                    <tr key={m.month}>
                      <td style={{ fontWeight: 500 }}>{m.month}</td>
                      <td>{m.trips}</td>
                      <td>{formatMiles(m.businessMiles)} mi</td>
                      <td className="hide-mobile">{formatMiles(m.personalMiles)} mi</td>
                      <td style={{ fontWeight: 600, color: m.deductionPence > 0 ? "var(--amber-400)" : undefined }}>
                        {m.deductionPence > 0 ? formatPence(m.deductionPence) : "—"}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr style={{ borderTop: "2px solid var(--border-default)" }}>
                    <td style={{ fontWeight: 700 }}>Total</td>
                    <td style={{ fontWeight: 700 }}>{trips.length}</td>
                    <td style={{ fontWeight: 700 }}>{formatMiles(totalBusinessMiles)} mi</td>
                    <td className="hide-mobile" style={{ fontWeight: 700 }}>{formatMiles(totalPersonalMiles)} mi</td>
                    <td style={{ fontWeight: 700, color: "var(--amber-400)" }}>{formatPence(totalDeduction)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Platform Breakdown */}
          {platformBreakdown.length > 0 && (
            <Card title="By Platform" style={{ marginBottom: "var(--dash-gap)" }}>
              <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Trips</th>
                      <th>Miles</th>
                      <th>Deduction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformBreakdown.map(([platform, data]) => (
                      <tr key={platform}>
                        <td>
                          <Badge variant="source">{platform}</Badge>
                        </td>
                        <td>{data.trips}</td>
                        <td>{formatMiles(data.miles)} mi</td>
                        <td style={{ fontWeight: 600, color: "var(--amber-400)" }}>
                          {formatPence(calculateDeduction(data.miles))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Vehicle Breakdown */}
          {vehicles.length > 0 && (
            <Card title="Your Vehicles">
              <div className="table-wrap" style={{ border: "none", background: "transparent" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Type</th>
                      <th>HMRC Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map((v) => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 500 }}>{v.make} {v.model}</td>
                        <td>
                          <Badge variant="source">{v.vehicleType}</Badge>
                        </td>
                        <td>
                          {v.vehicleType === "motorbike" ? "24p/mi flat" : "45p/25p per mile"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
