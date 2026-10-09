"use client";

import type { SaChecklist } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button, Card, CardError, useData, useMe } from "@/components/dashboard/kit";
import "./tax.css";

/**
 * "Ready for 31 January?" From 1 December to 31 January, for self-employed
 * drivers. Renders nothing while loading and nothing out of season, so Home
 * never flashes an empty card. GET /self-assessment/checklist.
 */
export function SaCountdownCard({ mode }: { mode: "work" | "personal" }) {
  const { isCompanyDriver } = useMe();
  const enabled = mode === "work" && !isCompanyDriver;
  const { data, error, reload } = useData<SaChecklist>(enabled ? "sa-checklist" : null, () =>
    api.get<{ data: SaChecklist }>("/self-assessment/checklist").then((r) => r.data)
  );

  if (!enabled) return null;
  if (error && !data) {
    return (
      <Card title="Ready for 31 January?">
        <CardError onRetry={reload} />
      </Card>
    );
  }
  if (!data || !data.eligible || !data.inSeason) return null;

  const days = data.daysToDeadline;
  const when = days > 1 ? `${days} days to go` : days === 1 ? "1 day to go" : days === 0 ? "Due today" : "The deadline has passed";

  return (
    <Card title="Ready for 31 January?" tone="amber" action={{ label: "See the checklist", href: "/dashboard/tax/checklist" }}>
      <div className="mc-tax-stack">
        <p className="mc-tax-text">
          <strong>{when}</strong> for your {data.taxYear} return. {data.headline}
        </p>
        {data.attentionCount > 0 && (
          <Button variant="link" size="sm" href="/dashboard/tax/checklist">
            {data.attentionCount} {data.attentionCount === 1 ? "thing needs" : "things need"} a look
          </Button>
        )}
      </div>
    </Card>
  );
}
