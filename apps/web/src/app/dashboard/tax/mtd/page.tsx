"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton, StatusChip, useData, useToast } from "@/components/dashboard/kit";
import { longDate, shortDateYear } from "@/components/dashboard/tax/tax-utils";
import "@/components/dashboard/tax/tax.css";

interface HmrcStatus {
  connected: boolean;
  environment?: string;
  connectedAt?: string;
  hasNino?: boolean;
  hasBusinessId?: boolean;
}

// GET /hmrc/obligations -> { data: { obligations: NormalisedObligation[] } }
interface Obligation {
  start: string;
  end: string;
  due: string;
  status: "Open" | "Fulfilled";
  isFulfilled: boolean;
  isOverdue: boolean;
}

export default function MtdPage() {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const { data: status, error, loading, reload } = useData<HmrcStatus>("hmrc-status-page", () =>
    api.get<{ data: HmrcStatus }>("/hmrc/status").then((r) => r.data)
  );
  const connected = status?.connected === true;
  const { data: obligations } = useData<Obligation[]>(connected ? "hmrc-obligations" : null, () =>
    api
      .get<{ data: { obligations: Obligation[] } }>("/hmrc/obligations")
      .then((r) => r.data.obligations ?? [])
      .catch(() => [])
  );
  const back = { href: "/dashboard/tax", label: "Tax" };

  return (
    <>
      <PageHeader title="Quarterly Self Assessment" back={back} />
      <div className="mc-tax-page">
        {loading && !status && <Skeleton variant="card" count={2} />}
        {error && !status && <ErrorState title="Couldn't load this" onRetry={reload} />}

        {status && !connected && (
          <EmptyState
            icon="document-text-outline"
            title="Not connected"
            body="Quarterly updates are set up in the MileClear app."
            action={{ label: "Back to Tax", href: "/dashboard/tax" }}
          />
        )}

        {status && connected && (
          <>
            {status.environment === "sandbox" && (
              <Card tone="quiet">
                <p className="mc-tax-text">
                  <strong>This is a test version connected to HMRC&apos;s test service.</strong> Nothing here is sent to HMRC for real.
                </p>
              </Card>
            )}

            <Card title="Connection" padded={false}>
              <ul className="mc-tax-kv mc-tax-pad">
                <li>
                  <span className="mc-tax-kv__label">Service</span>
                  <span className="mc-tax-kv__value">{status.environment === "sandbox" ? "Test service" : (status.environment ?? "Unknown")}</span>
                </li>
                {status.connectedAt && (
                  <li>
                    <span className="mc-tax-kv__label">Connected since</span>
                    <span className="mc-tax-kv__value">{shortDateYear(status.connectedAt)}</span>
                  </li>
                )}
                <li>
                  <span className="mc-tax-kv__label">National Insurance number</span>
                  <span className="mc-tax-kv__value">{status.hasNino ? "Added" : "Not added"}</span>
                </li>
                <li>
                  <span className="mc-tax-kv__label">Business</span>
                  <span className="mc-tax-kv__value">{status.hasBusinessId ? "Added" : "Not added"}</span>
                </li>
              </ul>
            </Card>

            <Card title="Updates due" padded={false}>
              {!obligations || obligations.length === 0 ? (
                <p className="mc-tax-note mc-tax-padded">No updates listed.</p>
              ) : (
                <ul className="mc-tax-kv mc-tax-pad">
                  {obligations.map((o, i) => {
                    const done = o.isFulfilled || o.status === "Fulfilled";
                    return (
                      <li key={`${o.start}-${i}`}>
                        <span className="mc-tax-kv__label">
                          {longDate(o.start)} to {longDate(o.end)}
                          <span className="mc-tax-kv__sub">Due {longDate(o.due)}</span>
                        </span>
                        <StatusChip
                          tone={done ? "green" : o.isOverdue ? "red" : "amber"}
                          label={done ? "Done" : o.isOverdue ? "Overdue" : "Open"}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <p className="mc-tax-note">Sending quarterly updates is in the MileClear app for now.</p>
            <div>
              <Button variant="ghost" onClick={() => setConfirm(true)}>
                Disconnect
              </Button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm}
        title="Disconnect?"
        body="This removes the connection to the test service. You can connect again in the app."
        confirmLabel="Disconnect"
        destructive
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          await api.post("/hmrc/disconnect");
          toast.show("Disconnected");
          reload();
        }}
      />
    </>
  );
}
