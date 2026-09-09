"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DataTable, type Column } from "../DataTable";
import { Section } from "../Section";
import { Stat, StatGrid } from "../StatGrid";

interface LaResponse {
  data: {
    days: number;
    pushStarts: { ok: number; noToken: number; suppressedByPref: number; other: number };
    presence: { checks: number; present: number; rate: number | null };
    foregroundHeals: number;
    progressUpdates: { found: number; notFound: number };
    byBuild: Array<{ buildNumber: string; checks: number; present: number }>;
    generatedAt: string;
  };
}

type BuildRow = LaResponse["data"]["byBuild"][number];

// Live Activities, last 7 days: did the push-to-start go out, did the widget
// actually appear (presence probe), and could the app find it to update it.
export function LiveActivityHealth() {
  const [data, setData] = useState<LaResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<LaResponse>("/admin/live-activity-health")
      .then((r) => setData(r.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const columns: Column<BuildRow>[] = [
    { key: "buildNumber", header: "Build" },
    { key: "checks", header: "Presence checks", numeric: true, align: "right" },
    { key: "present", header: "Present", numeric: true, align: "right" },
    {
      key: "rate",
      header: "Rate",
      numeric: true,
      align: "right",
      render: (r) => (r.checks > 0 ? `${Math.round((r.present / r.checks) * 100)}%` : "-"),
    },
  ];

  const presenceTone = (rate: number | null): "neutral" | "good" | "warn" | "bad" => {
    if (rate === null) return "neutral";
    if (rate >= 60) return "good";
    if (rate >= 25) return "warn";
    return "bad";
  };

  return (
    <Section
      title="Live Activity health"
      description="Last 7 days. Push-to-start outcomes, whether the widget was actually on screen when probed, and whether the app could find it to update the miles."
    >
      {error && <p className="admin-page__status admin-page__status--error">Error: {error}</p>}
      {data && (
        <>
          <StatGrid>
            <Stat label="Push starts OK" value={data.pushStarts.ok} tone="good" />
            <Stat label="No token" value={data.pushStarts.noToken} tone={data.pushStarts.noToken ? "warn" : "neutral"} />
            <Stat label="Off by preference" value={data.pushStarts.suppressedByPref} />
            <Stat label="Other failures" value={data.pushStarts.other} tone={data.pushStarts.other ? "bad" : "neutral"} />
            <Stat
              label="Presence rate"
              value={data.presence.rate === null ? "-" : `${data.presence.rate}%`}
              note={`${data.presence.present} of ${data.presence.checks} probes`}
              tone={presenceTone(data.presence.rate)}
            />
            <Stat label="Foreground heals" value={data.foregroundHeals} />
            <Stat
              label="Progress updates"
              value={data.progressUpdates.found}
              note={`${data.progressUpdates.notFound} could not find the activity`}
              tone={data.progressUpdates.notFound > data.progressUpdates.found ? "warn" : "neutral"}
            />
          </StatGrid>
          <DataTable columns={columns} rows={data.byBuild} rowKey={(r) => r.buildNumber} empty="No presence probes in the window." />
        </>
      )}
    </Section>
  );
}
