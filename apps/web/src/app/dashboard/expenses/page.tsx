"use client";

import { useMemo, useState } from "react";
import type { ExpenseSummary, TaxEstimate } from "@mileclear/shared";
import { EXPENSE_CATEGORIES } from "@mileclear/shared";
import { api } from "@/lib/api";
import { formatPence } from "@/lib/dashboard/format";
import { BarList } from "@/components/dashboard/charts";
import { Button, Card, EmptyState, ErrorState, Figure, PageHeader, SelectField, Skeleton, StatusChip, useData } from "@/components/dashboard/kit";
import { ExpenseDialog, type ExpenseRow } from "@/components/dashboard/money/ExpenseDialog";
import { dayLabel, monthKey, monthLabel } from "@/components/dashboard/money/format";
import s from "@/components/dashboard/money/money.module.css";

interface ListResponse {
  data: ExpenseRow[];
  total: number;
  page: number;
  totalPages: number;
}
interface SummaryResponse {
  data: ExpenseSummary[];
  taxYear: string;
}

const catLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;
const PAGE_SIZE = 100;

function TaxEstimateCard() {
  const { data, error, loading, reload } = useData<TaxEstimate>("expenses-tax-estimate", () => api.get<{ data: TaxEstimate }>("/expenses/tax-estimate").then((r) => r.data));
  if (loading && !data) return <Skeleton variant="card" />;
  if (error) return <ErrorState size="card" title="Couldn't load your tax estimate" onRetry={reload} />;
  if (!data || (data.grossEarningsPence === 0 && data.allowableExpensesPence === 0 && data.mileageDeductionPence === 0)) return null;
  return (
    <Card title={`Tax estimate, ${data.taxYear}`}>
      <div className={s.summaryGrid}>
        <Figure label="Earned" value={formatPence(data.grossEarningsPence)} />
        <Figure label="Taken off" value={formatPence(data.mileageDeductionPence + data.allowableExpensesPence)} sub="Mileage and expenses" />
        <Figure label="Taxable profit" value={formatPence(data.taxableProfitPence)} />
        <Figure label="Tax and NI (estimate)" value={formatPence(data.totalTaxOwedPence)} estimated />
      </div>
    </Card>
  );
}

export default function Page() {
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; expense: ExpenseRow | null }>({ open: false, expense: null });

  const list = useData<ListResponse>(`expenses-${category}-${page}`, () => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (category) q.set("category", category);
    return api.get<ListResponse>(`/expenses?${q}`);
  });
  const summary = useData<SummaryResponse>("expenses-summary", () => api.get<SummaryResponse>("/expenses/summary"));

  const reloadAll = () => {
    list.reload();
    summary.reload();
  };

  const groups = useMemo(() => {
    const map = new Map<string, ExpenseRow[]>();
    for (const e of list.data?.data ?? []) {
      const k = monthKey(e.date);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
  }, [list.data]);

  const isEmpty = !!list.data && list.data.total === 0 && category === "";
  const openAdd = () => setDialog({ open: true, expense: null });

  const top = (summary.data?.data ?? []).slice().sort((a, b) => b.totalPence - a.totalPence).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Expenses"
        primary={
          isEmpty ? undefined : (
            <Button variant="primary" icon="add" onClick={openAdd}>
              Add expense
            </Button>
          )
        }
      />

      {list.error && !list.data && <ErrorState title="Couldn't load your expenses" onRetry={list.reload} />}

      {isEmpty ? (
        <EmptyState icon="receipt-outline" title="No expenses yet" body="Add parking, tolls and other work costs to lower your tax." action={{ label: "Add expense", onClick: openAdd }} />
      ) : (
        !(list.error && !list.data) && (
          <div className={s.stack}>
            <TaxEstimateCard />
            {top.length > 0 && summary.data && (
              <Card title={`Where it went, ${summary.data.taxYear}`}>
                <BarList label="Expenses by category" items={top.map((r) => ({ name: catLabel(r.category), value: r.totalPence, display: formatPence(r.totalPence) }))} />
              </Card>
            )}

            <SelectField label="Category" value={category} onChange={(v) => { setCategory(v); setPage(1); }} options={[{ value: "", label: "All categories" }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]} />

            {list.loading && !list.data && <Skeleton variant="row" count={5} />}
            {list.data && list.data.total === 0 && (
              <EmptyState icon="receipt-outline" title="No expenses match" body="Try another category." action={{ label: "Clear filters", onClick: () => setCategory("") }} />
            )}
            {groups.map(([key, rows]) => (
              <div key={key} className="mc-card mc-card--flush">
                <div className={s.monthHead}>
                  <span>{monthLabel(key)}</span>
                  <strong>{formatPence(rows.reduce((n, r) => n + r.amountPence, 0))}</strong>
                </div>
                {rows.map((e) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.value === e.category);
                  return (
                    <button key={e.id} type="button" className={s.rowBtn} onClick={() => setDialog({ open: true, expense: e })}>
                      <span className={s.rowMain}>
                        <span className={s.rowTitle}>{e.vendor || catLabel(e.category)}</span>
                        <span className={s.rowSub}>
                          {dayLabel(e.date)} · {catLabel(e.category)}
                        </span>
                        {cat && !cat.deductibleWithMileage && <StatusChip tone="neutral" label="Covered by the mileage rate" />}
                      </span>
                      <span className={s.rowFig}>{formatPence(e.amountPence)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {list.data && list.data.totalPages > 1 && (
              <nav className={s.pager} aria-label="Pages">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span>
                  Page {list.data.page} of {list.data.totalPages}
                </span>
                <Button variant="secondary" size="sm" disabled={page >= list.data.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </nav>
            )}
            <p className={s.hint}>Scan a receipt in the MileClear app and it fills this in.</p>
          </div>
        )
      )}

      <ExpenseDialog open={dialog.open} expense={dialog.expense} onClose={() => setDialog({ open: false, expense: null })} onSaved={reloadAll} />
    </>
  );
}
