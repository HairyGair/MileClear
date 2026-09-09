"use client";

// Android section of the admin area (Sep 2026 redesign). One row per Android
// account with a one-word verdict, so "is Android useful yet" has a number.

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AdminPage, Ago, DataTable, Pill, Section, Stat, StatGrid, type AdminTone, type Column } from "@/components/admin";

type Verdict = "capturing" | "stub_fixes" | "silent" | "new" | "no_permission" | "gone";

interface Tester {
  userId: string;
  email: string;
  displayName: string | null;
  isPremium: boolean;
  createdAt: string;
  buildNumber: string | null;
  appVersion: string | null;
  osVersion: string | null;
  device: string | null;
  manufacturer: string | null;
  lastHeartbeatAt: string | null;
  lastTripAt: string | null;
  lastAutoTripAt: string | null;
  autoTrips7d: number;
  manualTrips7d: number;
  stubTrips7d: number;
  hasPushToken: boolean;
  bgLocationPermission: string | null;
  batteryIgnoring: boolean | null;
  headlessRearms: number | null;
  headlessSpeedWakes: number | null;
  dumpAt: string | null;
  verdict: Verdict;
}

interface Response {
  data: {
    testers: Tester[];
    totals: {
      count: number;
      withPushToken: number;
      bgGranted: number;
      batteryOptimised: number;
      capturing: number;
      stubFixes: number;
      silent: number;
      gone: number;
    };
    generatedAt: string;
  };
}

const VERDICT: Record<Verdict, { label: string; tone: AdminTone; help: string }> = {
  capturing: { label: "Capturing", tone: "good", help: "Auto trips in the last 7 days with real tracks." },
  stub_fixes: {
    label: "Stub fixes",
    tone: "bad",
    help: "Auto trips exist but most have 3 points or fewer: the engine woke for a fix and never tracked (Class 34).",
  },
  silent: { label: "Silent", tone: "warn", help: "Installed over 2 days, permission granted, no auto trip in 7 days." },
  new: { label: "New", tone: "neutral", help: "Installed in the last 2 days." },
  no_permission: { label: "No permission", tone: "bad", help: "Background location is not granted." },
  gone: { label: "Gone", tone: "neutral", help: "No heartbeat for 14 days." },
};

function yesNo(v: boolean | null, good: boolean): { text: string; tone: AdminTone } {
  if (v === null) return { text: "?", tone: "neutral" };
  return v === good ? { text: v ? "yes" : "no", tone: "good" } : { text: v ? "yes" : "no", tone: "bad" };
}

export default function AdminAndroidPage() {
  const [data, setData] = useState<Response["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Response>("/admin/android-testers")
      .then((r) => setData(r.data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  const columns: Column<Tester>[] = [
    {
      key: "who",
      header: "Tester",
      render: (r) => (
        <>
          <Link href={`/dashboard/admin/users?user=${r.userId}`}>{r.displayName ?? r.email}</Link>
          {r.isPremium && (
            <>
              {" "}
              <Pill tone="good">Pro</Pill>
            </>
          )}
          <div className="admin-stat__note">{r.email}</div>
        </>
      ),
    },
    {
      key: "verdict",
      header: "Verdict",
      render: (r) => (
        <Pill tone={VERDICT[r.verdict].tone} title={VERDICT[r.verdict].help}>
          {VERDICT[r.verdict].label}
        </Pill>
      ),
    },
    {
      key: "device",
      header: "Device",
      render: (r) => `${r.device ?? "?"}${r.osVersion ? ` (${r.osVersion})` : ""}`,
    },
    { key: "build", header: "Build", render: (r) => `${r.appVersion ?? "?"} (${r.buildNumber ?? "?"})` },
    {
      key: "trips",
      header: "Auto / stub / manual (7 d)",
      numeric: true,
      align: "right",
      render: (r) => `${r.autoTrips7d} / ${r.stubTrips7d} / ${r.manualTrips7d}`,
    },
    {
      key: "bg",
      header: "Background",
      render: (r) => (
        <Pill tone={r.bgLocationPermission === "granted" ? "good" : r.bgLocationPermission ? "bad" : "neutral"}>
          {r.bgLocationPermission ?? "?"}
        </Pill>
      ),
    },
    {
      key: "battery",
      header: "Battery exempt",
      title: "Whether the app is exempt from battery optimisation, from the last diagnostic dump.",
      render: (r) => {
        const v = yesNo(r.batteryIgnoring, true);
        return <Pill tone={v.tone}>{v.text}</Pill>;
      },
    },
    {
      key: "push",
      header: "Push",
      render: (r) => {
        const v = yesNo(r.hasPushToken, true);
        return <Pill tone={v.tone}>{v.text}</Pill>;
      },
    },
    {
      key: "headless",
      header: "Headless re-arms / speed wakes",
      title: "From the dump's activity summary: how often the headless task re-armed the stationary region, and how often it woke the engine on a driving-speed fix.",
      numeric: true,
      align: "right",
      render: (r) => `${r.headlessRearms ?? "-"} / ${r.headlessSpeedWakes ?? "-"}`,
    },
    { key: "hb", header: "Last heartbeat", render: (r) => <Ago iso={r.lastHeartbeatAt} /> },
    { key: "auto", header: "Last auto trip", render: (r) => <Ago iso={r.lastAutoTripAt} /> },
  ];

  return (
    <AdminPage
      title="Android"
      intro="Every account that has signed in from Android. The verdict is computed from the last 7 days of trips, the permission reading and the latest diagnostic dump."
      loading={!data && !error}
      error={error}
      generatedAt={data?.generatedAt}
    >
      {data && (
        <>
          <StatGrid>
            <Stat label="Android accounts" value={data.totals.count} />
            <Stat label="Capturing" value={data.totals.capturing} tone="good" />
            <Stat label="Stub fixes" value={data.totals.stubFixes} tone={data.totals.stubFixes ? "bad" : "neutral"} />
            <Stat label="Silent" value={data.totals.silent} tone={data.totals.silent ? "warn" : "neutral"} />
            <Stat label="Gone" value={data.totals.gone} />
            <Stat label="Background granted" value={data.totals.bgGranted} />
            <Stat label="Still battery-optimised" value={data.totals.batteryOptimised} tone={data.totals.batteryOptimised ? "warn" : "neutral"} />
            <Stat label="With push token" value={data.totals.withPushToken} />
          </StatGrid>
          <Section
            title="Testers"
            description="Sorted by last heartbeat. Hover a verdict for what it means. Battery exempt and the headless counts come from the phone's last diagnostic dump, so they can lag."
          >
            <DataTable columns={columns} rows={data.testers} rowKey={(r) => r.userId} empty="No Android accounts yet." />
          </Section>
        </>
      )}
    </AdminPage>
  );
}
