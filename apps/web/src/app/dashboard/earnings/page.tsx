"use client";

import { useState } from "react";
import type { Earning } from "@mileclear/shared";
import { GIG_PLATFORMS } from "@mileclear/shared";
import { api } from "@/lib/api";
import { recentTaxYears, taxYearRange } from "@/lib/dashboard/periods";
import { Button, EmptyState, ErrorState, PageHeader, ProChip, SelectField, StatusChip, DataTable, useData, useMe, type Column } from "@/components/dashboard/kit";
import { planHref } from "@/lib/dashboard/proReasons";
import { EarningDialog } from "@/components/dashboard/money/EarningDialog";
import { SelfEmployedOnly } from "@/components/dashboard/money/Company";
import { SOURCE_LABEL, periodLabel, platformLabel } from "@/components/dashboard/money/format";
import { formatPence } from "@/lib/dashboard/format";
import s from "@/components/dashboard/money/money.module.css";

type Row = Earning & { projectLabel?: string | null };

interface EarningsResponse {
  data: Row[];
  total: number;
  totalAmountPence: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

function EarningsList() {
  const { isPro } = useMe();
  const [platform, setPlatform] = useState("");
  const [taxYear, setTaxYear] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; earning: Row | null }>({ open: false, earning: null });

  const years = recentTaxYears();
  const key = `earnings-${platform}-${taxYear}-${page}`;
  const { data, error, loading, reload } = useData<EarningsResponse>(key, () => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (platform) q.set("platform", platform);
    if (taxYear) {
      const r = taxYearRange(taxYear);
      q.set("from", r.from);
      q.set("to", r.to);
    }
    return api.get<EarningsResponse>(`/earnings?${q}`);
  });

  const filtered = platform !== "" || taxYear !== "";
  const isEmpty = !!data && data.total === 0 && !filtered;
  const addButton = (
    <Button variant="primary" icon="add" onClick={() => setDialog({ open: true, earning: null })}>
      Add earning
    </Button>
  );

  const columns: Column<Row>[] = [
    { key: "date", label: "Date", render: (r) => periodLabel(r.periodStart, r.periodEnd) },
    { key: "platform", label: "Platform", render: (r) => platformLabel(r.platform) },
    { key: "source", label: "Source", hideBelow: 768, render: (r) => <StatusChip tone="neutral" label={SOURCE_LABEL[r.source] ?? r.source} /> },
    { key: "amount", label: "Amount", align: "right", render: (r) => formatPence(r.amountPence) },
  ];

  return (
    <>
      <PageHeader
        title="Earnings"
        primary={isEmpty ? undefined : addButton}
      />

      <div className={s.actionRow}>
        <Button variant="secondary" size="sm" href={isPro ? "/dashboard/earnings/import" : planHref("csv_import")}>
          Import from CSV <ProChip />
        </Button>
        <Button variant="secondary" size="sm" href="/dashboard/bank">
          Link a bank
        </Button>
      </div>

      {error && !data && <ErrorState title="Couldn't load your earnings" onRetry={reload} />}

      {isEmpty ? (
        <EmptyState
          icon="cash-outline"
          title="No earnings yet"
          body="Add what you were paid so we can work out your profit and tax."
          action={{ label: "Add earning", onClick: () => setDialog({ open: true, earning: null }) }}
        />
      ) : (
        !(error && !data) && (
          <>
            <div className={s.filters}>
              <SelectField label="Platform" value={platform} onChange={(v) => { setPlatform(v); setPage(1); }} options={[{ value: "", label: "All platforms" }, ...GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label }))]} />
              <SelectField label="Tax year" value={taxYear} onChange={(v) => { setTaxYear(v); setPage(1); }} options={[{ value: "", label: "All time" }, ...years.map((y) => ({ value: y, label: y }))]} />
            </div>
            {data && (
              <p className={s.totalLine}>
                <strong>{formatPence(data.totalAmountPence)}</strong> from {data.total} {data.total === 1 ? "earning" : "earnings"}
                {filtered ? " in this filter" : ""}
              </p>
            )}
            <DataTable
              columns={columns}
              rows={data?.data ?? []}
              rowKey={(r) => r.id}
              loading={loading && !data}
              onRowClick={(r) => setDialog({ open: true, earning: r })}
              empty={<EmptyState icon="cash-outline" title="No earnings match" body="Try another platform or tax year." action={{ label: "Clear filters", onClick: () => { setPlatform(""); setTaxYear(""); setPage(1); } }} />}
            />
            {data && data.totalPages > 1 && (
              <nav className={s.pager} aria-label="Pages">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span>
                  Page {data.page} of {data.totalPages}
                </span>
                <Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </nav>
            )}
            <p className={s.hint}>Snap a statement in the MileClear app and it lands here.</p>
          </>
        )
      )}

      <EarningDialog open={dialog.open} earning={dialog.earning} onClose={() => setDialog({ open: false, earning: null })} onSaved={reload} />
    </>
  );
}

export default function Page() {
  return (
    <SelfEmployedOnly title="Earnings">
      <EarningsList />
    </SelfEmployedOnly>
  );
}
