"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { type Column, DataTable, EmptyState, ErrorState, Figure, PageHeader, TaxYearPicker, useData } from "@/components/dashboard/kit";
import { formatMiles, formatPence, getTaxYear } from "@/lib/dashboard";
import "@/components/dashboard/trips/trips.css";

interface ProjectRow {
  label: string | null;
  trips: number;
  miles: number;
  valuePence: number;
}
interface ProjectData {
  taxYear: string;
  projects: ProjectRow[];
  totals: { trips: number; miles: number; valuePence: number };
}

export default function Page() {
  const [taxYear, setTaxYear] = useState(() => getTaxYear(new Date()));
  const totals = useData<ProjectData>(`project-totals:${taxYear}`, () =>
    api.get<{ data: ProjectData }>(`/trips/project-totals?taxYear=${encodeURIComponent(taxYear)}`).then((r) => r.data)
  );

  const columns: Column<ProjectRow>[] = [
    { key: "label", label: "Project", render: (r) => r.label ?? "No project" },
    { key: "trips", label: "Trips", align: "right", hideBelow: 768, render: (r) => r.trips.toLocaleString("en-GB") },
    { key: "miles", label: "Business miles", align: "right", render: (r) => formatMiles(r.miles) },
    { key: "value", label: "Deduction", align: "right", render: (r) => formatPence(r.valuePence) },
  ];

  const all = totals.data?.projects ?? [];
  // A table holding only "No project" says nothing, so it counts as empty.
  const labelled = all.filter((r) => r.label !== null);
  const rows = labelled.length > 0 ? all : [];

  return (
    <>
      <PageHeader title="Miles by project" back={{ href: "/dashboard/trips", label: "Trips" }}>
        Your business trips added up by the project or client you gave them.
      </PageHeader>
      <div className="mc-stack">
        <TaxYearPicker value={taxYear} onChange={setTaxYear} />
        {totals.error ? (
          <ErrorState title="Couldn't load your projects" onRetry={totals.reload} />
        ) : (
          <>
            {totals.data && labelled.length > 0 && (
              <Figure
                size="lg"
                label={`Business miles, ${taxYear}`}
                value={formatMiles(totals.data.totals.miles)}
                sub={`${totals.data.totals.trips.toLocaleString("en-GB")} trips`}
              />
            )}
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.label ?? "__none"}
              loading={totals.loading && !totals.data}
              empty={
                <EmptyState
                  icon="briefcase-outline"
                  title="No projects yet"
                  body="Add a project name to a trip and its miles add up here."
                />
              }
            />
          </>
        )}
      </div>
    </>
  );
}
