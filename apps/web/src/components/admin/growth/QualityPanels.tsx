"use client";

// Insights > Quality signals: rating prompts, classification accuracy,
// very short auto trips, diagnostic alerts, and the anonymous benchmark
// figures behind the in-app "How you compare" card.

import {
  Badge,
  BarList,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  Panel,
  formatNumber,
  useAdminData,
} from "@/components/admin/ui";
import { STACK, pct1 } from "./format";
import type { BenchmarkObserver, DiagnosticPanels } from "./types";

export function DiagnosticsPanel() {
  const { data, error, loading, reload } = useAdminData<DiagnosticPanels>("/admin/diagnostic-panels");
  const days = data?.windowDays ?? 7;
  const kpiLoading = loading && !data;
  const ca = data?.classificationAccuracy;

  return (
    <div style={STACK}>
      <Grid min={180}>
        <KpiCard
          label="Auto classification accepted"
          value={ca && ca.accuracyPercent !== null ? pct1(ca.accuracyPercent) : "-"}
          tone="accent"
          loading={kpiLoading}
          error={error}
          hint={
            ca
              ? ca.accuracyPercent !== null
                ? `${formatNumber(ca.accepted)} of ${formatNumber(ca.accepted + ca.rejected)} signals, last ${days} days`
                : "No classification feedback yet"
              : undefined
          }
        />
        <KpiCard
          label="Very short auto trips"
          value={data?.lowQualityTripCount ?? 0}
          loading={kpiLoading}
          error={error}
          hint={`Auto-detected trips under 0.3 miles, last ${days} days`}
        />
      </Grid>

      <div className="adm-split">
        <Panel title="Rating prompt events" subtitle={`Each rating event the app logged in the last ${days} days.`}>
          <LoadState
            data={data}
            loading={loading}
            error={error}
            onRetry={reload}
            errorTitle="Couldn't load the diagnostic figures."
            skeleton={<LoadingSkeleton rows={4} />}
          >
            {(d) =>
              d.ratingFunnel.length === 0 ? (
                <p className="adm-text">No rating events in the last {days} days.</p>
              ) : (
                <BarList
                  label="Rating events by type"
                  items={d.ratingFunnel.map((r) => ({ key: r.type, label: r.type.replace("rating.", ""), value: r.count }))}
                />
              )
            }
          </LoadState>
        </Panel>

        <Panel title="Diagnostic alerts" subtitle={`diagnostic_alert events from phones, last ${days} days.`}>
          <LoadState
            data={data}
            loading={loading}
            error={error}
            onRetry={reload}
            errorTitle="Couldn't load the diagnostic figures."
            skeleton={<LoadingSkeleton rows={4} />}
          >
            {(d) =>
              d.heartbeatAlerts.length === 0 ? (
                <p className="adm-text">No diagnostic alerts.</p>
              ) : (
                <BarList
                  label="Diagnostic alerts by type"
                  items={d.heartbeatAlerts.map((h) => ({ key: h.type, label: h.type.replace("diagnostic_alert.", ""), value: h.count }))}
                />
              )
            }
          </LoadState>
        </Panel>
      </div>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  monthly_business_miles_per_user: "Business miles per driver",
};

export function BenchmarkPanel() {
  const { data, error, loading, reload } = useAdminData<BenchmarkObserver>("/admin/benchmark-observer");
  return (
    <Panel
      title="Anonymous benchmark check"
      subtitle={`The raw figures behind the in-app "How you compare" card, to sanity-check its percentiles.`}
      actions={
        data ? (
          data.privacyFloorMet ? (
            <Badge tone="good" dot>{formatNumber(data.contributors)} contributors</Badge>
          ) : (
            <Badge tone="warn" dot>{formatNumber(data.contributors)} contributors, below the 5 needed</Badge>
          )
        ) : undefined
      }
      footer="Each contributor is one driver with business miles in the window. The privacy floor is 5 contributors."
    >
      <LoadState
        data={data}
        loading={loading}
        error={error}
        onRetry={reload}
        errorTitle="Couldn't load the benchmark figures."
        skeleton={<LoadingSkeleton variant="kpi" />}
      >
        {(d) => (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s3)" }}>
            <p className="adm-note" style={{ margin: 0 }}>
              {CATEGORY_LABELS[d.category] ?? d.category}, last {d.windowDays} days.
            </p>
            <Grid min={110} gap="sm">
              {[
                { label: "Lowest", value: d.min },
                { label: "Lower quarter", value: d.p25 },
                { label: "Median", value: d.median },
                { label: "Upper quarter", value: d.p75 },
                { label: "Highest", value: d.max },
              ].map((b) => (
                <KpiCard key={b.label} label={b.label} value={b.value !== null ? `${b.value.toLocaleString("en-GB", { maximumFractionDigits: 1 })} mi` : "-"} tone={b.label === "Median" ? "accent" : "neutral"} />
              ))}
            </Grid>
          </div>
        )}
      </LoadState>
    </Panel>
  );
}

export function QualityTab() {
  return (
    <div style={STACK}>
      <DiagnosticsPanel />
      <BenchmarkPanel />
    </div>
  );
}
