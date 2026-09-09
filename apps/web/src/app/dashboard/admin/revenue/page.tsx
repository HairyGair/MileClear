"use client";

// Revenue section of the admin area (Sep 2026 redesign).

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { AdminPage } from "@/components/admin";
import { formatPence } from "@/components/admin/legacy";

// ---------------------------------------------------------------------------
// Revenue Tab
// ---------------------------------------------------------------------------

interface RevenueData {
  mrrPence: number;
  payingSubscribers: number;
  proTotal: number;
  breakdown: {
    stripeMonthly: number;
    stripeAnnual: number;
    appleMonthly: number;
    appleAnnual: number;
    appleSandbox: number;
    comp: number;
    referral: number;
    team: number;
    expiredFlag: number;
  };
  inferredPeriods: number;
  churnedLast30d: number;
  churnRatePercent: number;
  arpuPence: number;
  arppuPence: number;
  trailStartMonth: string | null;
  monthlyTrend: Array<{
    month: string;
    payingAtMonthEnd: number;
    newPaid: number;
    churned: number;
  }>;
}

function RevenueTab() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: RevenueData }>("/admin/revenue")
      .then((res) => setData(res.data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="card" count={2} style={{ height: 90 }} />;
  if (error) return <div className="alert alert--error">{error}</div>;
  if (!data) return null;

  const b = data.breakdown;
  const nonPaying = b.comp + b.referral + b.appleSandbox;
  const sub = { fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 } as const;
  const cell = { textAlign: "right", fontVariantNumeric: "tabular-nums" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">MRR</p>
          <p className="stat-card__value stat-card__value--emerald">{formatPence(data.mrrPence)}</p>
          <p style={sub} title="Monthly at £4.99, annual at £44.99 / 12. Comp, referral and sandbox Pro are never priced.">
            paying only · annual at £3.75/mo
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Paying subscribers</p>
          <p className="stat-card__value stat-card__value--amber">{data.payingSubscribers}</p>
          <p style={sub}>
            {data.proTotal} Pro in total · {nonPaying} not paying
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Churn (30d)</p>
          <p className="stat-card__value">{data.churnRatePercent}%</p>
          <p style={sub} title="Production Apple EXPIRED / REVOKE / REFUND plus Stripe cancellations in the last 30 days, over paying + churned.">
            {data.churnedLast30d} lost
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">ARPPU</p>
          <p className="stat-card__value">{formatPence(data.arppuPence)}</p>
          <p style={sub} title="MRR / paying subscribers. ARPU across every registered user is shown alongside.">
            ARPU all users {formatPence(data.arpuPence)}
          </p>
        </div>
      </div>

      <Card title="Who has Pro, and why">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th style={{ textAlign: "right" }}>Users</th>
                <th style={{ textAlign: "right" }}>Monthly value</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Apple · monthly</td>
                <td style={cell}>{b.appleMonthly}</td>
                <td style={cell}>{formatPence(b.appleMonthly * 499)}</td>
                <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Production App Store, £4.99/mo</td>
              </tr>
              <tr>
                <td>Apple · annual</td>
                <td style={cell}>{b.appleAnnual}</td>
                <td style={cell}>{formatPence(b.appleAnnual * 375)}</td>
                <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  £44.99/yr counted as £3.75/mo
                  {data.inferredPeriods > 0 && (
                    <span title="Rows written before 21 Aug 2026 carry no product id, so monthly vs annual is inferred from how far out the expiry sits. Each renewal stamps the real product and this count falls.">
                      {" "}· {data.inferredPeriods} period{data.inferredPeriods === 1 ? "" : "s"} inferred from expiry
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <td>Stripe · monthly</td>
                <td style={cell}>{b.stripeMonthly}</td>
                <td style={cell}>{formatPence(b.stripeMonthly * 499)}</td>
                <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Web checkout, £4.99/mo</td>
              </tr>
              {b.stripeAnnual > 0 && (
                <tr>
                  <td>Stripe · annual</td>
                  <td style={cell}>{b.stripeAnnual}</td>
                  <td style={cell}>{formatPence(b.stripeAnnual * 375)}</td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>£44.99/yr counted as £3.75/mo</td>
                </tr>
              )}
              <tr style={{ borderTop: "2px solid var(--border-color, rgba(255,255,255,0.08))" }}>
                <td><strong>Paying</strong></td>
                <td style={cell}><strong>{data.payingSubscribers}</strong></td>
                <td style={cell}><strong>{formatPence(data.mrrPence)}</strong></td>
                <td />
              </tr>
              <tr>
                <td>Comp (admin-granted)</td>
                <td style={cell}>{b.comp}</td>
                <td style={cell}>£0.00</td>
                <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Pro flag with no subscription: testers, reviewers, goodwill</td>
              </tr>
              <tr>
                <td>Referral credit</td>
                <td style={cell}>{b.referral}</td>
                <td style={cell}>£0.00</td>
                <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Earned free months; isPremium is false on these rows</td>
              </tr>
              {b.team > 0 && (
                <tr>
                  <td>Team (pilot)</td>
                  <td style={cell}>{b.team}</td>
                  <td style={cell}>£0.00</td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Milesheet drivers; pilot orgs are free until proven</td>
                </tr>
              )}
              <tr>
                <td>Apple sandbox</td>
                <td style={cell}>{b.appleSandbox}</td>
                <td style={cell}>£0.00</td>
                <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>TestFlight / App Review subscriptions: real Pro, no money</td>
              </tr>
              {b.expiredFlag > 0 && (
                <tr>
                  <td>Flagged but expired</td>
                  <td style={cell}>{b.expiredFlag}</td>
                  <td style={cell}>£0.00</td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--dash-red)" }}>isPremium still true with premiumExpiresAt in the past; the gate already refuses them</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {data.monthlyTrend.length > 0 && (
        <Card title="Paying subscribers by month">
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: "0 0 0.75rem" }}>
            Reconstructed from the production webhook and Stripe event trail
            {data.trailStartMonth ? `, which begins ${data.trailStartMonth}` : ""}. Earlier months are not shown because nothing recorded them.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: "right" }}>Paying at month end</th>
                  <th style={{ textAlign: "right" }}>New</th>
                  <th style={{ textAlign: "right" }}>Churned</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlyTrend.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td style={cell}>{row.payingAtMonthEnd}</td>
                    <td style={{ ...cell, color: "var(--emerald-400)" }}>+{row.newPaid}</td>
                    <td style={{ ...cell, color: row.churned > 0 ? "var(--dash-red)" : undefined }}>
                      {row.churned > 0 ? `-${row.churned}` : "0"}
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


export default function AdminRevenueTabPage() {
  return (
    <AdminPage title="Revenue" intro="Subscriptions, Apple and Stripe, comp Pro, referrals.">
      <RevenueTab />
    </AdminPage>
  );
}
