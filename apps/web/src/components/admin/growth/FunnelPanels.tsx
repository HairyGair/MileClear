"use client";

// Insights > Funnel and retention: the all-time conversion funnel, D1/D7/D30
// retention, and the onboarding steps derived from account state.

import {
  Badge,
  DataTable,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  Panel,
  ProgressBar,
  formatNumber,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import { STACK, pct1 } from "./format";
import type { FunnelStep, OnboardingData, OnboardingStep, RetentionData } from "./types";

// ---------------------------------------------------------------------------
// Conversion funnel
// ---------------------------------------------------------------------------

const funnelColumns: TableColumn<FunnelStep>[] = [
  { key: "label", header: "Step", render: (s) => <span style={{ color: "var(--adm-text-strong)" }}>{s.label}</span> },
  { key: "count", header: "Drivers", numeric: true, render: (s) => formatNumber(s.count) },
  { key: "prev", header: "Of previous step", numeric: true, render: (s) => pct1(s.pctOfPrev) },
  {
    key: "total",
    header: "Of all sign-ups",
    render: (s) => <ProgressBar value={s.pctOfTotal} max={100} size="sm" valueLabel={pct1(s.pctOfTotal)} />,
  },
];

export function ConversionFunnelPanel() {
  const { data, error, loading, reload } = useAdminData<{ steps: FunnelStep[] }>("/admin/funnel");
  return (
    <Panel
      highlight
      title="Conversion funnel, all time"
      subtitle="Sign-up, first trip, 5 or more trips, earnings logged, paying subscriber."
      footer={'"Of previous step" for Paying subscriber is measured against the 5+ trips step, not against Logged earnings, so the last two steps are not a strict chain.'}
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the conversion funnel."
        skeleton={<LoadingSkeleton variant="table" rows={5} />}
      >
        {(d) => <DataTable dense caption="Conversion funnel" columns={funnelColumns} rows={d.steps} rowKey={(s) => s.key} />}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export function RetentionPanel() {
  const { data, error, loading, reload } = useAdminData<RetentionData>("/admin/retention");
  return (
    <Panel
      title="Retention: day 1, day 7, day 30"
      subtitle="Of drivers who signed up in the last 90 days and are old enough to have reached that day, the share who logged a trip on or after it."
      footer="Newer sign-ups are left out of each denominator rather than counted as lost."
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load retention."
        skeleton={<LoadingSkeleton variant="kpi" />}
      >
        {(d) => (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s3)" }}>
            <p className="adm-note">Cohort: {formatNumber(d.cohortSize)} sign-ups in the last 90 days.</p>
            <Grid min={150} gap="sm">
              {(
                [
                  ["d1", "Day 1"],
                  ["d7", "Day 7"],
                  ["d30", "Day 30"],
                ] as const
              ).map(([k, label]) => (
                <KpiCard
                  key={k}
                  label={label}
                  value={pct1(d[k].pct)}
                  tone="accent"
                  hint={`${formatNumber(d[k].count)} of ${formatNumber(d[k].eligible)} eligible`}
                />
              ))}
            </Grid>
          </div>
        )}
      </LoadState>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Onboarding steps derived from account state
// ---------------------------------------------------------------------------

export function OnboardingPanel() {
  const { data, error, loading, reload } = useAdminData<OnboardingData>("/admin/onboarding-derived");

  // The biggest leak: the step that loses the largest share of the step
  // before it. Sidesteps whose count goes up have no drop and are skipped.
  const biggest = data
    ? data.steps.reduce<{ step: OnboardingStep | null; pct: number }>(
        (best, s) => (s.dropPctOfPrev != null && s.dropPctOfPrev > best.pct ? { step: s, pct: s.dropPctOfPrev } : best),
        { step: null, pct: 0 }
      )
    : null;
  const leak = biggest?.step && biggest.pct >= 10 ? biggest.step : null;

  const columns: TableColumn<OnboardingStep>[] = [
    {
      key: "label",
      header: "Step",
      render: (s) => (
        <>
          <span style={{ color: "var(--adm-text-strong)" }}>{s.label}</span>
          {s.note && <span className="adm-cell-sub">{s.note}</span>}
        </>
      ),
    },
    {
      key: "drop",
      header: "Lost from previous",
      numeric: true,
      title: "Drivers lost between the step before and this one. Shown as a dash on independent sidesteps where order does not matter.",
      render: (s) =>
        s.dropFromPrev != null && s.dropFromPrev > 0 ? (
          <span style={{ color: "var(--adm-bad)" }}>
            {formatNumber(s.dropFromPrev)} (-{pct1(s.dropPctOfPrev ?? 0)})
          </span>
        ) : s.dropFromPrev === 0 ? (
          <span style={{ color: "var(--adm-text-3)" }}>-</span>
        ) : null,
    },
    { key: "count", header: "Drivers", numeric: true, render: (s) => formatNumber(s.count) },
    { key: "pct", header: "Of sign-ups", numeric: true, render: (s) => pct1(s.pct) },
  ];

  return (
    <Panel
      title="Onboarding steps"
      subtitle="How far drivers get, worked out from what their account shows (the app does not log each onboarding step). Lost from previous is the drivers who reached the step before but not this one."
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the onboarding steps."
        skeleton={<LoadingSkeleton variant="table" rows={10} />}
      >
        {(d) => (
          <div style={STACK}>
            {leak && (
              <p className="adm-text" style={{ margin: 0 }}>
                <Badge tone="bad" dot size="md">Biggest leak</Badge>{" "}
                <strong style={{ color: "var(--adm-text-strong)" }}>{leak.label}</strong> loses {formatNumber(leak.dropFromPrev ?? 0)} drivers (
                {pct1(leak.dropPctOfPrev ?? 0)}) from the step before.
              </p>
            )}
            <DataTable
              dense
              caption="Onboarding steps"
              columns={columns}
              rows={d.steps}
              rowKey={(s) => s.label}
              rowTone={(s) => (leak && s.label === leak.label ? "bad" : undefined)}
            />
            <div title={d.activation.description}>
              <ProgressBar
                tone="good"
                label={d.activation.label}
                value={d.activation.activated}
                max={Math.max(1, d.activation.cohort)}
                valueLabel={`${pct1(d.activation.pct)} (${formatNumber(d.activation.activated)} of ${formatNumber(d.activation.cohort)} eligible)`}
              />
              <p className="adm-note" style={{ marginTop: "var(--adm-s2)" }}>
                Signed up more than 7 days ago and classified at least one trip within 7 days of signing up. Counted only over drivers who have had the full 7 days, so brand new sign-ups do not drag it down.
              </p>
            </div>
          </div>
        )}
      </LoadState>
    </Panel>
  );
}

/** The whole tab. */
export function FunnelTab() {
  return (
    <div style={STACK}>
      <ConversionFunnelPanel />
      <div className="adm-split">
        <OnboardingPanel />
        <RetentionPanel />
      </div>
    </div>
  );
}
