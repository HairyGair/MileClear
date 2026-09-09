"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DataTable, type Column } from "../DataTable";
import { Section } from "../Section";
import { Stat, StatGrid } from "../StatGrid";

interface TqResponse {
  data: {
    days: number;
    autoTrips: number;
    manualTrips: number;
    stubTrips: number;
    stubRate: number | null;
    phantomFlagged: number;
    avgCoords: number | null;
    byPlatform: Array<{ platform: string; autoTrips: number; stubTrips: number; stubRate: number | null }>;
    events: {
      mapMatchSkipped: number;
      visitAutoSplit: number;
      wakeLagExtended: number;
      edgePhantomTrimmed: number;
      orphanFinalized: number;
      missingReports: number;
    };
    generatedAt: string;
  };
}

type PlatformRow = TqResponse["data"]["byPlatform"][number];

// Captured-trip quality, last 7 days. A "stub" is a captured trip with three
// or fewer points: the engine woke for a fix and never tracked (Class 34).
export function TripQuality() {
  const [data, setData] = useState<TqResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TqResponse>("/admin/trip-quality")
      .then((r) => setData(r.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const columns: Column<PlatformRow>[] = [
    { key: "platform", header: "Signup platform" },
    { key: "autoTrips", header: "Captured trips", numeric: true, align: "right" },
    { key: "stubTrips", header: "Stubs (3 points or fewer)", numeric: true, align: "right" },
    {
      key: "stubRate",
      header: "Stub rate",
      numeric: true,
      align: "right",
      render: (r) => (r.stubRate === null ? "-" : `${r.stubRate}%`),
    },
  ];

  const stubTone = (rate: number | null): "neutral" | "good" | "warn" | "bad" => {
    if (rate === null) return "neutral";
    if (rate <= 5) return "good";
    if (rate <= 15) return "warn";
    return "bad";
  };

  return (
    <Section
      title="Trip quality"
      description="Last 7 days across the fleet. Stubs are captured trips with three or fewer points. The event counts are the server-side repairs that ran."
    >
      {error && <p className="admin-page__status admin-page__status--error">Error: {error}</p>}
      {data && (
        <>
          <StatGrid>
            <Stat label="Captured trips" value={data.autoTrips} />
            <Stat label="Manual trips" value={data.manualTrips} />
            <Stat
              label="Stub rate"
              value={data.stubRate === null ? "-" : `${data.stubRate}%`}
              note={`${data.stubTrips} stubs`}
              tone={stubTone(data.stubRate)}
            />
            <Stat label="Phantom flagged" value={data.phantomFlagged} />
            <Stat label="Avg points per trip" value={data.avgCoords ?? "-"} />
            <Stat label="Missing-trip reports" value={data.events.missingReports} tone={data.events.missingReports ? "warn" : "good"} />
          </StatGrid>
          <StatGrid min={140}>
            <Stat label="Visit auto-splits" value={data.events.visitAutoSplit} />
            <Stat label="Wake-lag starts" value={data.events.wakeLagExtended} />
            <Stat label="Edge trims" value={data.events.edgePhantomTrimmed} />
            <Stat label="Map-match skipped" value={data.events.mapMatchSkipped} />
            <Stat label="Orphan routes saved" value={data.events.orphanFinalized} />
          </StatGrid>
          <DataTable columns={columns} rows={data.byPlatform} rowKey={(r) => r.platform} empty="No captured trips in the window." />
        </>
      )}
    </Section>
  );
}
