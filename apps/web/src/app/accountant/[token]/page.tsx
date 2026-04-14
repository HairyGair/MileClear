"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { formatPence, formatMiles } from "@mileclear/shared";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

// ── Types ────────────────────────────────────────────────────────────

interface TripSummary {
  totalTrips: number;
  totalMiles: number;
  businessMiles: number;
  personalMiles: number;
  businessTrips: number;
  personalTrips: number;
}

interface VehicleDeduction {
  vehicleId: string;
  make: string;
  model: string;
  vehicleType: string;
  businessMiles: number;
  deductionPence: number;
}

interface MileageDeduction {
  taxYear: string;
  totalBusinessMiles: number;
  totalDeductionPence: number;
  byVehicle: VehicleDeduction[];
}

interface ExpenseRow {
  category: string;
  amountPence: number;
  isDeductible: boolean;
}

interface PlatformEarning {
  platform: string;
  amountPence: number;
  count: number;
}

interface AccountantDashboardData {
  userName: string;
  taxYear: string;
  generatedAt: string;
  tripSummary: TripSummary;
  mileageDeduction: MileageDeduction;
  expensesByCategory: ExpenseRow[];
  earningsByPlatform: PlatformEarning[];
}

// ── Tax year helper ──────────────────────────────────────────────────

function getTaxYearOptions(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  return Array.from({ length: 4 }, (_, i) => {
    const y = startYear - i;
    return `${y}-${String(y + 1).slice(2)}`;
  });
}

// ── Skeleton ─────────────────────────────────────────────────────────

