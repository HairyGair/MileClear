"use client";

// Funnel by sign-up month. Each registration month is its own row, so a month
// where something broke for new drivers stands out from the overall funnel.
// Reads /admin/funnel/cohorts (no date range: it returns every cohort).

import Link from "next/link";
import {
  AdminIcon,
  Badge,
  BarChart,
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  formatMonth,
  formatNumber,
  useAdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";

interface CohortRow {
  cohort: string; // "YYYY-MM"
  registered: number;
  firstTrip: number;
  firstClassification: number;
  firstExport: number;
  upgradedToPro: number;
  rateFirstTrip: number; // % of registered
  rateClassification: number; // % of first-trip
  rateExport: number; // % of first-classification
  rateProConversion: number; // % of registered (any time)
}

interface FunnelData {
  activationWindowDays: number;
  cohorts: CohortRow[];
  generatedAt: string;
}

type CohortTone = "ok" | "warn" | "regress";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
}

// Compare a cohort's rate to the median rate across every cohort shown
// (including itself). Under 70% of the median = well below, under 85% = below.
function cohortTone(value: number, med: number): CohortTone {
  if (med === 0) return "ok";
  const ratio = value / med;
  if (ratio < 0.7) return "regress";
  if (ratio < 0.85) return "warn";
  return "ok";
}

const TONE: Record<CohortTone, Tone> = { ok: "neutral", warn: "warn", regress: "bad" };
const TONE_WORD: Record<CohortTone, string> = { ok: "", warn: "below usual", regress: "well below usual" };

function RateCell({ count, rate, tone, med }: { count: number; rate: number; tone: CohortTone; med: number }) {
  return (
    <div>
      <span style={{ color: "var(--adm-text-strong)", fontWeight: 600 }}>{formatNumber(count)}</span>
      <span className="adm-cell-sub">
        {tone === "ok" ? (
          `${rate}%`
        ) : (
          <Badge tone={TONE[tone]} title={`Median across these months: ${Math.round(med * 10) / 10}%`}>
            {rate}% {TONE_WORD[tone]}
          </Badge>
        )}
      </span>
    </div>
  );
}

const STEPS = [
  { key: "firstTrip", header: "First trip", count: (c: CohortRow) => c.firstTrip, rate: (c: CohortRow) => c.rateFirstTrip, title: "Logged a trip within the window. Rate is a share of everyone who registered." },
  { key: "classified", header: "Classified", count: (c: CohortRow) => c.firstClassification, rate: (c: CohortRow) => c.rateClassification, title: "Classified a trip within the window. Rate is a share of those who logged a trip." },
  { key: "exported", header: "Exported", count: (c: CohortRow) => c.firstExport, rate: (c: CohortRow) => c.rateExport, title: "Exported within the window. Rate is a share of those who classified." },
  { key: "pro", header: "Pro", count: (c: CohortRow) => c.upgradedToPro, rate: (c: CohortRow) => c.rateProConversion, title: "On Pro right now by any route (paid, comp, referral or test), with no time limit. Rate is a share of everyone who registered." },
] as const;

