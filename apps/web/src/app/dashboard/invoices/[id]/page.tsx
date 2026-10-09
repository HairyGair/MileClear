"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { formatInvoiceNumber } from "@mileclear/shared";
import { api, fetchWithAuth } from "@/lib/api";
import { formatPence } from "@/lib/dashboard/format";
import { formatDay } from "@/lib/dashboard/dates";
import { planHref } from "@/lib/dashboard/proReasons";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, ProChip, Skeleton, StatusChip, Toggle, useData, useMe, useToast } from "@/components/dashboard/kit";
import { SelfEmployedOnly } from "@/components/dashboard/money/Company";
import { dayLabel, todayIso } from "@/components/dashboard/money/format";
import { InvoiceForm } from "@/components/dashboard/money/InvoiceForm";
import { LinkEarningDialog } from "@/components/dashboard/money/LinkEarningDialog";
import { STATUS_META, type EarningMatch, type Invoice, type InvoiceMutation } from "@/components/dashboard/money/invoiceTypes";
import s from "@/components/dashboard/money/money.module.css";

const BACK = { href: "/dashboard/invoices", label: "Invoices" };

interface InvoiceEmail {
  id: string;
  kind: string;
  toEmail: string;
  subject: string;
  status: string;
  createdAt: string;
}

interface FullInvoice extends Invoice {
  client?: { id: string; name: string; email: string | null } | null;
}

