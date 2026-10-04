"use client";

// Milesheet needs attention (4 Oct 2026): every team problem in one list.
// Old invites, teams with no manager, likely duplicates, last month not
// signed off, quiet drivers and failed payments.

import { PageHeader } from "@/components/admin/ui";
import { AttentionPanel } from "@/components/admin/milesheet/panels";

export default function MilesheetAttentionPage() {
  return (
    <>
      <PageHeader
        title="Needs attention"
        subtitle="Team problems across Milesheet, worst first. Open a team to fix it: resend or extend an invite, move someone, or merge a duplicate."
      />
      <AttentionPanel />
    </>
  );
}
