"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatInvoiceNumber } from "@mileclear/shared";
import { api } from "@/lib/api";
import { formatPence } from "@/lib/dashboard/format";
import { planHref } from "@/lib/dashboard/proReasons";
import { Button, DataTable, EmptyState, ErrorState, FilterChips, PageHeader, StatusChip, useData, useMe, type Column } from "@/components/dashboard/kit";
import { SelfEmployedOnly } from "@/components/dashboard/money/Company";
import { dayLabel } from "@/components/dashboard/money/format";
import { FREE_INVOICES_PER_MONTH, STATUS_META, sentThisMonth, type Invoice, type InvoiceStatus } from "@/components/dashboard/money/invoiceTypes";
import s from "@/components/dashboard/money/money.module.css";

interface ListResponse {
  data: Invoice[];
  total: number;
  summary: Record<InvoiceStatus, { count: number; totalPence: number }>;
}

type Filter = "" | InvoiceStatus;
const FILTERS: { value: InvoiceStatus; label: string }[] = [
  { value: "sent", label: "Awaiting" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "written_off", label: "Written off" },
];

function InvoiceList() {
  const router = useRouter();
  const { isPro } = useMe();
  const [filter, setFilter] = useState<Filter>("");
  const { data, error, loading, reload } = useData<ListResponse>("invoices-all", () => api.get<ListResponse>("/invoices?pageSize=200"));

  const all = data?.data ?? [];
  const used = sentThisMonth(all);
  const limitReached = !isPro && used >= FREE_INVOICES_PER_MONTH;
  const rows = filter ? all.filter((i) => i.status === filter) : all;
  const isEmpty = !!data && all.length === 0;

  const newInvoice = (
    <Button variant="primary" icon="add" href="/dashboard/invoices/new" disabled={limitReached}>
      New invoice
    </Button>
  );

  const columns: Column<Invoice>[] = [
    { key: "client", label: "Invoice", render: (i) => `${i.invoiceNumber != null ? `${formatInvoiceNumber(i.invoiceNumber)} · ` : ""}${i.company}` },
    { key: "sent", label: "Sent", hideBelow: 768, render: (i) => dayLabel(i.sentAt) },
    { key: "due", label: "Due", render: (i) => dayLabel(i.dueAt) },
    { key: "status", label: "Status", render: (i) => <StatusChip tone={STATUS_META[i.status].tone} label={STATUS_META[i.status].label} /> },
    { key: "amount", label: "Amount", align: "right", render: (i) => formatPence(i.amountPence) },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        primary={isEmpty ? undefined : newInvoice}
        secondary={
          <Button variant="secondary" href="/dashboard/invoices/clients">
            Clients
          </Button>
        }
      >
        {!isPro && data && (
          <span className={s.counter}>
            <strong>{Math.min(used, FREE_INVOICES_PER_MONTH)} of {FREE_INVOICES_PER_MONTH}</strong> used this month
          </span>
        )}
      </PageHeader>

      {limitReached && (
        <p className={s.limit} role="status">
          You&apos;ve used your 3 free invoices this month.{" "}
          <a className="mc-textlink" href={planHref("invoices")}>
            Upgrade to Pro for unlimited.
          </a>
        </p>
      )}

      {error && !data && <ErrorState title="Couldn't load your invoices" onRetry={reload} />}

      {isEmpty ? (
        <EmptyState icon="document-text-outline" title="No invoices yet" body="Bill a client in a minute. The first 3 each month are free." action={{ label: "New invoice", href: "/dashboard/invoices/new" }} />
      ) : (
        !(error && !data) && (
          <>
            <FilterChips<InvoiceStatus> ariaLabel="Filter by status" single options={FILTERS} value={filter ? [filter] : []} onChange={(v) => setFilter(v[0] ?? "")} />
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(i) => i.id}
              loading={loading && !data}
              onRowClick={(i) => router.push(`/dashboard/invoices/${i.id}`)}
              empty={<EmptyState icon="document-text-outline" title="No invoices match" body="Try another status." action={{ label: "Clear filter", onClick: () => setFilter("") }} />}
            />
          </>
        )
      )}
    </>
  );
}

export default function Page() {
  return (
    <SelfEmployedOnly title="Invoices">
      <InvoiceList />
    </SelfEmployedOnly>
  );
}
