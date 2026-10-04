"use client";

// Milesheet team journey (4 Oct 2026): nominated or created, manager
// accepted, first driver active, first month approved, first export, paying.
// How many teams reach each step, how long it takes, and where they stop.

import { useRouter } from "next/navigation";
import {
  Badge,
  DataTable,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  useAdminData,
  type TableColumn,
} from "@/components/admin/ui";
import { JourneyPanel } from "@/components/admin/milesheet/panels";
import { MILESHEET_ROOT, SOURCE_LABEL, shortDate } from "@/components/admin/milesheet/labels";
import type { JourneyStep, JourneyTeam, MilesheetJourney } from "@/components/admin/milesheet/types";

const STEP_ORDER: JourneyStep[] = ["started", "managerAccepted", "firstDriverActive", "firstApproval", "firstExport", "paying"];
const SHORT: Record<JourneyStep, string> = {
  started: "Started",
  managerAccepted: "Manager in",
  firstDriverActive: "Driver active",
  firstApproval: "Approved",
  firstExport: "Exported",
  paying: "Paying",
};

function StepCell({ team, step }: { team: JourneyTeam; step: JourneyStep }) {
  if (!team.reached[step]) return <span style={{ color: "var(--adm-text-3)" }}>Not yet</span>;
  return <>{team.dates[step] ? shortDate(team.dates[step]) : "Yes"}</>;
}

export default function MilesheetJourneyPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useAdminData<MilesheetJourney>("/admin/milesheet/journey");

  const cols: TableColumn<JourneyTeam>[] = [
    {
      key: "name",
      header: "Team",
      render: (t) => (
        <>
          {t.name}
          <span className="adm-cell-sub">{SOURCE_LABEL[t.source]}</span>
        </>
      ),
      sortValue: (t) => t.name.toLowerCase(),
    },
    {
      key: "last",
      header: "Got as far as",
      render: (t) => <Badge tone={t.lastStep === "paying" ? "good" : t.lastStep === "started" ? "warn" : "neutral"}>{SHORT[t.lastStep]}</Badge>,
      sortValue: (t) => STEP_ORDER.indexOf(t.lastStep),
    },
    ...STEP_ORDER.slice(1).map<TableColumn<JourneyTeam>>((step) => ({
      key: step,
      header: SHORT[step],
      render: (t) => <StepCell team={t} step={step} />,
      sortValue: (t) => t.dates[step] ?? (t.reached[step] ? "1" : ""),
      hideOnMobile: true,
    })),
  ];

  return (
    <>
      <PageHeader title="Team journey" subtitle="Where teams get to, how long each step takes, and where they stop." updatedAt={data?.generatedAt} />
      <JourneyPanel />
      <Panel title="Every team" subtitle="Click a team to open it." flush>
        <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the teams." skeleton={<LoadingSkeleton variant="table" rows={6} />}>
          {(d) => (
            <DataTable
              caption="Each team's journey"
              columns={cols}
              rows={d.teams}
              rowKey={(t) => t.orgId}
              onRowClick={(t) => router.push(`${MILESHEET_ROOT}/${t.orgId}`)}
              initialSort={{ key: "last", dir: "asc" }}
              maxHeight={640}
              emptyTitle="No teams yet"
            />
          )}
        </LoadState>
      </Panel>
    </>
  );
}