function Detail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { isPro } = useMe();
  const inv = useData<FullInvoice>(`invoice-${id}`, () => api.get<{ data: FullInvoice }>(`/invoices/${id}`).then((r) => r.data));
  const emails = useData<InvoiceEmail[]>(isPro ? `invoice-emails-${id}` : null, () => api.get<{ data: InvoiceEmail[] }>(`/invoices/${id}/emails`).then((r) => r.data));

  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"send" | "delete" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [link, setLink] = useState<EarningMatch[] | null>(null);
  const [linkManual, setLinkManual] = useState(false);

  if (inv.loading && !inv.data) {
    return (
      <>
        <PageHeader title="Invoice" back={BACK} />
        <Skeleton variant="card" count={2} />
      </>
    );
  }
  if (inv.error && !inv.data) {
    const notFound = /not found/i.test(inv.error.message);
    return (
      <>
        <PageHeader title="Invoice" back={BACK} />
        {notFound ? (
          <EmptyState icon="document-text-outline" title="Invoice not found" body="It may have been deleted." action={{ label: "Back to invoices", href: "/dashboard/invoices" }} />
        ) : (
          <ErrorState title="Couldn't load this invoice" onRetry={inv.reload} />
        )}
      </>
    );
  }
  const i = inv.data;
  if (!i) return null;

  if (editing) {
    return (
      <>
        <PageHeader title="Edit invoice" back={{ href: `/dashboard/invoices/${id}`, label: "Invoice" }} />
        <InvoiceForm invoice={i} />
      </>
    );
  }

  const label = i.invoiceNumber != null ? formatInvoiceNumber(i.invoiceNumber) : "Invoice";
  const meta = STATUS_META[i.status];

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Couldn't do that. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const markPaid = () =>
    run("paid", async () => {
      const res = await api.patch<InvoiceMutation>(`/invoices/${id}`, { paidAt: todayIso() });
      toast.show("Marked as paid");
      inv.reload();
      if ((res.potentialEarningMatches ?? []).length > 0) {
        setLinkManual(false);
        setLink(res.potentialEarningMatches ?? []);
      }
    });

  const pdf = () =>
    run("pdf", async () => {
      const res = await fetchWithAuth(`/invoices/${id}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? (typeof body?.error === "string" ? body.error : `Download failed (${res.status})`));
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${label}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      inv.reload();
    });

  const openLinkDialog = () =>
    run("link", async () => {
      const res = await api.get<{ data: Array<EarningMatch & { replacedByInvoiceId?: string | null }> }>("/earnings?pageSize=20");
      setLinkManual(true);
      setLink(res.data.filter((e) => !e.replacedByInvoiceId));
    });

  const unlink = () =>
    run("unlink", async () => {
      await api.post(`/invoices/${id}/unlink-earning`, {});
      toast.show("Links removed");
    });

  const chase = (on: boolean) =>
    run("chase", async () => {
      await api.patch(`/invoices/${id}`, { autoChaseEnabled: on });
      inv.reload();
      toast.show("Saved");
    });

  const lines = i.lineItems ?? [];

  return (
    <>
      <PageHeader
        title={label}
        back={BACK}
        primary={
          i.paidAt || i.status === "written_off" ? undefined : (
            <Button variant="primary" loading={busy === "paid"} onClick={markPaid}>
              Mark as paid
            </Button>
          )
        }
        secondary={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />
      {problem && (
        <p className={s.formError} role="alert">
          {problem}
        </p>
      )}
      <div className={s.detailGrid}>
        <div className={s.stack}>
          <Card title={i.company}>
            <div className={s.kv}>
              <span className={s.kvKey}>Status</span>
              <StatusChip tone={meta.tone} label={meta.label} />
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Sent</span>
              <span>{dayLabel(i.sentAt)}</span>
            </div>
            <div className={s.kv}>
              <span className={s.kvKey}>Due</span>
              <span>{dayLabel(i.dueAt)}</span>
            </div>
            {i.paidAt && (
              <div className={s.kv}>
                <span className={s.kvKey}>Paid</span>
                <span>{dayLabel(i.paidAt)}</span>
              </div>
            )}
            {i.reference && (
              <div className={s.kv}>
                <span className={s.kvKey}>Reference</span>
                <span>{i.reference}</span>
              </div>
            )}
            {i.clientEmail && (
              <div className={s.kv}>
                <span className={s.kvKey}>Email</span>
                <span>{i.clientEmail}</span>
              </div>
            )}
          </Card>

          <Card title="What for">
            {lines.map((l, n) => (
              <div key={n} className={s.kv}>
                <span>
                  {l.description} <span className={s.rowSub}>x {Number(l.quantity)}</span>
                </span>
                <span className={s.rowFig}>{formatPence(Math.round(Number(l.quantity) * l.unitPricePence))}</span>
              </div>
            ))}
            {i.vatPence != null && i.vatPence > 0 && (
              <div className={s.kv}>
                <span className={s.kvKey}>VAT {i.vatRate}%</span>
                <span className={s.rowFig}>{formatPence(i.vatPence)}</span>
              </div>
            )}
            <div className={s.kv}>
              <strong>Total</strong>
              <strong className={s.rowFig}>{formatPence(i.amountPence)}</strong>
            </div>
            {i.notes && <p className={s.hint}>{i.notes}</p>}
          </Card>

          {isPro && emails.data && emails.data.length > 0 && (
            <Card title="Emails sent">
              {emails.data.map((m) => (
                <div key={m.id} className={s.kv}>
                  <span className={s.rowMain}>
                    <span>{m.kind === "chase" ? "Reminder" : "Invoice"} to {m.toEmail}</span>
                    <span className={s.rowSub}>{formatDay(m.createdAt)}</span>
                  </span>
                  <StatusChip tone={m.status === "sent" ? "green" : "neutral"} label={m.status} />
                </div>
              ))}
            </Card>
          )}
        </div>

        <div className={s.stack}>
          <Card title="Send it">
            <div className={s.actions}>
              {isPro ? (
                <>
                  <Button variant="secondary" loading={busy === "pdf"} onClick={pdf}>
                    Download PDF
                  </Button>
                  <Button variant="secondary" onClick={() => setConfirm("send")}>
                    Email to client
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" href={planHref("invoices")}>
                    Download PDF <ProChip />
                  </Button>
                  <Button variant="secondary" href={planHref("invoices")}>
                    Email to client <ProChip />
                  </Button>
                </>
              )}
            </div>
            {isPro ? (
              <Toggle label="Chase automatically" value={i.autoChaseEnabled} disabled={busy === "chase"} onChange={chase} hint="Polite reminders 3 days before it's due, then 3, 10 and 21 days after." />
            ) : (
              <p className={s.hint}>
                Chase automatically <ProChip />{" "}
                <a className="mc-textlink" href={planHref("invoices")}>
                  Upgrade to Pro
                </a>
              </p>
            )}
          </Card>

          <Card title="Payment">
            <p className={s.hint}>Already added this payment under Earnings? Link it so it isn&apos;t counted twice.</p>
            <div className={s.actions}>
              <Button variant="secondary" loading={busy === "link"} onClick={openLinkDialog}>
                Link a payment
              </Button>
              <Button variant="ghost" loading={busy === "unlink"} onClick={unlink}>
                Remove links
              </Button>
            </div>
          </Card>

          <Button variant="destructive" onClick={() => setConfirm("delete")}>
            Delete invoice
          </Button>
        </div>
      </div>

      <LinkEarningDialog
        open={link !== null}
        invoiceId={id}
        matches={link ?? []}
        title={linkManual ? "Link a payment" : "Is one of these the same payment?"}
        onClose={() => setLink(null)}
        onLinked={inv.reload}
      />
      <ConfirmDialog
        open={confirm === "send"}
        title="Email this invoice?"
        body={`We email the PDF to ${i.clientEmail ?? "your client"}. Replies come straight to you.`}
        confirmLabel="Send"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api.post(`/invoices/${id}/send`, {});
          toast.show("Sent");
          inv.reload();
          emails.reload();
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this invoice?"
        body="It goes from your records and any totals. This can't be undone."
        confirmLabel="Delete"
        destructive
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          await api.delete(`/invoices/${id}`);
          toast.show("Deleted");
          router.push("/dashboard/invoices");
        }}
      />
    </>
  );
}

export default function Page() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  return (
    <SelfEmployedOnly title="Invoice" back={BACK}>
      <Detail id={id} />
    </SelfEmployedOnly>
  );
}