export default function FunnelCohortsPage() {
  const { data, error, loading, reload } = useAdminData<FunnelData>("/admin/funnel/cohorts");

  const cohorts = data?.cohorts ?? [];
  const medians = {
    firstTrip: median(cohorts.map((c) => c.rateFirstTrip)),
    classified: median(cohorts.map((c) => c.rateClassification)),
    exported: median(cohorts.map((c) => c.rateExport)),
    pro: median(cohorts.map((c) => c.rateProConversion)),
  };
  const latest = cohorts[cohorts.length - 1];
  const now = new Date();
  const currentKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const latestKey = latest?.cohort === currentKey ? currentKey : null;
  const windowDays = data?.activationWindowDays ?? 30;
  const kpiLoading = loading && !data;

  const columns: TableColumn<CohortRow>[] = [
    {
      key: "cohort",
      header: "Sign-up month",
      sortValue: (c) => c.cohort,
      render: (c) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--adm-s2)", flexWrap: "wrap" }}>
          <strong style={{ color: "var(--adm-text-strong)" }}>{formatMonth(c.cohort)}</strong>
          {c.cohort === latestKey && <Badge tone="accent">Current, still filling in</Badge>}
        </span>
      ),
    },
    { key: "registered", header: "Registered", numeric: true, sortValue: (c) => c.registered, render: (c) => formatNumber(c.registered) },
    ...STEPS.map<TableColumn<CohortRow>>((s) => ({
      key: s.key,
      header: s.header,
      title: s.title,
      numeric: true,
      sortValue: (c) => s.rate(c),
      render: (c) => {
        const med = medians[s.key];
        return <RateCell count={s.count(c)} rate={s.rate(c)} tone={cohortTone(s.rate(c), med)} med={med} />;
      },
    })),
  ];

  return (
    <>
      <PageHeader
        title="Funnel by sign-up month"
        subtitle="How each month's new drivers got on: first trip, first classification, first export and Pro. A month that falls well below the others usually means something broke for new drivers that month."
        updatedAt={data?.generatedAt}
        actions={
          <Link href="/dashboard/admin/activation" className="adm-btn adm-btn--sm">
            Activation health <AdminIcon name="arrowRight" size={14} />
          </Link>
        }
      />

      <Grid min={170}>
        <KpiCard
          label={latest ? `Registered in ${formatMonth(latest.cohort, { month: "long" })}` : "Registered this month"}
          value={latest?.registered ?? 0}
          tone="accent"
          loading={kpiLoading}
          error={error}
          hint={latest?.cohort === currentKey ? "Current month, so far" : "Most recent month with sign-ups"}
        />
        <KpiCard
          label="Usual first-trip rate"
          value={`${Math.round(medians.firstTrip * 10) / 10}%`}
          loading={kpiLoading}
          error={error}
          hint={`Median across ${formatNumber(cohorts.length)} months, within ${windowDays} days`}
        />
        <KpiCard
          label="Usual classification rate"
          value={`${Math.round(medians.classified * 10) / 10}%`}
          loading={kpiLoading}
          error={error}
          hint="Of those who logged a trip"
        />
        <KpiCard
          label="Usual share on Pro"
          value={`${Math.round(medians.pro * 10) / 10}%`}
          loading={kpiLoading}
          error={error}
          hint="Of everyone registered, on Pro now"
        />
      </Grid>

      <Panel
        highlight
        title="First-trip rate by sign-up month"
        subtitle={`Share of each month's sign-ups who logged a trip within ${windowDays} days of registering.`}
        footer={`The newest months are still filling in: drivers who joined in the last ${windowDays} days have not had the full window yet, so those months read low for now.`}
      >
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load the funnel by month."
          skeleton={<LoadingSkeleton variant="chart" height={220} />}
        >
          {(d) => (
            <BarChart
              label="Percentage of sign-ups who logged a first trip, by sign-up month"
              formatValue={(n) => `${Math.round(n * 10) / 10}%`}
              partialIndex={latestKey ? d.cohorts.length - 1 : undefined}
              data={d.cohorts.map((c) => ({
                label: formatMonth(c.cohort, { month: "short" }),
                fullLabel: formatMonth(c.cohort, { month: "long", year: "numeric" }),
                value: c.rateFirstTrip,
              }))}
            />
          )}
        </LoadState>
      </Panel>

      <Panel
        title="Every month, step by step"
        subtitle={`Each step is counted within ${windowDays} days of registering, except Pro, which counts any time. A rate is flagged when it is under 85% of the median for that step across the months shown, and "well below usual" under 70%.`}
        footer="Rates: First trip is a share of everyone registered; Classified is a share of those who logged a trip; Exported is a share of those who classified; Pro is everyone from that month who is on Pro now by any route (paid, comp, referral or test), as a share of everyone registered."
        flush
      >
        <LoadState
          data={data}
          loading={loading}
          error={error}
          onRetry={reload}
          errorTitle="Couldn't load the funnel by month."
          skeleton={<LoadingSkeleton variant="table" rows={8} />}
        >
          {(d) => (
            <DataTable
              caption="Activation funnel by sign-up month"
              columns={columns}
              rows={d.cohorts}
              rowKey={(c) => c.cohort}
              emptyTitle="No sign-up months yet"
            />
          )}
        </LoadState>
      </Panel>
    </>
  );
}
