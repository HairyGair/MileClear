"use client";

// HMRC submissions (Oct 2026): every quarterly update, correction and
// calculation a driver has sent through MileClear, with HMRC's answer and
// correlation id (the reference HMRC support ask for). Reads
// GET /admin/hmrc/submissions, which never returns a NINO or an email.

import Link from "next/link";
import { useState } from "react";
import {
  Badge,
  DataTable,
  FilterBar,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  SelectField,
  useAdminData,
  type RangeKey,
  type TableColumn,
} from "@/components/admin/ui";

interface SubmissionRow {
  id: string;
  createdAt: string;
  userId: string | null;
  displayName: string | null;
  operation: string;
  taxYear: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  environment: "sandbox" | "production" | null;
  ok: boolean;
  httpStatus: number | null;
  hmrcCode: string | null;
  correlationId: string | null;
  appVersion: string | null;
  source: "trail" | "earlier_log";
}

interface SubmissionsData {
  generatedAt: string;
  days: number;
  counts: { total: number; ok: number; failed: number; production: number; sandbox: number; drivers: number };
  truncated: boolean;
  items: SubmissionRow[];
}

const RANGE_TO_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90, all: 730 };

const OPERATION_LABELS: Record<string, string> = {
  period_submit: "Quarterly update",
  period_amend: "Correction",
  calculation_trigger: "Tax calculation",
  bsas_trigger: "Adjustable summary",
  annual_submit: "Allowances and adjustments",
  annual_delete: "Allowances removed",
  final_declaration: "Tax return",
};

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

const columns: TableColumn<SubmissionRow>[] = [
  {
    key: "createdAt",
    header: "When (UK)",
    render: (r) => when(r.createdAt),
    sortValue: (r) => r.createdAt,
  },
  {
    key: "driver",
    header: "Driver",
    render: (r) =>
      r.userId ? (
        <Link className="adm-drv-link" href={`/dashboard/admin/users?user=${encodeURIComponent(r.userId)}`} title={r.userId}>
          {r.displayName ?? `${r.userId.slice(0, 8)}…`}
        </Link>
      ) : (
        "Unknown"
      ),
    sortValue: (r) => r.displayName ?? r.userId ?? "",
  },
  {
    key: "operation",
    header: "What",
    render: (r) => OPERATION_LABELS[r.operation] ?? r.operation,
    sortValue: (r) => r.operation,
  },
  { key: "taxYear", header: "Tax year", render: (r) => r.taxYear ?? "", sortValue: (r) => r.taxYear ?? "" },
  {
    key: "period",
    header: "Period",
    render: (r) => (r.periodStart && r.periodEnd ? `${shortDate(r.periodStart)} to ${shortDate(r.periodEnd)}` : ""),
    sortValue: (r) => r.periodEnd ?? "",
    hideOnMobile: true,
  },
  {
    key: "environment",
    header: "HMRC service",
    render: (r) =>
      r.environment === "production" ? (
        <Badge tone="accent">Live</Badge>
      ) : r.environment === "sandbox" ? (
        <Badge tone="neutral">Test</Badge>
      ) : (
        <Badge tone="neutral" title="Logged before the submission trail recorded the service">Not recorded</Badge>
      ),
    sortValue: (r) => r.environment ?? "",
  },
  {
    key: "result",
    header: "Result",
    render: (r) =>
      r.ok ? (
        <Badge tone="good" dot>OK</Badge>
      ) : (
        <Badge tone="bad" dot title={r.httpStatus ? `HTTP ${r.httpStatus}` : undefined}>
          {r.hmrcCode ?? (r.httpStatus ? `HTTP ${r.httpStatus}` : "Error")}
        </Badge>
      ),
    sortValue: (r) => (r.ok ? "0" : `1${r.hmrcCode ?? ""}`),
  },
  {
    key: "correlationId",
    header: "Correlation id",
    render: (r) => (r.correlationId ? <code>{r.correlationId}</code> : r.source === "earlier_log" ? "Earlier log" : ""),
    hideOnMobile: true,
  },
  {
    key: "appVersion",
    header: "App",
    render: (r) => r.appVersion ?? "",
    hideOnMobile: true,
  },
];

export default function AdminHmrcPage() {
  const [range, setRange] = useState<RangeKey>("90d");
  const [environment, setEnvironment] = useState("all");
  const [result, setResult] = useState("all");
  const path = `/admin/hmrc/submissions?days=${RANGE_TO_DAYS[range]}&environment=${environment}&result=${result}`;
  const data = useAdminData<SubmissionsData>(path);
  const loading = data.loading && !data.data;
  const c = data.data?.counts;

  return (
    <>
      <PageHeader
        title="HMRC submissions"
        subtitle="Every quarterly update, correction and tax calculation drivers have sent through MileClear, with HMRC's answer."
        range={{ value: range, onChange: setRange, options: ["7d", "30d", "90d", "all"] }}
        updatedAt={data.data?.generatedAt}
      />

      <Grid min={170}>
        <KpiCard label="Sent" value={c?.total ?? 0} loading={loading} error={data.error} />
        <KpiCard
          label="Turned down"
          value={c?.failed ?? 0}
          tone={c ? (c.failed > 0 ? "bad" : "good") : "neutral"}
          loading={loading}
          error={data.error}
          hint={c && c.failed === 0 ? "None" : undefined}
        />
        <KpiCard label="On HMRC's live service" value={c?.production ?? 0} tone="accent" loading={loading} error={data.error} />
        <KpiCard label="Drivers" value={c?.drivers ?? 0} loading={loading} error={data.error} />
      </Grid>

      <Panel
        title="Every submission"
        subtitle="Newest first. No NINOs or emails are stored or shown. Give HMRC the correlation id when you ask them about one."
        flush
        footer={
          data.data?.truncated ? <p className="adm-note">Showing the newest 500. Narrow the range or filters to see the rest.</p> : undefined
        }
        actions={
          <FilterBar spaced={false}>
            <SelectField
              id="hmrc-env"
              label="HMRC service"
              value={environment}
              onChange={setEnvironment}
              options={[
                { value: "all", label: "Live and test" },
                { value: "production", label: "Live only" },
                { value: "sandbox", label: "Test only" },
              ]}
            />
            <SelectField
              id="hmrc-result"
              label="Result"
              value={result}
              onChange={setResult}
              options={[
                { value: "all", label: "Any result" },
                { value: "error", label: "Turned down" },
                { value: "ok", label: "OK" },
              ]}
            />
          </FilterBar>
        }
      >
        <LoadState
          data={data.data}
          loading={data.loading}
          error={data.error}
          onRetry={data.reload}
          errorTitle="Couldn't load the HMRC submissions."
          skeleton={<LoadingSkeleton variant="table" rows={8} />}
        >
          {(d) => (
            <DataTable
              caption="HMRC submissions"
              columns={columns}
              rows={d.items}
              rowKey={(r) => r.id}
              rowTone={(r) => (r.ok ? undefined : "bad")}
              maxHeight={640}
              emptyTitle="Nothing sent in this period"
              empty={<p className="adm-note">Submissions appear here as soon as a driver sends one, on HMRC&apos;s test or live service.</p>}
            />
          )}
        </LoadState>
      </Panel>
    </>
  );
}
