"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Ago } from "../Ago";
import { DataTable, type Column } from "../DataTable";
import { Pill } from "../Pill";
import { Section } from "../Section";
import { Stat, StatGrid } from "../StatGrid";

interface QueueItem {
  kind: "feedback" | "missing_trip";
  id: string;
  userId: string | null;
  email: string | null;
  displayName: string | null;
  isPremium: boolean;
  at: string;
  ageHours: number;
  summary: string;
  status: string | null;
  replies: number;
  lastReplyBy: "admin" | "user" | null;
}

interface QueueResponse {
  data: {
    items: QueueItem[];
    counts: { feedbackOpen: number; missingTripsOpen: number; total: number };
    generatedAt: string;
  };
}

function ageTone(hours: number): "good" | "warn" | "bad" {
  if (hours < 24) return "good";
  if (hours < 72) return "warn";
  return "bad";
}

// Who is waiting on a reply, oldest first. A feedback thread leaves the queue
// when an admin speaks last or its status closes; a missing-trip report
// leaves when a support reply or an admin-added trip follows it.
export function SupportQueue() {
  const [data, setData] = useState<QueueResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<QueueResponse>("/admin/support-queue")
      .then((r) => setData(r.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const columns: Column<QueueItem>[] = [
    {
      key: "kind",
      header: "Type",
      render: (r) => (
        <Pill tone={r.kind === "missing_trip" ? "warn" : "accent"}>
          {r.kind === "missing_trip" ? "Missing trip" : "Feedback"}
        </Pill>
      ),
    },
    {
      key: "who",
      header: "Who",
      render: (r) => (
        <>
          {r.userId ? (
            <Link href={`/dashboard/admin/users?user=${r.userId}`}>{r.displayName ?? r.email ?? "(unknown)"}</Link>
          ) : (
            r.displayName ?? "(anonymous)"
          )}
          {r.isPremium && (
            <>
              {" "}
              <Pill tone="good">Pro</Pill>
            </>
          )}
        </>
      ),
    },
    { key: "summary", header: "What", render: (r) => r.summary },
    {
      key: "age",
      header: "Waiting",
      numeric: true,
      render: (r) => (
        <Pill tone={ageTone(r.ageHours)}>
          <Ago iso={r.at} />
        </Pill>
      ),
    },
    {
      key: "state",
      header: "Thread",
      render: (r) =>
        r.kind === "feedback"
          ? `${r.status ?? "new"}${r.replies ? `, ${r.replies} repl${r.replies === 1 ? "y" : "ies"}` : ", no reply yet"}`
          : "no reply logged",
    },
  ];

  return (
    <Section
      title="Waiting on a reply"
      description="Feedback threads where the user spoke last, and missing-trip reports with no support reply or admin-added trip after them. Oldest first."
    >
      {error && <p className="admin-page__status admin-page__status--error">Error: {error}</p>}
      {data && (
        <>
          <StatGrid>
            <Stat label="Waiting" value={data.counts.total} tone={data.counts.total > 0 ? "warn" : "good"} />
            <Stat label="Feedback" value={data.counts.feedbackOpen} />
            <Stat label="Missing trips" value={data.counts.missingTripsOpen} />
          </StatGrid>
          <DataTable columns={columns} rows={data.items} rowKey={(r) => `${r.kind}-${r.id}`} empty="Nobody is waiting. Good." />
        </>
      )}
    </Section>
  );
}
