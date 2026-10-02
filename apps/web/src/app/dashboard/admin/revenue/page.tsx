"use client";

// Revenue (Oct 2026 rebuild on the admin kit). One endpoint, /admin/revenue,
// which classifies every Pro user once (subscriptionTruth.ts) and prices only
// the paying ones.

import type { ReactNode } from "react";
import {
  Badge,
  DataTable,
  Grid,
  KpiCard,
  LineChart,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  formatMonth,
  formatNumber,
  formatPence,
  useAdminData,
  type AdminData,
  type TableColumn,
} from "@/components/admin/ui";

interface RevenueData {
  mrrPence: number;
  payingSubscribers: number;
  proTotal: number;
  breakdown: {
    stripeMonthly: number;
    stripeAnnual: number;
    appleMonthly: number;
    appleAnnual: number;
    googleMonthly?: number;
    googleAnnual?: number;
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

type TrendRow = RevenueData["monthlyTrend"][number];

const MONTHLY_PENCE = 499;
const ANNUAL_AS_MONTHLY_PENCE = 375;

// ---------------------------------------------------------------------------
// Headline numbers
// ---------------------------------------------------------------------------

function KpiRow({ rev }: { rev: AdminData<RevenueData> }) {
  const d = rev.data;
  const loading = rev.loading && !d;
  const nonPaying = d ? d.breakdown.comp + d.breakdown.referral + d.breakdown.appleSandbox : 0;
  const trend = d?.monthlyTrend ?? [];
  return (
    <Grid min={170}>
      <KpiCard
        label="Monthly recurring revenue"
        value={d ? formatPence(d.mrrPence) : ""}
        tone="accent"
        loading={loading}
        error={rev.error}
        hint="Paying only. Annual counted as £3.75 a month."
        title="Monthly at £4.99, annual at £44.99 / 12. Comp, referral and sandbox Pro are never priced."
      />
      <KpiCard
        label="Paying subscribers"
        value={d?.payingSubscribers ?? 0}
        loading={loading}
        error={rev.error}
        hint={d ? `${formatNumber(d.proTotal)} on Pro in total, ${formatNumber(nonPaying)} not paying` : undefined}
        sparkline={trend.length > 1 ? trend.map((t) => t.payingAtMonthEnd) : undefined}
        sparklineLabel="Paying subscribers at each month end"
      />
      <KpiCard
        label="Cancellations, last 30 days"
        value={d?.churnedLast30d ?? 0}
        tone={d && d.churnedLast30d > 0 ? "warn" : "neutral"}
        loading={loading}
        error={rev.error}
        hint={d ? `${d.churnRatePercent}% of paying plus cancelled` : undefined}
        title="Production Apple EXPIRED / REVOKE / REFUND plus Stripe cancellations in the last 30 days, over paying + churned."
      />
      <KpiCard
        label="Revenue per paying user"
        value={d ? formatPence(d.arppuPence) : ""}
        loading={loading}
        error={rev.error}
        hint={d ? `${formatPence(d.arpuPence)} across every registered user` : undefined}
        title="ARPPU is MRR / paying subscribers. ARPU (across every registered user) is shown underneath."
      />
    </Grid>
  );
}

// ---------------------------------------------------------------------------
// Who has Pro, and why
// ---------------------------------------------------------------------------

interface SourceRow {
  key: string;
  source: string;
  users: number;
  monthlyPence: number;
  note: ReactNode;
  kind: "paying" | "total" | "free" | "problem";
}

function sourceRows(d: RevenueData): SourceRow[] {
  const b = d.breakdown;
  const rows: SourceRow[] = [
    { key: "apple-m", source: "Apple, monthly", users: b.appleMonthly, monthlyPence: b.appleMonthly * MONTHLY_PENCE, note: "Production App Store, £4.99 a month", kind: "paying" },
    {
      key: "apple-a",
      source: "Apple, annual",
      users: b.appleAnnual,
      monthlyPence: b.appleAnnual * ANNUAL_AS_MONTHLY_PENCE,
      note: (
        <>
          £44.99 a year counted as £3.75 a month
          {d.inferredPeriods > 0 && (
            <span
              className="adm-cell-sub"
              title="Rows written before 21 Aug 2026 carry no product id, so monthly vs annual is inferred from how far out the expiry sits. Each renewal stamps the real product and this count falls."
            >
              {d.inferredPeriods} period{d.inferredPeriods === 1 ? "" : "s"} inferred from expiry
            </span>
          )}
        </>
      ),
      kind: "paying",
    },
    { key: "stripe-m", source: "Stripe, monthly", users: b.stripeMonthly, monthlyPence: b.stripeMonthly * MONTHLY_PENCE, note: "Web checkout, £4.99 a month", kind: "paying" },
  ];
  if (b.stripeAnnual > 0) {
    rows.push({ key: "stripe-a", source: "Stripe, annual", users: b.stripeAnnual, monthlyPence: b.stripeAnnual * ANNUAL_AS_MONTHLY_PENCE, note: "£44.99 a year counted as £3.75 a month", kind: "paying" });
  }
  rows.push({ key: "google-m", source: "Google Play, monthly", users: b.googleMonthly ?? 0, monthlyPence: (b.googleMonthly ?? 0) * MONTHLY_PENCE, note: "Android, £4.99 a month", kind: "paying" });
  if ((b.googleAnnual ?? 0) > 0) {
    rows.push({ key: "google-a", source: "Google Play, annual", users: b.googleAnnual ?? 0, monthlyPence: (b.googleAnnual ?? 0) * ANNUAL_AS_MONTHLY_PENCE, note: "£44.99 a year counted as £3.75 a month", kind: "paying" });
  }
  rows.push({ key: "paying", source: "Paying in total", users: d.payingSubscribers, monthlyPence: d.mrrPence, note: "", kind: "total" });
  rows.push({ key: "comp", source: "Comp (granted by an admin)", users: b.comp, monthlyPence: 0, note: "Pro flag with no subscription: testers, reviewers, goodwill", kind: "free" });
  rows.push({ key: "referral", source: "Referral credit", users: b.referral, monthlyPence: 0, note: "Earned free months; isPremium is false on these rows", kind: "free" });
  if (b.team > 0) {
    rows.push({ key: "team", source: "Team (pilot)", users: b.team, monthlyPence: 0, note: "Milesheet drivers; pilot organisations are free until proven", kind: "free" });
  }
  rows.push({ key: "sandbox", source: "Apple sandbox", users: b.appleSandbox, monthlyPence: 0, note: "TestFlight / App Review subscriptions: real Pro, no money", kind: "free" });
  if (b.expiredFlag > 0) {
    rows.push({
      key: "expired",
      source: "Flagged but expired",
      users: b.expiredFlag,
      monthlyPence: 0,
      note: "isPremium still true with premiumExpiresAt in the past; the gate already refuses them",
      kind: "problem",
    });
  }
  return rows;
}

const SOURCE_COLUMNS: TableColumn<SourceRow>[] = [
  {
    key: "source",
    header: "Source",
    render: (r) =>
      r.kind === "total" ? (
        <strong>{r.source}</strong>
      ) : r.kind === "problem" ? (
        <span>
          {r.source} <Badge tone="bad">Check</Badge>
        </span>
      ) : r.kind === "free" ? (
        <span>
          {r.source} <Badge>Free</Badge>
        </span>
      ) : (
        r.source
      ),
  },
  { key: "users", header: "Users", numeric: true, render: (r) => (r.kind === "total" ? <strong>{formatNumber(r.users)}</strong> : formatNumber(r.users)) },
  {
    key: "value",
    header: "Monthly value",
    numeric: true,
    render: (r) => (r.kind === "total" ? <strong>{formatPence(r.monthlyPence)}</strong> : formatPence(r.monthlyPence)),
  },
  { key: "note", header: "Notes", hideOnMobile: true, render: (r) => <span className="adm-note">{r.note}</span> },
];

function SourcesPanel({ rev }: { rev: AdminData<RevenueData> }) {
  return (
    <Panel
      title="Who has Pro, and why"
      subtitle="Every Pro user, split by where their Pro comes from. Only the paying rows carry money."
      flush
    >
      <LoadState
        data={rev.data}
        loading={rev.loading}
        error={rev.error}
        onRetry={rev.reload}
        errorTitle="Couldn't load the subscription breakdown."
        skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={8} /></div>}
      >
        {(d) => (
          <DataTable
            caption="Pro users by source, with monthly value"
            columns={SOURCE_COLUMNS}
            rows={sourceRows(d)}
            rowKey={(r) => r.key}
            rowTone={(r) => (r.kind === "problem" ? "bad" : undefined)}
          />
        )}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Paying subscribers by month
// ---------------------------------------------------------------------------

const TREND_COLUMNS: TableColumn<TrendRow>[] = [
  { key: "month", header: "Month", render: (r) => formatMonth(r.month, { month: "long", year: "numeric" }), sortValue: (r) => r.month },
  { key: "paying", header: "Paying at month end", numeric: true, render: (r) => formatNumber(r.payingAtMonthEnd), sortValue: (r) => r.payingAtMonthEnd },
  { key: "new", header: "New", numeric: true, render: (r) => `+${formatNumber(r.newPaid)}`, sortValue: (r) => r.newPaid },
  {
    key: "churned",
    header: "Cancelled",
    numeric: true,
    render: (r) => (r.churned > 0 ? <Badge tone="bad">-{formatNumber(r.churned)}</Badge> : "0"),
    sortValue: (r) => r.churned,
  },
];

function TrendPanel({ rev }: { rev: AdminData<RevenueData> }) {
  const d = rev.data;
  const footer = d ? (
    <>
      Reconstructed from the production webhook and Stripe event trail
      {d.trailStartMonth ? `, which begins ${formatMonth(d.trailStartMonth, { month: "long", year: "numeric" })}` : ""}. Earlier months are not shown because
      nothing recorded them.
    </>
  ) : undefined;
  return (
    <Panel highlight title="Paying subscribers by month" subtitle="How many were paying at the end of each month, with new and cancelled underneath." footer={footer}>
      <LoadState
        data={d}
        loading={rev.loading}
        error={rev.error}
        onRetry={rev.reload}
        errorTitle="Couldn't load the monthly trend."
        skeleton={<LoadingSkeleton variant="chart" height={220} />}
      >
        {(x) =>
          x.monthlyTrend.length === 0 ? (
            <p className="adm-text">No months to show yet: the event trail has not covered a full month.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
              <LineChart
                label="Paying subscribers at each month end"
                seriesLabel="Paying at month end"
                data={x.monthlyTrend.map((t) => ({
                  label: formatMonth(t.month, { month: "short" }),
                  fullLabel: formatMonth(t.month, { month: "long", year: "numeric" }),
                  value: t.payingAtMonthEnd,
                }))}
              />
              <DataTable caption="Paying subscribers, new and cancelled by month" columns={TREND_COLUMNS} rows={x.monthlyTrend} rowKey={(r) => r.month} dense />
            </div>
          )
        }
      </LoadState>
    </Panel>
  );
}

export default function AdminRevenuePage() {
  const rev = useAdminData<RevenueData>("/admin/revenue");
  return (
    <>
      <PageHeader
        title="Revenue"
        subtitle="What drivers pay us each month, who is paying, and who has Pro without paying."
        actions={
          <button type="button" className="adm-btn adm-btn--sm" onClick={rev.reload} disabled={rev.loading}>
            {rev.loading ? "Refreshing" : "Refresh"}
          </button>
        }
      />
      <KpiRow rev={rev} />
      <TrendPanel rev={rev} />
      <SourcesPanel rev={rev} />
    </>
  );
}
