"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Segmented, Skeleton } from "@/components/dashboard/kit";
import { Overview } from "@/components/dashboard/insights/Overview";
import { Trends } from "@/components/dashboard/insights/Trends";
import s from "./page.module.css";

type View = "overview" | "trends";

function InsightsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const view: View = params?.get("view") === "trends" ? "trends" : "overview";

  const setView = (v: View) => {
    router.replace(v === "trends" ? "/dashboard/insights?view=trends" : "/dashboard/insights", { scroll: false });
  };

  return (
    <>
      <PageHeader title="Insights" />
      <Segmented
        ariaLabel="Insights view"
        value={view}
        onChange={setView}
        options={[
          { value: "overview", label: "Overview" },
          { value: "trends", label: "Trends" },
        ]}
      />
      <div className={s.body}>{view === "trends" ? <Trends /> : <Overview />}</div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Skeleton variant="card" count={2} />}>
      <InsightsPage />
    </Suspense>
  );
}
