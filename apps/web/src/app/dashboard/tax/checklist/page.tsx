"use client";

import type { SaChecklist, SaChecklistAction } from "@mileclear/shared";
import { api } from "@/lib/api";
import { Button, Card, EmptyState, ErrorState, Icon, PageHeader, Skeleton, StatusChip, useData } from "@/components/dashboard/kit";
import "@/components/dashboard/tax/tax.css";

const ACTION_HREF: Record<SaChecklistAction, string> = {
  unclassified_trips: "/dashboard/trips?view=inbox",
  add_trip: "/dashboard/trips/new",
  earnings: "/dashboard/earnings",
  expenses: "/dashboard/expenses",
  vehicles: "/dashboard/vehicles",
  profile_name: "/dashboard/profile",
  self_assessment: "/dashboard/tax/self-assessment",
  // The PDF step lives on the Self Assessment page (Pro there).
  sa_pdf: "/dashboard/tax/self-assessment",
};

export default function ChecklistPage() {
  const { data, error, loading, reload } = useData<SaChecklist>("sa-checklist", () =>
    api.get<{ data: SaChecklist }>("/self-assessment/checklist").then((r) => r.data)
  );

  return (
    <>
      <PageHeader title="Ready for 31 January?" back={{ href: "/dashboard/tax", label: "Tax" }} />
      <div className="mc-tax-page">
        {loading && !data && <Skeleton variant="card" count={2} />}
        {error && !data && <ErrorState title="Couldn't load your checklist" onRetry={reload} />}

        {data && !data.eligible && (
          <EmptyState
            icon="checkmark-circle-outline"
            title="This checklist is for self-employed drivers"
            body={
              data.ineligibleReason === "employee"
                ? "You told us you drive as an employee, so there is no return to prepare for your mileage."
                : "You are in Personal mode, so there is no return to prepare."
            }
            action={{ label: "Back to Tax", href: "/dashboard/tax" }}
          />
        )}

        {data && data.eligible && (
          <>
            <Card>
              <div className="mc-tax-stack">
                <p className="mc-tax-text">
                  <strong>
                    {data.items.filter((i) => i.status === "done").length} of {data.items.length} done
                  </strong>{" "}
                  for your {data.taxYear} return ({data.taxYearLabel}).
                </p>
                <p className="mc-tax-text">{data.headline}</p>
                <p className="mc-tax-note">
                  {data.daysToDeadline > 0
                    ? `${data.daysToDeadline} ${data.daysToDeadline === 1 ? "day" : "days"} until 31 January.`
                    : data.daysToDeadline === 0
                      ? "The deadline is today."
                      : "The 31 January deadline has passed."}
                </p>
              </div>
            </Card>

            <Card padded={false}>
              <ul className="mc-tax-check">
                {data.items.map((item) => {
                  const done = item.status === "done";
                  return (
                    <li key={item.id}>
                      <span className={`mc-tax-check__mark${done ? " is-done" : ""}`}>
                        <Icon name={done ? "checkmark-circle" : item.status === "attention" ? "alert-circle-outline" : "time-outline"} size={22} />
                      </span>
                      <div className="mc-tax-check__body">
                        <p className="mc-tax-check__title">
                          {item.title}{" "}
                          {done && <StatusChip tone="green" label="Done" />}
                          {item.status === "optional" && <StatusChip tone="neutral" label="Optional" />}
                          {item.status === "attention" && <StatusChip tone="amber" label="Needs a look" />}
                        </p>
                        <p className="mc-tax-text">{item.detail}</p>
                        {!done && item.action && item.actionLabel && (
                          <Button variant="link" size="sm" href={ACTION_HREF[item.action]}>
                            {item.actionLabel}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
