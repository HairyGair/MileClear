"use client";

import { Ago } from "../Ago";
import { BarList, LoadState, Panel, formatNumber, formatShare, useAdminData } from "../ui";
import type { AcquisitionData } from "./types";

const ASKED = "Asked once in the app, of drivers who joined in the last 30 days.";

/** "How did you hear about MileClear?" answers (asked in the app since
 *  1 Oct 2026). `summary` shows the top sources; `full` shows every source
 *  and what people wrote under Other. */
export function AcquisitionPanel({ variant = "summary" }: { variant?: "summary" | "full" }) {
  const { data, error, loading, reload } = useAdminData<AcquisitionData>("/admin/acquisition");
  const summary = variant === "summary";

  return (
    <Panel
      title="How new users found MileClear"
      subtitle={summary ? undefined : ASKED}
      href={summary ? "/dashboard/admin/acquisition" : undefined}
      hrefLabel="Details"
    >
      <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the answers.">
        {(d) => (
          <div className="adm-hub">
            <div className="adm-figure">
              <span className="adm-figure__value">{formatNumber(d.answered)}</span>
              <span className="adm-figure__label">answered, {formatNumber(d.skipped)} skipped</span>
            </div>
            {d.answered === 0 ? (
              <p className="adm-text">No answers yet.</p>
            ) : (
              <BarList
                label="Answers by source"
                limit={summary ? 4 : undefined}
                items={d.bySource
                  .filter((s) => !summary || s.count > 0)
                  .map((s) => ({ key: s.value, label: s.label, value: s.count, note: formatShare(s.count, d.answered) }))}
              />
            )}
            {!summary && d.otherDetails.length > 0 && (
              <div>
                <p className="adm-note" style={{ marginBottom: "var(--adm-s2)" }}>What people wrote under Other:</p>
                <ul className="adm-list">
                  {d.otherDetails.map((o, i) => (
                    <li key={i}>
                      {o.detail} <span className="adm-cell-sub" style={{ display: "inline" }}>(<Ago iso={o.at} />)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary && <p className="adm-note">{ASKED}</p>}
          </div>
        )}
      </LoadState>
    </Panel>
  );
}
