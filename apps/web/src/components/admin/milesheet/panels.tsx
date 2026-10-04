"use client";

// Panels shared by the Milesheet admin pages: the team journey funnel and the
// needs-attention list. Each loads its own data (one failing endpoint only
// affects its own panel).

import Link from "next/link";
import {
  Badge,
  DataTable,
  EmptyState,
  LoadState,
  LoadingSkeleton,
  Panel,
  ProgressBar,
  formatNumber,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import { ATTENTION_LABEL, MILESHEET_ROOT, shortDate } from "./labels";
import type { AttentionItem, FunnelStep, MilesheetAttention, MilesheetJourney } from "./types";

function daysText(d: number | null, sample: number): string {
  if (d === null) return "-";
  return `${d.toLocaleString("en-GB", { maximumFractionDigits: 1 })} days (${sample} team${sample === 1 ? "" : "s"})`;
}

export function JourneyPanel({ compact }: { compact?: boolean }) {
  const { data, error, loading, reload } = useAdminData<MilesheetJourney>("/admin/milesheet/journey");
  const cols: TableColumn<FunnelStep>[] = [
    { key: "label", header: "Step", render: (s) => s.label },
    { key: "reached", header: "Teams reached", render: (s) => formatNumber(s.reached), numeric: true },
    {
      key: "stalled",
      header: "Stopped here",
      title: "Teams whose furthest step, in order, is this one",
      render: (s) => (s.stalledHere > 0 ? <strong>{formatNumber(s.stalledHere)}</strong> : "0"),
      numeric: true,
    },
    {
      key: "median",
      header: "Median time from the step before",
      render: (s) => daysText(s.medianDaysFromPrevious, s.medianSample),
      hideOnMobile: true,
    },
  ];
  return (
    <Panel
      title="Team journey"
      subtitle="How far each team has got, from first set up to paying."
      href={compact ? `${MILESHEET_ROOT}/journey` : undefined}
      hrefLabel="Open the journey"
      highlight={!compact}
      footer="A team counts as stopped at the furthest step it reached in order. Median times only use teams with both dates."
    >
      <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the team journey." skeleton={<LoadingSkeleton variant="chart" />}>
        {(d) => {
          if (d.teams.length === 0) return <EmptyState compact title="No teams yet" />;
          const worst = [...d.steps].filter((s) => s.step !== "paying").sort((a, b) => b.stalledHere - a.stalledHere)[0];
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s3)" }} role="list" aria-label="Teams reaching each step, in order">
                {d.steps.map((s) => (
                  <div role="listitem" key={s.step}>
                    <ProgressBar
                      value={s.reached}
                      max={d.teams.length}
                      label={s.label}
                      valueLabel={`${formatNumber(s.reached)} of ${formatNumber(d.teams.length)}${s.stalledHere > 0 && s.step !== "paying" ? `, ${formatNumber(s.stalledHere)} stopped here` : ""}`}
                      tone={s.step === "paying" ? "good" : "accent"}
                    />
                  </div>
                ))}
              </div>
              {worst && worst.stalledHere > 0 && (
                <p className="adm-text">
                  Most teams stop at <strong>{worst.label.toLowerCase()}</strong> ({formatNumber(worst.stalledHere)} of {formatNumber(d.teams.length)}).
                </p>
              )}
              {!compact && <DataTable caption="Team journey steps" columns={cols} rows={d.steps} rowKey={(s) => s.step} dense />}
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}

export function AttentionPanel({ limit }: { limit?: number }) {
  const { data, error, loading, reload } = useAdminData<MilesheetAttention>("/admin/milesheet/attention");
  const cols: TableColumn<AttentionItem>[] = [
    {
      key: "kind",
      header: "What",
      render: (i) => (
        <Badge tone={i.severity === "bad" ? "bad" : "warn"} dot>
          {ATTENTION_LABEL[i.kind]}
        </Badge>
      ),
      sortValue: (i) => `${i.severity}${i.kind}`,
    },
    {
      key: "team",
      header: "Team",
      render: (i) => (
        <>
          <Link href={`${MILESHEET_ROOT}/${i.orgId}`}>{i.orgName}</Link>
          {i.otherOrgIds?.map((id) => (
            <span key={id} className="adm-cell-sub">
              and <Link href={`${MILESHEET_ROOT}/${id}`}>the other team</Link>
            </span>
          ))}
        </>
      ),
      sortValue: (i) => i.orgName,
    },
    { key: "detail", header: "Detail", render: (i) => <span style={{ color: "var(--adm-text-2)" }}>{i.detail}</span>, hideOnMobile: true },
    { key: "since", header: "Since", render: (i) => shortDate(i.since), sortValue: (i) => i.since, align: "right", hideOnMobile: true },
  ];
  return (
    <Panel
      title="Needs attention"
      subtitle="Across every team: what is stuck or about to go wrong."
      href={limit ? `${MILESHEET_ROOT}/attention` : undefined}
      hrefLabel="See everything"
      flush
      footer="Last month is chased from the 6th. Drivers with no trips are listed from the 8th, so the 1st of the month is not full of false alarms."
    >
      <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the attention list." skeleton={<LoadingSkeleton variant="table" rows={5} />}>
        {(d) => (
          <DataTable
            caption="Teams that need attention"
            columns={cols}
            rows={limit ? d.items.slice(0, limit) : d.items}
            rowKey={(i, idx) => `${i.kind}-${i.orgId}-${idx}`}
            rowTone={(i) => (i.severity === "bad" ? "bad" : undefined)}
            maxHeight={limit ? undefined : 640}
            emptyTitle="Nothing needs attention"
            empty="No old invites, every team has a manager, and last month is signed off."
          />
        )}
      </LoadState>
    </Panel>
  );
}
