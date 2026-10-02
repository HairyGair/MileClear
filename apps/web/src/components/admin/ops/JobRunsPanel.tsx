"use client";

// Ops: background jobs. The latest run of each scheduled job, then the run
// log (latest 50), filterable by job name.

import { useEffect, useState } from "react";
import { Ago } from "@/components/admin/Ago";
import {
  Badge,
  DataTable,
  ExpandableText,
  Grid,
  LoadState,
  LoadingSkeleton,
  Panel,
  TextInput,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import { runTone, type JobRunLog, type JobRunResponse } from "./types";

const COLUMNS: TableColumn<JobRunLog>[] = [
  {
    key: "started",
    header: "Started",
    sortValue: (r) => r.startedAt,
    render: (r) => <span style={{ whiteSpace: "nowrap" }}>{new Date(r.startedAt).toLocaleString("en-GB")}</span>,
  },
  { key: "job", header: "Job", sortValue: (r) => r.jobName, render: (r) => <span className="adm-mono">{r.jobName}</span> },
  { key: "status", header: "Status", sortValue: (r) => r.status, render: (r) => <Badge tone={runTone(r.status)}>{r.status}</Badge> },
  {
    key: "duration",
    header: "Took",
    numeric: true,
    hideOnMobile: true,
    sortValue: (r) => (r.finishedAt ? new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime() : null),
    render: (r) => {
      if (!r.finishedAt) return "-";
      const dur = Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 10) / 100;
      return `${dur.toFixed(2)}s`;
    },
  },
  { key: "error", header: "Error", render: (r) => (r.errorMessage ? <ExpandableText text={r.errorMessage} /> : "-") },
];

export function JobRunsPanel() {
  const [filter, setFilter] = useState("");
  const [applied, setApplied] = useState("");

  // Wait for typing to pause before asking the server again.
  useEffect(() => {
    const t = setTimeout(() => setApplied(filter.trim()), 350);
    return () => clearTimeout(t);
  }, [filter]);

  const params = new URLSearchParams({ page: "1", pageSize: "50" });
  if (applied) params.set("jobName", applied);
  const jobs = useAdminData<JobRunResponse>(`/admin/job-runs?${params}`, { unwrap: false });

  return (
    <>
      <Panel
        title="Latest run of each job"
        subtitle="Scheduled work on the API server: reminders, nudges, watchdogs, clean-ups."
        actions={
          <button type="button" className="adm-btn adm-btn--sm" onClick={jobs.reload} disabled={jobs.loading}>
            {jobs.loading ? "Refreshing" : "Refresh"}
          </button>
        }
      >
        <LoadState
          data={jobs.data}
          loading={jobs.loading}
          error={jobs.error}
          onRetry={jobs.reload}
          errorTitle="Couldn't load the background jobs."
          skeleton={<LoadingSkeleton variant="lines" rows={4} />}
        >
          {(j) =>
            j.latestPerJob.length === 0 ? (
              <p className="adm-text">No job has run yet.</p>
            ) : (
              <Grid min={220} gap="sm">
                {j.latestPerJob.map((l) => (
                  <div key={l.jobName} className="adm-kpi" style={{ gap: 4 }}>
                    <p className="adm-kpi__label adm-mono" style={{ textTransform: "none", letterSpacing: 0 }}>
                      {l.jobName}
                    </p>
                    <div style={{ display: "flex", gap: "var(--adm-s2)", alignItems: "center", flexWrap: "wrap" }}>
                      <Badge tone={runTone(l.status)} dot>
                        {l.status}
                      </Badge>
                      <Ago iso={l.startedAt} className="adm-note" />
                    </div>
                  </div>
                ))}
              </Grid>
            )
          }
        </LoadState>
      </Panel>

      <Panel title="Run log" subtitle="Latest 50 runs." flush>
        <div style={{ padding: "var(--adm-s4)", maxWidth: 360 }}>
          <TextInput label="Job name" placeholder="e.g. streak_at_risk" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <LoadState
          data={jobs.data}
          loading={jobs.loading}
          error={jobs.error}
          onRetry={jobs.reload}
          errorTitle="Couldn't load the job runs."
          skeleton={<div style={{ padding: "var(--adm-s4)" }}><LoadingSkeleton variant="table" rows={8} /></div>}
        >
          {(j) => (
            <DataTable
              caption="Background job runs"
              columns={COLUMNS}
              rows={j.data}
              rowKey={(r) => r.id}
              maxHeight={640}
              emptyTitle={applied ? `No runs of "${applied}"` : "No job runs yet"}
              dense
            />
          )}
        </LoadState>
      </Panel>
    </>
  );
}
