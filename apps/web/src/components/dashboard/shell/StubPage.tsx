"use client";

import { EmptyState } from "../kit/States";
import { PageHeader } from "../kit/PageHeader";

/**
 * Placeholder for a page another package is still building. Replace the whole
 * page.tsx; nothing else imports this.
 */
export function StubPage({ title, back }: { title: string; back?: { href: string; label: string } }) {
  return (
    <>
      <PageHeader title={title} back={back} />
      <EmptyState
        icon="construct-outline"
        title={`${title} is being rebuilt`}
        body="This page is on its way. Everything else in the dashboard works as normal."
        action={{ label: "Back to Home", href: "/dashboard" }}
      />
    </>
  );
}
