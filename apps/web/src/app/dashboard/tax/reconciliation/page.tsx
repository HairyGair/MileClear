"use client";

import { useState } from "react";
import { getTaxYear, type ReconciliationRow, type ReconciliationSummary } from "@mileclear/shared";
import { api } from "@/lib/api";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  MoneyField,
  PageHeader,
  Skeleton,
  TaxYearPicker,
  formatPence,
  useData,
  useToast,
} from "@/components/dashboard/kit";
import { messageOf } from "@/components/dashboard/tax/tax-utils";
import "@/components/dashboard/tax/tax.css";

const MATCH_WITHIN_PENCE = 2000;

/** One plain line for a platform's difference. */
function differenceLine(r: ReconciliationRow): string {
  if (r.diffPence === null) return "No figure entered";
  const abs = Math.abs(r.diffPence);
  if (abs < MATCH_WITHIN_PENCE) return "Matches your records";
  if (r.diffPence > 0) return `${formatPence(abs)} more than your records. Check you have added all your earnings.`;
  return `${formatPence(abs)} less than your records. Check the figure you entered.`;
}

function Form({ data, taxYear, onData }: { data: ReconciliationSummary; taxYear: string; onData: (d: ReconciliationSummary) => void }) {
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(data.rows.map((r) => [r.platform, r.hmrcReportedPence]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function compare() {
    setSaving(true);
    setError(null);
    try {
      let latest: ReconciliationSummary = data;
      for (const row of data.rows) {
        const draft = drafts[row.platform] ?? null;
        if (draft === row.hmrcReportedPence) continue;
        if (draft === null) {
          const res = await api.delete<{ data: ReconciliationSummary }>(
            `/hmrc-reconciliation/${encodeURIComponent(row.platform)}?taxYear=${taxYear}`
          );
          latest = res.data;
        } else {
          const res = await api.post<{ data: ReconciliationSummary }>("/hmrc-reconciliation", {
            taxYear,
            platform: row.platform,
            hmrcReportedPence: draft,
          });
          latest = res.data;
        }
      }
      onData(latest);
      toast.show("Saved");
    } catch (e) {
      setError(messageOf(e, "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="The figures in your HMRC account">
      <form
        className="mc-tax-fields"
        onSubmit={(e) => {
          e.preventDefault();
          void compare();
        }}
      >
        <p className="mc-tax-text">
          Enter the figure HMRC shows for each platform, from the notice in your Personal Tax Account. Leave a platform blank if you don&apos;t have one.
        </p>
        <div className="mc-tax-fields mc-tax-fields--2">
          {data.rows.map((r) => (
            <MoneyField
              key={`${r.platform}-${r.hmrcReportedPence ?? "none"}`}
              label={r.label}
              hint={`Your records: ${formatPence(r.mileclearTrackedPence)}`}
              value={drafts[r.platform] ?? null}
              onChange={(v) => setDrafts((d) => ({ ...d, [r.platform]: v }))}
            />
          ))}
        </div>
        {error && (
          <p className="mc-tax-error" role="alert">
            {error}
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" loading={saving}>
            Compare
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function ReconciliationPage() {
  const [taxYear, setTaxYear] = useState(() => getTaxYear(new Date()));
  const { data, error, loading, reload } = useData<ReconciliationSummary>(`hmrc-recon-${taxYear}`, () =>
    api.get<{ data: ReconciliationSummary }>(`/hmrc-reconciliation?taxYear=${taxYear}`).then((r) => r.data)
  );
  // The latest saved summary, so results show straight after Compare without a second request.
  const [saved, setSaved] = useState<{ taxYear: string; summary: ReconciliationSummary } | null>(null);
  const summary = saved && saved.taxYear === taxYear ? saved.summary : data;
  const compared = summary?.rows.filter((r) => r.hmrcReportedPence !== null) ?? [];

  return (
    <>
      <PageHeader title="Check against HMRC's figures" back={{ href: "/dashboard/tax", label: "Tax" }}>
        Platforms report your earnings to HMRC. Compare what they reported with your own records.
      </PageHeader>
      <div className="mc-tax-page">
        <div className="mc-tax-picker">
          <TaxYearPicker value={taxYear} onChange={setTaxYear} />
        </div>

        {loading && !summary && <Skeleton variant="card" count={2} />}
        {error && !summary && <ErrorState title="Couldn't load your records" onRetry={reload} />}

        {summary && summary.rows.length === 0 && (
          <EmptyState
            icon="swap-vertical-outline"
            title={`No earnings recorded for ${taxYear}`}
            body="Add your earnings first, then come back to compare them."
            action={{ label: "Add earnings", href: "/dashboard/earnings" }}
          />
        )}

        {summary && summary.rows.length > 0 && (
          <>
            <Form
              key={`${taxYear}-${summary.rows.map((r) => r.hmrcReportedPence ?? "n").join(",")}`}
              data={summary}
              taxYear={taxYear}
              onData={(d) => setSaved({ taxYear, summary: d })}
            />

            {compared.length > 0 && (
              <div className="mc-tax-stack">
                <h2 className="mc-card__title">Result</h2>
                <DataTable<ReconciliationRow>
                  columns={[
                    { key: "label", label: "Platform" },
                    { key: "records", label: "Your records", align: "right", render: (r) => formatPence(r.mileclearTrackedPence) },
                    {
                      key: "figure",
                      label: "Your figure",
                      align: "right",
                      render: (r) => (r.hmrcReportedPence === null ? "Not entered" : formatPence(r.hmrcReportedPence)),
                    },
                    { key: "diff", label: "Difference", render: (r) => differenceLine(r) },
                  ]}
                  rows={compared}
                  rowKey={(r) => r.platform}
                  mobileRow={(r) => (
                    <div className="mc-tax-stack">
                      <p className="mc-tax-dl__title">{r.label}</p>
                      <p className="mc-tax-note">
                        Your records {formatPence(r.mileclearTrackedPence)}. Your figure{" "}
                        {r.hmrcReportedPence === null ? "not entered" : formatPence(r.hmrcReportedPence)}.
                      </p>
                      <p className="mc-tax-text">{differenceLine(r)}</p>
                    </div>
                  )}
                />
                <p className="mc-tax-text">
                  Total: your records {formatPence(summary.totals.mileclearTrackedPence)}, your figures {formatPence(summary.totals.hmrcReportedPence)}.{" "}
                  {summary.totals.completedPlatforms} of {summary.totals.totalPlatforms} platforms entered.
                </p>
              </div>
            )}
            <p className="mc-tax-note">
              The figures you enter stay in MileClear for your reference. Nothing is submitted for you. To see what your platforms reported to HMRC, sign in to your Personal Tax Account on GOV.UK.
            </p>
          </>
        )}
      </div>
    </>
  );
}
