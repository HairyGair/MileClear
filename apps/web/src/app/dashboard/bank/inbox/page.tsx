"use client";

import { useState } from "react";
import { EXPENSE_CATEGORIES, GIG_PLATFORMS } from "@mileclear/shared";
import { api } from "@/lib/api";
import { formatPence } from "@/lib/dashboard/format";
import { Button, Card, Dialog, EmptyState, ErrorState, PageHeader, SelectField, Skeleton, useData, useToast } from "@/components/dashboard/kit";
import { ProPage, SelfEmployedOnly } from "@/components/dashboard/money/Company";
import { dayLabel } from "@/components/dashboard/money/format";
import s from "@/components/dashboard/money/money.module.css";

interface BankTransaction {
  id: string;
  merchant: string;
  descriptionRaw: string | null;
  /** Signed: positive is money in. */
  amountPence: number;
  transactionDate: string;
  suggestedKind: "earning" | "expense" | "invoice_payment" | "unknown" | null;
  suggestedCategory: string | null;
}

interface InboxResponse {
  data: BankTransaction[];
  total: number;
}

type Sorting = { txn: BankTransaction; kind: "earning" | "expense" };

function Inbox() {
  const toast = useToast();
  const inbox = useData<InboxResponse>("bank-inbox", () => api.get<InboxResponse>("/inbox?pageSize=100"));
  const banks = useData<unknown[]>("bank-connections-count", () => api.get<{ data: unknown[] }>("/earnings/open-banking/connections").then((r) => r.data));
  const [sorting, setSorting] = useState<Sorting | null>(null);
  const [choice, setChoice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);

  const items = (inbox.data?.data ?? []).filter((t) => !removed.includes(t.id));

  function start(txn: BankTransaction, kind: "earning" | "expense") {
    setProblem(null);
    const suggestion = txn.suggestedKind === kind ? txn.suggestedCategory ?? "" : "";
    setChoice(suggestion);
    setSorting({ txn, kind });
  }

  async function call(txn: BankTransaction, path: string, body: unknown, done: string) {
    setBusyId(txn.id);
    setProblem(null);
    try {
      await api.post(path, body);
      setRemoved((r) => [...r, txn.id]);
      toast.show(done);
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't do that. Try again.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function accept() {
    if (!sorting) return;
    if (!choice) {
      setProblem(sorting.kind === "earning" ? "Pick a platform." : "Pick a category.");
      return;
    }
    const body = sorting.kind === "earning" ? { kind: "earning", platform: choice } : { kind: "expense", category: choice };
    if (await call(sorting.txn, `/inbox/${sorting.txn.id}/accept`, body, sorting.kind === "earning" ? "Added to earnings" : "Added to expenses")) setSorting(null);
  }

  const noBank = !!banks.data && banks.data.length === 0;

  return (
    <>
      <PageHeader title="Bank inbox" back={{ href: "/dashboard/bank", label: "Link a bank" }} />
      {inbox.loading && !inbox.data && <Skeleton variant="row" count={4} />}
      {inbox.error && !inbox.data && <ErrorState title="Couldn't load your bank payments" onRetry={inbox.reload} />}
      {problem && !sorting && (
        <p className={s.formError} role="alert">
          {problem}
        </p>
      )}
      {inbox.data && items.length === 0 && (
        noBank ? (
          <EmptyState icon="business-outline" title="Link a bank first" body="Payments from your bank appear here to sort." action={{ label: "Link a bank", href: "/dashboard/bank" }} />
        ) : (
          <EmptyState icon="checkmark-circle-outline" title="All sorted" body="No payments waiting." />
        )
      )}
      {items.length > 0 && (
        <div className={s.stack}>
          {items.map((t) => {
            const credit = t.amountPence > 0;
            const suggestInvoice = t.suggestedKind === "invoice_payment" && !!t.suggestedCategory;
            return (
              <Card key={t.id}>
                <div className={s.kv}>
                  <span className={s.rowMain}>
                    <span className={s.rowTitle}>{t.merchant}</span>
                    <span className={s.rowSub}>{dayLabel(t.transactionDate)}</span>
                  </span>
                  <span className={`${s.txnAmount} ${credit ? s.txnCredit : ""}`}>
                    {credit ? "+" : "-"}
                    {formatPence(Math.abs(t.amountPence))}
                  </span>
                </div>
                <div className={s.txnButtons}>
                  <Button variant="secondary" size="sm" disabled={busyId === t.id} onClick={() => start(t, "earning")}>
                    Earning
                  </Button>
                  <Button variant="secondary" size="sm" disabled={busyId === t.id} onClick={() => start(t, "expense")}>
                    Expense
                  </Button>
                  {suggestInvoice && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busyId === t.id}
                      onClick={() => call(t, `/inbox/${t.id}/accept`, { kind: "invoice_payment", invoiceId: t.suggestedCategory }, "Invoice marked as paid")}
                    >
                      Invoice payment
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" disabled={busyId === t.id} onClick={() => call(t, `/inbox/${t.id}/ignore`, undefined, "Ignored")}>
                    Ignore
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={sorting !== null}
        title={sorting?.kind === "earning" ? "Add as an earning" : "Add as an expense"}
        size="sm"
        onClose={() => setSorting(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSorting(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={busyId === sorting?.txn.id} onClick={accept}>
              Save
            </Button>
          </>
        }
      >
        {sorting && (
          <div className={s.form}>
            <p className={s.totalLine}>
              {sorting.txn.merchant}, {formatPence(Math.abs(sorting.txn.amountPence))}
            </p>
            <SelectField
              label={sorting.kind === "earning" ? "Platform" : "Category"}
              value={choice}
              onChange={setChoice}
              options={[
                { value: "", label: sorting.kind === "earning" ? "Choose a platform" : "Choose a category" },
                ...(sorting.kind === "earning" ? GIG_PLATFORMS : EXPENSE_CATEGORIES).map((o) => ({ value: o.value, label: o.label })),
              ]}
            />
            {problem && (
              <p className={s.formError} role="alert">
                {problem}
              </p>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}

export default function Page() {
  const back = { href: "/dashboard/bank", label: "Link a bank" };
  return (
    <SelfEmployedOnly title="Bank inbox" back={back}>
      <ProPage title="Bank inbox" back={back} reason="bank" teaser={<p>Sort payments from your bank into earnings and expenses.</p>}>
        <Inbox />
      </ProPage>
    </SelfEmployedOnly>
  );
}
