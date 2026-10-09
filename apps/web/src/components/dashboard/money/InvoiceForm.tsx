"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { computeInvoiceTotals } from "@mileclear/shared";
import { api, isApiError } from "@/lib/api";
import { formatPence } from "@/lib/dashboard/format";
import { planHref } from "@/lib/dashboard/proReasons";
import { Button, Card, DateField, MoneyField, SelectField, TextArea, TextField, Toggle, useData, useMe, useToast } from "../kit";
import { todayIso } from "./format";
import { LinkEarningDialog } from "./LinkEarningDialog";
import { addDays, type Client, type EarningMatch, type Invoice, type InvoiceMutation } from "./invoiceTypes";
import s from "./money.module.css";

interface Line {
  key: number;
  description: string;
  quantity: string;
  unitPence: number | null;
}

let lineKey = 1;
const newLine = (): Line => ({ key: lineKey++, description: "", quantity: "1", unitPence: null });

type Errors = Partial<Record<"who" | "amount" | "sent" | "due" | "email", string>>;

/** Create or edit an invoice. `invoice` is the full record with line items when editing. */
export function InvoiceForm({ invoice }: { invoice?: Invoice }) {
  const router = useRouter();
  const toast = useToast();
  const { isPro } = useMe();
  const clients = useData<Client[]>("clients", () => api.get<{ data: Client[] }>("/clients").then((r) => r.data));

  const [clientId, setClientId] = useState(invoice?.clientId ?? "");
  const [company, setCompany] = useState(invoice?.clientId ? "" : invoice?.company ?? "");
  const [email, setEmail] = useState(invoice?.clientEmail ?? "");
  const [reference, setReference] = useState(invoice?.reference ?? "");
  const [lines, setLines] = useState<Line[]>(
    (invoice?.lineItems ?? []).map((l) => ({ key: lineKey++, description: l.description, quantity: String(Number(l.quantity)), unitPence: l.unitPricePence }))
  );
  const [amount, setAmount] = useState<number | null>(invoice ? invoice.subtotalPence ?? invoice.amountPence : null);
  const [vat, setVat] = useState(invoice?.vatRate != null ? String(invoice.vatRate) : "");
  const [sentAt, setSentAt] = useState(invoice ? invoice.sentAt.slice(0, 10) : todayIso());
  const [dueAt, setDueAt] = useState(invoice ? invoice.dueAt.slice(0, 10) : addDays(todayIso(), 30));
  const dueTouched = useRef(!!invoice);
  const [paidAt, setPaidAt] = useState(invoice?.paidAt ? invoice.paidAt.slice(0, 10) : "");
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [writeOff, setWriteOff] = useState(invoice?.status === "written_off");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [matches, setMatches] = useState<{ invoiceId: string; list: EarningMatch[] } | null>(null);

  useEffect(() => {
    if (!dueTouched.current && sentAt) setDueAt(addDays(sentAt, 30));
  }, [sentAt]);

  const usable = lines.filter((l) => l.description.trim() && parseFloat(l.quantity) > 0 && l.unitPence !== null);
  const vatRate = vat === "" ? null : parseInt(vat, 10);
  const preview =
    usable.length > 0
      ? computeInvoiceTotals(usable.map((l) => ({ description: l.description.trim(), quantity: parseFloat(l.quantity), unitPricePence: l.unitPence ?? 0 })), vatRate)
      : (() => {
          const net = amount ?? 0;
          const v = vatRate ? Math.round((net * vatRate) / 100) : 0;
          return { subtotalPence: net, vatPence: v, amountPence: net + v, lines: [] };
        })();

  const updateLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function save() {
    const next: Errors = {};
    if (!clientId && !company.trim()) next.who = "Who is the invoice to? Pick a client or enter a name.";
    if (usable.length === 0 && (amount === null || amount <= 0)) next.amount = "Enter an amount or add at least one line.";
    if (!sentAt) next.sent = "Pick the date you sent it.";
    if (!dueAt) next.due = "Pick a due date.";
    if (email && !/^\S+@\S+\.\S+$/.test(email)) next.email = "That doesn't look like an email address.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        company: company.trim() || undefined,
        clientId: clientId || null,
        clientEmail: email.trim() || null,
        reference: reference.trim() || null,
        ...(usable.length > 0
          ? { lineItems: usable.map((l) => ({ description: l.description.trim(), quantity: parseFloat(l.quantity), unitPricePence: l.unitPence ?? 0 })) }
          : { amountPence: amount, ...(invoice ? { lineItems: [] } : {}) }),
        vatRate,
        sentAt,
        dueAt,
        paidAt: paidAt || null,
        notes: notes.trim() || null,
        ...(invoice ? { writeOff } : {}),
      };
      const res = invoice ? await api.patch<InvoiceMutation>(`/invoices/${invoice.id}`, body) : await api.post<InvoiceMutation>("/invoices", body);
      toast.show("Saved");
      const found = res.potentialEarningMatches ?? [];
      if (found.length > 0) setMatches({ invoiceId: res.data.id, list: found });
      else router.push(`/dashboard/invoices/${res.data.id}`);
    } catch (e) {
      if (isApiError(e) && e.code === "PREMIUM_REQUIRED") setFormError("You've used your 3 free invoices this month. Upgrade to Pro for unlimited.");
      else setFormError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const clientOptions = [{ value: "", label: "Someone not in my clients" }, ...(clients.data ?? []).map((c) => ({ value: c.id, label: c.name }))];

  return (
    <div className={s.stack}>
      <Card title="Who is it for?">
        <div className={s.form}>
          <SelectField label="Client" value={clientId} onChange={(v) => { setClientId(v); const c = clients.data?.find((x) => x.id === v); if (c?.email) setEmail(c.email); }} options={clientOptions} />
          {!clientId && <TextField label="Name or company" value={company} onChange={setCompany} error={errors.who} maxLength={200} />}
          {clientId && errors.who && <p className={s.formError} role="alert">{errors.who}</p>}
          <TextField label="Client email" type="email" value={email} onChange={setEmail} required={false} error={errors.email} hint="Used when you email the invoice." />
          <TextField label="Your reference" value={reference} onChange={setReference} required={false} maxLength={80} />
        </div>
      </Card>

      <Card title="What for?">
        <div className={s.form}>
          {lines.map((l) => (
            <div key={l.key} className={s.lineItem}>
              <TextField label="Description" value={l.description} onChange={(v) => updateLine(l.key, { description: v })} maxLength={300} />
              <TextField label="Quantity" value={l.quantity} onChange={(v) => updateLine(l.key, { quantity: v.replace(/[^0-9.]/g, "") })} />
              <MoneyField label="Price each" value={l.unitPence} onChange={(v) => updateLine(l.key, { unitPence: v })} />
              <Button variant="ghost" size="sm" aria-label="Remove this line" icon="trash-outline" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />
            </div>
          ))}
          {lines.length === 0 && <MoneyField label="Amount" value={amount} onChange={setAmount} error={errors.amount} hint="Or add lines below to build the invoice." />}
          {lines.length > 0 && errors.amount && <p className={s.formError} role="alert">{errors.amount}</p>}
          <div className={s.actions}>
            <Button variant="secondary" size="sm" icon="add" onClick={() => setLines((ls) => [...ls, newLine()])}>
              Add a line
            </Button>
          </div>
          <SelectField label="VAT" value={vat} onChange={setVat} options={[{ value: "", label: "No VAT" }, { value: "0", label: "0%" }, { value: "5", label: "5%" }, { value: "20", label: "20%" }]} />
          <div className={s.totals} aria-live="polite">
            {preview.vatPence > 0 && <span>Subtotal {formatPence(preview.subtotalPence ?? 0)}</span>}
            {preview.vatPence > 0 && <span>VAT {formatPence(preview.vatPence)}</span>}
            <strong>Total {formatPence(preview.amountPence)}</strong>
          </div>
        </div>
      </Card>

      <Card title="Dates">
        <div className={s.form}>
          <div className={s.formRow}>
            <DateField label="Sent" value={sentAt} onChange={setSentAt} error={errors.sent} />
            <DateField label="Due" value={dueAt} onChange={(v) => { dueTouched.current = true; setDueAt(v); }} error={errors.due} />
          </div>
          <DateField label="Paid on" value={paidAt} onChange={setPaidAt} required={false} hint="Leave blank until it's paid." />
          <TextArea label="Notes" value={notes} onChange={setNotes} required={false} rows={3} maxLength={2000} />
          {invoice && <Toggle label="Written off" value={writeOff} onChange={setWriteOff} hint="Stop chasing it and take it out of what you're owed." />}
        </div>
      </Card>

      {formError && (
        <p className={s.formError} role="alert">
          {formError}{" "}
          {!isPro && formError.includes("free invoices") && (
            <a className="mc-textlink" href={planHref("invoices")}>
              Upgrade to Pro
            </a>
          )}
        </p>
      )}
      <div className={s.actions}>
        <Button variant="primary" loading={saving} onClick={save}>
          {invoice ? "Save changes" : "Create invoice"}
        </Button>
        <Button variant="ghost" href={invoice ? `/dashboard/invoices/${invoice.id}` : "/dashboard/invoices"}>
          Cancel
        </Button>
      </div>

      {matches && (
        <LinkEarningDialog
          open
          invoiceId={matches.invoiceId}
          matches={matches.list}
          onClose={() => router.push(`/dashboard/invoices/${matches.invoiceId}`)}
          onLinked={() => {}}
        />
      )}
    </div>
  );
}