function Skeleton({ height = 120, style }: { height?: number; style?: React.CSSProperties }) {
  return (
    <div
      className="accountant-skeleton"
      style={{ height, borderRadius: 12, ...style }}
    />
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function AccountantDashboardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const taxYearOptions = getTaxYearOptions();
  const [selectedYear, setSelectedYear] = useState(taxYearOptions[0]);
  const [data, setData] = useState<AccountantDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"invalid" | "expired" | "network" | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`${API_URL}/accountant/dashboard/${token}?taxYear=${encodeURIComponent(selectedYear)}`)
      .then(async (res) => {
        if (res.status === 404 || res.status === 401) {
          setError("invalid");
          return;
        }
        if (res.status === 410) {
          setError("expired");
          return;
        }
        if (!res.ok) {
          setError("network");
          return;
        }
        const json = await res.json();
        setData(json.data ?? json);
      })
      .catch(() => setError("network"))
      .finally(() => setLoading(false));
  }, [token, selectedYear]);

  const exportUrl = (format: "csv" | "pdf") =>
    `${API_URL}/accountant/export/${token}?format=${format}&taxYear=${encodeURIComponent(selectedYear)}`;

  // ── Error states ─────────────────────────────────────────────────

  if (!loading && error === "invalid") {
    return (
      <div className="accountant-error">
        <div className="accountant-error__icon">&#128683;</div>
        <h1 className="accountant-error__title">Link not found</h1>
        <p className="accountant-error__desc">
          This accountant access link is invalid. Please ask your client to send a new invite from their MileClear dashboard.
        </p>
      </div>
    );
  }

  if (!loading && error === "expired") {
    return (
      <div className="accountant-error">
        <div className="accountant-error__icon">&#8987;</div>
        <h1 className="accountant-error__title">Link expired</h1>
        <p className="accountant-error__desc">
          This accountant access link has expired. Please ask your client to send a new invite from their MileClear dashboard.
        </p>
      </div>
    );
  }

  if (!loading && error === "network") {
    return (
      <div className="accountant-error">
        <div className="accountant-error__icon">&#9888;</div>
        <h1 className="accountant-error__title">Something went wrong</h1>
        <p className="accountant-error__desc">
          Could not load the accountant dashboard. Please try refreshing the page.
        </p>
        <button
          className="accountant-btn accountant-btn--primary"
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="accountant-dashboard">
        <div className="accountant-toolbar">
          <Skeleton height={32} style={{ width: 220 }} />
          <Skeleton height={36} style={{ width: 140 }} />
        </div>
        <div className="accountant-grid accountant-grid--4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
        <div className="accountant-grid accountant-grid--2">
          <Skeleton height={200} />
          <Skeleton height={200} />
        </div>
        <Skeleton height={180} />
        <Skeleton height={180} />
      </div>
    );
  }

  if (!data) return null;

  const {
    userName,
    taxYear,
    tripSummary: trips,
    mileageDeduction: deduction,
    expensesByCategory: expenses,
    earningsByPlatform: earnings,
  } = data;

  const businessPct =
    trips.totalMiles > 0
      ? Math.round((trips.businessMiles / trips.totalMiles) * 100)
      : 0;

  const totalEarningsPence = earnings.reduce((s, e) => s + e.amountPence, 0);

  return (
    <div className="accountant-dashboard">
      {/* Toolbar */}
      <div className="accountant-toolbar">
        <div className="accountant-toolbar__left">
          <h1 className="accountant-toolbar__name">{userName}</h1>
          <p className="accountant-toolbar__sub">Tax year {taxYear}</p>
        </div>
        <div className="accountant-toolbar__right">
          <select
            className="accountant-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            aria-label="Select tax year"
          >
            {taxYearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <a
            href={exportUrl("pdf")}
            className="accountant-btn accountant-btn--secondary"
            download
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v7m0 0l-2.5-2.5M7 8l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 10v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            PDF
          </a>
          <a
            href={exportUrl("csv")}
            className="accountant-btn accountant-btn--primary"
            download
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1v7m0 0l-2.5-2.5M7 8l2.5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M1 10v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            CSV
          </a>
        </div>
      </div>

      {/* Trip Summary */}
      <section className="accountant-section">
        <h2 className="accountant-section__title">Trip Summary</h2>
        <div className="accountant-grid accountant-grid--4">
          <div className="accountant-card">
            <div className="accountant-stat">{trips.totalTrips}</div>
            <div className="accountant-stat__label">Total Trips</div>
          </div>
          <div className="accountant-card">
            <div className="accountant-stat accountant-stat--amber">
              {formatMiles(trips.totalMiles)} mi
            </div>
            <div className="accountant-stat__label">Total Miles</div>
          </div>
          <div className="accountant-card">
            <div className="accountant-stat accountant-stat--amber">
              {formatMiles(trips.businessMiles)} mi
            </div>
            <div className="accountant-stat__label">Business Miles ({businessPct}%)</div>
          </div>
          <div className="accountant-card">
            <div className="accountant-stat">
              {formatMiles(trips.personalMiles)} mi
            </div>
            <div className="accountant-stat__label">Personal Miles</div>
          </div>
        </div>
      </section>

      {/* Mileage Deduction + Earnings */}
      <div className="accountant-grid accountant-grid--2" style={{ marginTop: "1.5rem" }}>
        {/* HMRC Deduction */}
        <section className="accountant-section">
          <h2 className="accountant-section__title">HMRC Mileage Deduction</h2>
          <div className="accountant-card accountant-card--hero">
            <div className="accountant-card__label">Total deduction ({taxYear})</div>
            <div className="accountant-hero-value">
              {formatPence(deduction.totalDeductionPence)}
            </div>
            <div className="accountant-card__sub">
              {formatMiles(deduction.totalBusinessMiles)} business miles
            </div>
          </div>

          {deduction.byVehicle.length > 0 && (
            <div className="accountant-table-wrap" style={{ marginTop: "1rem" }}>
              <table className="accountant-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Business Miles</th>
                    <th>Deduction</th>
                  </tr>
                </thead>
                <tbody>
                  {deduction.byVehicle.map((v) => (
                    <tr key={v.vehicleId}>
                      <td>
                        {v.make} {v.model}
                        <span className="accountant-tag">{v.vehicleType}</span>
                      </td>
                      <td>{formatMiles(v.businessMiles)} mi</td>
                      <td className="accountant-td--amber">
                        {formatPence(v.deductionPence)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Earnings by Platform */}
        <section className="accountant-section">
          <h2 className="accountant-section__title">Earnings by Platform</h2>
          {earnings.length === 0 ? (
            <div className="accountant-card accountant-empty">
              No earnings recorded for {taxYear}.
            </div>
          ) : (
            <>
              <div className="accountant-card accountant-card--hero" style={{ marginBottom: "1rem" }}>
                <div className="accountant-card__label">Total earnings ({taxYear})</div>
                <div className="accountant-hero-value accountant-hero-value--emerald">
                  {formatPence(totalEarningsPence)}
                </div>
                <div className="accountant-card__sub">{earnings.length} platform{earnings.length !== 1 ? "s" : ""}</div>
              </div>
              <div className="accountant-table-wrap">
                <table className="accountant-table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Records</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings
                      .sort((a, b) => b.amountPence - a.amountPence)
                      .map((e) => (
                        <tr key={e.platform}>
                          <td>{e.platform}</td>
                          <td>{e.count}</td>
                          <td className="accountant-td--emerald">
                            {formatPence(e.amountPence)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Expenses by Category */}
      {expenses.length > 0 && (
        <section className="accountant-section" style={{ marginTop: "1.5rem" }}>
          <h2 className="accountant-section__title">Expenses by Category</h2>
          <div className="accountant-table-wrap">
            <table className="accountant-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Deductible</th>
                </tr>
              </thead>
              <tbody>
                {expenses
                  .sort((a, b) => b.amountPence - a.amountPence)
                  .map((row) => (
                    <tr key={row.category}>
                      <td>{row.category}</td>
                      <td>{formatPence(row.amountPence)}</td>
                      <td>
                        {row.isDeductible ? (
                          <span className="accountant-badge accountant-badge--success">Yes</span>
                        ) : (
                          <span className="accountant-badge accountant-badge--muted">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Generated timestamp */}
      <p className="accountant-generated">
        Generated {new Date(data.generatedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })} - data is read-only
      </p>
    </div>
  );
}
