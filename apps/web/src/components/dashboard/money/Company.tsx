"use client";

import type { ReactNode } from "react";
import type { ProReason } from "@/lib/dashboard/proReasons";
import { EmptyState, PageHeader, ProGate, Skeleton, useMe } from "../kit";

type Back = { href: string; label: string };

/**
 * Earnings, invoices and bank are for self-employed driving. Company drivers get a
 * plain explanation instead of a 404. The title shows in every state so the page
 * always has its one h1.
 */
export function SelfEmployedOnly({ title, back, children }: { title: string; back?: Back; children: ReactNode }) {
  const { isCompanyDriver, teamReady } = useMe();
  if (!teamReady) {
    return (
      <>
        <PageHeader title={title} back={back} />
        <Skeleton variant="row" count={4} />
      </>
    );
  }
  if (isCompanyDriver) {
    return (
      <>
        <PageHeader title={title} back={back} />
        <EmptyState icon="business-outline" title="Your company handles this" body="Earnings are for self-employed driving." />
      </>
    );
  }
  return <>{children}</>;
}

/** Whole page is Pro: free drivers get the title and the gate, Pro drivers get the page (which draws its own header). */
export function ProPage({ title, back, reason, teaser, children }: { title: string; back?: Back; reason: ProReason; teaser: ReactNode; children: ReactNode }) {
  const { isPro } = useMe();
  if (isPro) return <>{children}</>;
  return (
    <>
      <PageHeader title={title} back={back} />
      <ProGate reason={reason} page teaser={teaser}>
        <></>
      </ProGate>
    </>
  );
}
