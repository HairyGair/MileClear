"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, EmptyState, ErrorState, FilterChips, Skeleton, useToast } from "../../../../components/dashboard/kit";
import { PracticeHead, usePractice } from "../../../../components/practice/PracticeShell";
import { RequestStatusChip } from "../../../../components/practice/chips";
import { dayMonth, errorText, papi, type PracticeRequestRow } from "../../../../lib/practice";

type Filter = "open" | "done" | "all";

function remindAt(r: PracticeRequestRow): Date {
  return new Date(new Date(r.lastRemindedAt ?? r.createdAt).getTime() + 3 * 86_400_000);
}

export default function RequestsPage() {
  const toast = useToast();
  const { reload: reloadMe } = usePractice();
  const [filter, setFilter] = useState<Filter>("open");
  const [rows, setRows] = useState<PracticeRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    papi
      .get<PracticeRequestRow[]>(`/practice/requests?status=${filter}`)
      .then(setRows)
      .catch((e: unknown) => setError(errorText(e, "Couldn't load requests.")));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(path: string, ok: string) {
    try {
      await papi.post(path);
      toast.show(ok);
      load();
      reloadMe();
    } catch (e) {
      toast.show(errorText(e), "error");
    }
  }

  return (
    <>
      <PracticeHead title="Requests" line="What you've asked clients for, across all clients." />
      <div className="pc-toolbar">
        <FilterChips<Filter>
          single
          ariaLabel="Show requests"
          value={[filter]}
          onChange={(v) => setFilter(v[0] ?? "open")}
          options={[
            { value: "open", label: "Open" },
            { value: "done", label: "Done" },
            { value: "all", label: "All" },
          ]}
        />
      </div>
      {error && !rows && <ErrorState title="Couldn't load requests" onRetry={load} />}
      {!rows && !error && <Skeleton variant="row" count={6} />}
      {rows && rows.length === 0 && (
        <Card>
          <EmptyState
            size="card"
            icon="paper-plane-outline"
            title={filter === "open" ? "No open requests." : "No requests here yet."}
            body="Select clients in your list and press Send a request."
          />
        </Card>
      )}
      {rows && rows.length > 0 && (
        <Card padded={false}>
          <div className="pc-tablewrap">
            <table className="pc-table">
              <caption className="mc-sr-only">Requests</caption>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Request</th>
                  <th className="pc-hide-lt-1024">Sent</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th className="pc-hide-lt-1024">Reply</th>
                  <th className="is-right">
                    <span className="mc-sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const next = remindAt(r);
                  const canRemind = next.getTime() <= Date.now();
                  return (
                    <tr key={r.id}>
                      <td>
                        {r.client ? (
                          <Link href={`/practice/clients/${r.client.id}`} className="pc-cell-name">
                            {r.client.name}
                          </Link>
                        ) : null}
                      </td>
                      <td>
                        {r.title}
                        {r.note && <span className="pc-cell-sub">&ldquo;{r.note}&rdquo;</span>}
                        {r.createdByName && <span className="pc-cell-sub">Sent by {r.createdByName}</span>}
                      </td>
                      <td className="pc-hide-lt-1024 pc-muted">{dayMonth(r.createdAt)}</td>
                      <td className="pc-muted">{r.dueDate ? dayMonth(r.dueDate) : ""}</td>
                      <td>
                        <RequestStatusChip r={r} />
                      </td>
                      <td className="pc-hide-lt-1024" title={r.driverReply ?? undefined}>
                        {r.driverReply ? <>&ldquo;{r.driverReply}&rdquo;</> : <span className="pc-muted">None</span>}
                      </td>
                      <td className="is-right">
                        {r.status === "open" && (
                          <span className="pc-actions">
                            <button
                              type="button"
                              className="mc-textlink"
                              disabled={!canRemind}
                              title={canRemind ? undefined : `You can remind again on ${dayMonth(next.toISOString())}`}
                              style={canRemind ? undefined : { opacity: 0.5, cursor: "not-allowed" }}
                              onClick={() => void act(`/practice/requests/${r.id}/remind`, "Reminder sent.")}
                            >
                              Remind
                            </button>
                            <button type="button" className="mc-textlink" onClick={() => void act(`/practice/requests/${r.id}/cancel`, "Request cancelled.")}>
                              Cancel
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
