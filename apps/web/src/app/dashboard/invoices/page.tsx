"use client";

// Sole-trader invoice tracker - web parity with the mobile screens
// (invoices.tsx / invoice-form.tsx), 5 Jul 2026. Same deliberate scope:
// a tidy list with paid/unpaid status, the anti-double-count link flow,
// and the Phase-1 late-payment chase (a mailto draft in the user's own
// mail client - the template lives in @mileclear/shared so the legal
// wording can't drift from mobile).

import { useEffect, useState, useCallback } from "react";
import { api, isApiError, fetchWithAuth } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Modal } from "../../../components/ui/Modal";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import {
  formatPence,
  buildInvoiceChaseMailto,
  invoiceDaysOverdue,
  computeInvoiceTotals,
  formatInvoiceNumber,
} from "@mileclear/shared";

type InvoiceStatus = "sent" | "paid" | "overdue" | "written_off";

interface Invoice {
  id: string;
  company: string;
  clientId: string | null;
  clientEmail: string | null;
  reference: string | null;
  invoiceNumber: number | null;
  amountPence: number;
  subtotalPence: number | null;
  vatRate: number | null;
  vatPence: number | null;
  sentAt: string;
  dueAt: string;
  paidAt: string | null;
  status: InvoiceStatus;
  notes: string | null;
  emailedAt: string | null;
  autoChaseEnabled: boolean;
  nextChaseAt: string | null;
}

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  archivedAt: string | null;
  _count?: { invoices: number };
}

interface LineItemDraft {
  description: string;
  quantity: string; // input strings; parsed on save/preview
  unitPrice: string; // pounds
}

function parseLineDrafts(drafts: LineItemDraft[]) {
  return drafts
    .filter((d) => d.description.trim() && parseFloat(d.quantity) > 0 && parseFloat(d.unitPrice) >= 0)
    .map((d) => ({
      description: d.description.trim(),
      quantity: parseFloat(d.quantity),
      unitPricePence: Math.round(parseFloat(d.unitPrice) * 100),
    }));
}

interface PotentialEarningMatch {
  id: string;
  platform: string;
  amountPence: number;
  periodStart: string;
  notes: string | null;
  daysFromAnchor: number;
}

interface InvoiceListResponse {
  data: Invoice[];
  total: number;
  summary: Record<InvoiceStatus, { count: number; totalPence: number }>;
}

interface MutationResponse {
  data: Invoice;
  potentialEarningMatches?: PotentialEarningMatch[];
}

const STATUS_META: Record<InvoiceStatus, { label: string; variant: "source" | "danger" | "success" }> = {
  sent: { label: "Awaiting", variant: "source" },
  overdue: { label: "Overdue", variant: "danger" },
  paid: { label: "Paid", variant: "success" },
  written_off: { label: "Written off", variant: "source" },
};

const FILTER_OPTIONS = [
  { value: "", label: "All invoices" },
  { value: "sent", label: "Awaiting payment" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "written_off", label: "Written off" },
];

function isoDatePlusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const senderName = user?.fullName || user?.displayName || null;
  const isPremium = user?.isPremium === true;
  // One-tap chase is Pro (5 Jul 2026) - tracking stays free at 3/month.
  const [showChaseUpsell, setShowChaseUpsell] = useState(false);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceListResponse["summary"] | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"invoices" | "clients">("invoices");
  const [clients, setClients] = useState<Client[]>([]);
  const vatRegistered = (user as any)?.vatRegistered === true;

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formCompany, setFormCompany] = useState("");
  const [formClientId, setFormClientId] = useState("");
  const [formClientEmail, setFormClientEmail] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formLines, setFormLines] = useState<LineItemDraft[]>([]);
  const [formVatRate, setFormVatRate] = useState("");
  const [formSentAt, setFormSentAt] = useState("");
  const [formDueAt, setFormDueAt] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [formPaidAt, setFormPaidAt] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formWriteOff, setFormWriteOff] = useState(false);
  const [formAutoChase, setFormAutoChase] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Link-or-keep flow after marking paid (anti-double-count - mirrors
  // the mobile LinkEarningSheet).
  const [linkState, setLinkState] = useState<{ invoice: Invoice; matches: PotentialEarningMatch[] } | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  const resetForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditId(null);
    setFormCompany("");
    setFormClientId("");
    setFormClientEmail("");
    setFormReference("");
    setFormAmount("");
    setFormLines([]);
    setFormVatRate("");
    setFormSentAt(today);
    setFormDueAt(isoDatePlusDays(today, 30));
    setDueTouched(false);
    setFormPaidAt("");
    setFormNotes("");
    setFormWriteOff(false);
    setFormAutoChase(false);
    setFormError(null);
  };

  const loadClients = useCallback(async () => {
    try {
      const res = await api.get<{ data: Client[] }>("/clients");
      setClients(res.data);
    } catch {
      setClients([]);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: "200" });
      if (filter) params.set("status", filter);
      const res = await api.get<InvoiceListResponse>(`/invoices?${params}`);
      setInvoices(res.data);
      setSummary(res.summary);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  // Keep due date tracking sent+30 until the user edits it directly
  // (same behaviour as the mobile form).
  useEffect(() => {
    if (!dueTouched && formSentAt) setFormDueAt(isoDatePlusDays(formSentAt, 30));
  }, [formSentAt, dueTouched]);

  const openEdit = async (inv: Invoice) => {
    setEditId(inv.id);
    setFormCompany(inv.company);
    setFormClientId(inv.clientId ?? "");
    setFormClientEmail(inv.clientEmail ?? "");
    setFormReference(inv.reference ?? "");
    // Show the NET amount for direct-entry VAT invoices (the API treats
    // amountPence input as net when vatRate is set and there are no lines).
    setFormAmount(((inv.subtotalPence ?? inv.amountPence) / 100).toFixed(2));
    setFormVatRate(inv.vatRate != null ? String(inv.vatRate) : "");
    setFormSentAt(inv.sentAt.slice(0, 10));
    setFormDueAt(inv.dueAt.slice(0, 10));
    setDueTouched(true);
    setFormPaidAt(inv.paidAt ? inv.paidAt.slice(0, 10) : "");
    setFormNotes(inv.notes ?? "");
    setFormWriteOff(inv.status === "written_off");
    setFormAutoChase(inv.autoChaseEnabled);
    setFormError(null);
    setFormLines([]);
    setShowForm(true);
    // Line items ride the detail endpoint, not the list - fetch after open.
    try {
      const res = await api.get<{ data: Invoice & { lineItems: Array<{ description: string; quantity: string | number; unitPricePence: number }> } }>(`/invoices/${inv.id}`);
      setFormLines(
        (res.data.lineItems ?? []).map((l) => ({
          description: l.description,
          quantity: String(Number(l.quantity)),
          unitPrice: (l.unitPricePence / 100).toFixed(2),
        }))
      );
    } catch {
      /* line editor stays empty; totals remain as stored */
    }
  };

  const handleSave = async () => {
    if (!formCompany.trim() && !formClientId) {
      setFormError("Who is the invoice to? Pick a client or enter a name.");
      return;
    }
    const lines = parseLineDrafts(formLines);
    const pounds = parseFloat(formAmount);
    if (lines.length === 0 && (!Number.isFinite(pounds) || pounds <= 0)) {
      setFormError("Enter an amount or add at least one line item");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const body = {
        company: formCompany.trim() || undefined,
        clientId: formClientId || null,
        clientEmail: formClientEmail.trim() || null,
        reference: formReference.trim() || null,
        ...(lines.length > 0
          ? { lineItems: lines }
          : { amountPence: Math.round(pounds * 100), lineItems: editId ? [] : undefined }),
        vatRate: formVatRate === "" ? null : (parseInt(formVatRate, 10) as 0 | 5 | 20),
        sentAt: formSentAt,
        dueAt: formDueAt,
        paidAt: formPaidAt || null,
        notes: formNotes.trim() || null,
        ...(editId ? { writeOff: formWriteOff, autoChaseEnabled: formAutoChase } : {}),
      };
      const res = editId
        ? await api.patch<MutationResponse>(`/invoices/${editId}`, body)
        : await api.post<MutationResponse>("/invoices", body);
      setShowForm(false);
      resetForm();
      const matches = res.potentialEarningMatches ?? [];
      if (matches.length > 0) {
        setLinkState({ invoice: res.data, matches });
      }
      load();
    } catch (err: any) {
      if (isApiError(err) && err.code === "PREMIUM_REQUIRED") {
        setFormError("Free plan tracks 3 invoices per month - upgrade to Pro for unlimited.");
      } else {
        setFormError(err.message);
      }
    } finally {
      setFormSaving(false);
    }
  };

  const handleMarkPaid = async (inv: Invoice) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await api.patch<MutationResponse>(`/invoices/${inv.id}`, { paidAt: today });
      const matches = res.potentialEarningMatches ?? [];
      if (matches.length > 0) {
        setLinkState({ invoice: res.data, matches });
      }
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLink = async (earningId: string) => {
    if (!linkState) return;
    setLinking(earningId);
    try {
      await api.post(`/invoices/${linkState.invoice.id}/link-earning`, { earningId });
      const remaining = linkState.matches.filter((m) => m.id !== earningId);
      if (remaining.length === 0) {
        setLinkState(null);
        load();
      } else {
        setLinkState({ ...linkState, matches: remaining });
      }
    } catch (err: any) {
      setError(err.message);
      setLinkState(null);
    } finally {
      setLinking(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/invoices/${deleteId}`);
      setDeleteId(null);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Email the branded PDF to the client (Pro).
  const [sendBusy, setSendBusy] = useState<string | null>(null);
  const handleSend = async (inv: Invoice) => {
    if (!isPremium) {
      setShowChaseUpsell(true);
      return;
    }
    if (!window.confirm(`Email invoice ${inv.invoiceNumber != null ? formatInvoiceNumber(inv.invoiceNumber) : ""} to the client? Replies come straight to your email.`)) {
      return;
    }
    setSendBusy(inv.id);
    try {
      const res = await api.post<{ data: { toEmail: string } }>(`/invoices/${inv.id}/send`, {});
      setError(null);
      window.alert(`Sent to ${res.data.toEmail}`);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendBusy(null);
    }
  };

  // Branded PDF download (Pro). Free users get the upsell banner.
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const handlePdf = async (inv: Invoice) => {
    if (!isPremium) {
      setShowChaseUpsell(true);
      return;
    }
    setPdfBusy(inv.id);
    try {
      const res = await fetchWithAuth(`/invoices/${inv.id}/pdf`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? body?.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = inv.invoiceNumber != null ? `${formatInvoiceNumber(inv.invoiceNumber)}.pdf` : "invoice.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      load(); // number may have been lazily allocated
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPdfBusy(null);
    }
  };

  // Live totals preview for the form modal.
  const previewLines = parseLineDrafts(formLines);
  const previewVat = formVatRate === "" ? null : parseInt(formVatRate, 10);
  const preview =
    previewLines.length > 0
      ? computeInvoiceTotals(previewLines, previewVat)
      : (() => {
          const net = Math.round((parseFloat(formAmount) || 0) * 100);
          const vat = previewVat ? Math.round((net * previewVat) / 100) : 0;
          return { subtotalPence: net, vatPence: vat, amountPence: net + vat, lines: [] };
        })();

  const outstanding = (summary?.sent.totalPence ?? 0) + (summary?.overdue.totalPence ?? 0);

  return (
    <>
      <PageHeader title="Invoices" subtitle="Track who owes you - and chase the ones who are late" />

      {summary && (
        <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="stat-card">
            <div className="stat-card__value">{formatPence(outstanding)}</div>
            <div className="stat-card__label">Outstanding</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value" style={summary.overdue.count > 0 ? { color: "var(--dash-red)" } : undefined}>
              {summary.overdue.count}
            </div>
            <div className="stat-card__label">Overdue</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value" style={{ color: "var(--emerald-400)" }}>
              {formatPence(summary.paid.totalPence)}
            </div>
            <div className="stat-card__label">Paid</div>
          </div>
        </div>
      )}

      {/* Invoices | Clients tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {(["invoices", "clients"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`filter-chip ${tab === t ? "filter-chip--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "invoices" ? "Invoices" : `Clients${clients.length ? ` (${clients.length})` : ""}`}
          </button>
        ))}
      </div>

      {error && <div className="alert alert--error" style={{ marginBottom: "1rem" }}>{error}</div>}

      {tab === "clients" ? (
        <ClientsPanel clients={clients} reload={loadClients} onError={setError} />
      ) : (
        <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ minWidth: 200 }}>
          <Select
            id="invoice-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            options={FILTER_OPTIONS}
            aria-label="Filter by status"
          />
        </div>
        <Button variant="primary" onClick={() => { resetForm(); setShowForm(true); }}>
          Add Invoice
        </Button>
      </div>

      {showChaseUpsell && (
        <div className="alert" style={{ marginBottom: "1rem" }}>
          Branded invoice PDFs and one-tap payment chasing are MileClear Pro features -
          your logo and colours on the invoice, and the chase email pre-written with the
          correct statutory-interest wording.{" "}
          <a href="/pricing" style={{ fontWeight: 600 }}>Upgrade to Pro</a>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="row" count={6} />
      ) : invoices.length === 0 ? (
        <Card>
          <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
            {filter
              ? "No invoices with this status."
              : "No invoices yet. Track who owes you for freelance work - we'll keep the list tidy for your accountant."}
          </p>
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Reference</th>
                <th>Sent</th>
                <th>Due</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const meta = STATUS_META[inv.status];
                const overdueDays = inv.status === "overdue" ? invoiceDaysOverdue(inv.dueAt) : 0;
                return (
                  <tr key={inv.id}>
                    <td style={{ fontSize: "0.875rem", fontWeight: 500 }}>{inv.company}</td>
                    <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {inv.invoiceNumber != null ? formatInvoiceNumber(inv.invoiceNumber) : inv.reference || "-"}
                    </td>
                    <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>{shortDate(inv.sentAt)}</td>
                    <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {inv.status === "paid" && inv.paidAt ? `Paid ${shortDate(inv.paidAt)}` : shortDate(inv.dueAt)}
                    </td>
                    <td style={{ fontSize: "0.875rem", fontWeight: 600, whiteSpace: "nowrap" }}>{formatPence(inv.amountPence)}</td>
                    <td>
                      <span title={overdueDays > 0 ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue` : undefined}>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </span>
                    </td>
                    <td>
                      <div className="table__actions">
                        {(inv.status === "sent" || inv.status === "overdue") && (
                          <button className="table__action-btn" onClick={() => handleMarkPaid(inv)}>
                            Mark paid
                          </button>
                        )}
                        {inv.status === "overdue" && (
                          isPremium ? (
                            <a
                              className="table__action-btn"
                              href={buildInvoiceChaseMailto(inv, senderName)}
                              title={inv.clientEmail ? `Opens a pre-filled email to ${inv.clientEmail}` : "Opens a pre-filled email draft - add a client email to pre-address it"}
                            >
                              Chase
                            </a>
                          ) : (
                            <button
                              className="table__action-btn"
                              onClick={() => setShowChaseUpsell(true)}
                              title="One-tap payment chasing is a Pro feature"
                            >
                              Chase
                            </button>
                          )
                        )}
                        {inv.status !== "paid" && inv.status !== "written_off" && (
                          <button
                            className="table__action-btn"
                            onClick={() => handleSend(inv)}
                            disabled={sendBusy === inv.id}
                            title={
                              inv.emailedAt
                                ? `Emailed ${shortDate(inv.emailedAt)} - send again`
                                : isPremium
                                  ? "Email the branded PDF to the client"
                                  : "Emailing invoices is a Pro feature"
                            }
                          >
                            {sendBusy === inv.id ? "Sending…" : inv.emailedAt ? "Resend" : "Send"}
                          </button>
                        )}
                        <button
                          className="table__action-btn"
                          onClick={() => handlePdf(inv)}
                          disabled={pdfBusy === inv.id}
                          title={isPremium ? "Download the branded invoice PDF" : "Branded invoice PDFs are a Pro feature"}
                        >
                          {pdfBusy === inv.id ? "PDF…" : "PDF"}
                        </button>
                        <button className="table__action-btn" onClick={() => openEdit(inv)}>Edit</button>
                        <button className="table__action-btn" onClick={() => setDeleteId(inv.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editId ? "Edit Invoice" : "Add Invoice"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {clients.length > 0 && (
            <Select
              id="inv-client"
              label="Client"
              value={formClientId}
              onChange={(e) => {
                const id = e.target.value;
                setFormClientId(id);
                const c = clients.find((x) => x.id === id);
                if (c) {
                  setFormCompany(c.name);
                  if (!formClientEmail && c.email) setFormClientEmail(c.email);
                }
              }}
              options={[
                { value: "", label: "No saved client - type a name below" },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          )}
          <Input
            id="inv-company"
            label="Company / client"
            placeholder="Who's the invoice to?"
            value={formCompany}
            onChange={(e) => setFormCompany(e.target.value)}
          />
          <Input
            id="inv-client-email"
            label="Client email (optional)"
            type="email"
            placeholder="Pre-fills the chase email if they pay late"
            value={formClientEmail}
            onChange={(e) => setFormClientEmail(e.target.value)}
          />

          {/* Line items (optional - leave empty for a simple amount) */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.375rem" }}>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Line items (optional)</span>
              <button
                type="button"
                className="filter-chip"
                onClick={() => setFormLines((ls) => [...ls, { description: "", quantity: "1", unitPrice: "" }])}
              >
                + Add line
              </button>
            </div>
            {formLines.map((line, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr auto", gap: "0.375rem", marginBottom: "0.375rem", alignItems: "center" }}>
                <Input
                  id={`inv-line-desc-${i}`}
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) => setFormLines((ls) => ls.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))}
                />
                <Input
                  id={`inv-line-qty-${i}`}
                  type="number"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => setFormLines((ls) => ls.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)))}
                />
                <Input
                  id={`inv-line-price-${i}`}
                  type="number"
                  placeholder="Unit £"
                  value={line.unitPrice}
                  onChange={(e) => setFormLines((ls) => ls.map((l, j) => (j === i ? { ...l, unitPrice: e.target.value } : l)))}
                />
                <button
                  type="button"
                  className="table__action-btn"
                  onClick={() => setFormLines((ls) => ls.filter((_, j) => j !== i))}
                  aria-label="Remove line"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: vatRegistered ? "1fr 1fr 1fr" : "1fr 1fr", gap: "0.5rem" }}>
            {previewLines.length === 0 && (
              <Input
                id="inv-amount"
                label={formVatRate !== "" ? "Amount before VAT (£)" : "Amount (£)"}
                type="number"
                placeholder="e.g. 400.00"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            )}
            {vatRegistered && (
              <Select
                id="inv-vat"
                label="VAT"
                value={formVatRate}
                onChange={(e) => setFormVatRate(e.target.value)}
                options={[
                  { value: "", label: "No VAT" },
                  { value: "20", label: "20% standard" },
                  { value: "5", label: "5% reduced" },
                  { value: "0", label: "0% zero-rated" },
                ]}
              />
            )}
            <Input
              id="inv-reference"
              label="Reference (optional)"
              placeholder="PO number, job ID..."
              value={formReference}
              onChange={(e) => setFormReference(e.target.value)}
            />
          </div>

          {/* Live totals preview */}
          {(previewLines.length > 0 || formVatRate !== "") && preview.amountPence > 0 && (
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", display: "flex", gap: "1rem", justifyContent: "flex-end" }}>
              <span>Subtotal {formatPence(preview.subtotalPence)}</span>
              {formVatRate !== "" && <span>VAT {formatPence(preview.vatPence)}</span>}
              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                Total {formatPence(preview.amountPence)}
              </span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Input
              id="inv-sent"
              label="Date sent"
              type="date"
              value={formSentAt}
              onChange={(e) => setFormSentAt(e.target.value)}
            />
            <Input
              id="inv-due"
              label="Due date (auto: sent + 30 days)"
              type="date"
              value={formDueAt}
              onChange={(e) => { setFormDueAt(e.target.value); setDueTouched(true); }}
            />
          </div>
          <Input
            id="inv-paid"
            label="Paid date (leave blank if unpaid)"
            type="date"
            value={formPaidAt}
            onChange={(e) => setFormPaidAt(e.target.value)}
          />
          <Input
            id="inv-notes"
            label="Notes (optional)"
            placeholder="Anything to remember for your accountant?"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
          />
          {editId && !formPaidAt && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={formAutoChase}
                onChange={(e) => setFormAutoChase(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <strong style={{ color: "var(--text-primary)" }}>Auto-chase late payment</strong> (Pro) - MileClear
                emails polite reminders: 3 days before the due date, then 3, 10 and 21 days after.
                You get a push the day before each one goes out, and payment stops the sequence instantly.
              </span>
            </label>
          )}
          {editId && (
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={formWriteOff}
                onChange={(e) => setFormWriteOff(e.target.checked)}
              />
              Write off (won't be paid - excluded from outstanding totals)
            </label>
          )}
          {formError && <div className="alert alert--error">{formError}</div>}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={formSaving}>
              {formSaving ? "Saving..." : editId ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Link-or-keep: dedupe manual earnings that represent the same money */}
      <Modal
        open={!!linkState}
        onClose={() => { setLinkState(null); load(); }}
        title="Already logged as an earning?"
      >
        {linkState && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0 }}>
              These manual earnings look like they might be the same money as the{" "}
              <strong>{formatPence(linkState.invoice.amountPence)}</strong> invoice from{" "}
              <strong>{linkState.invoice.company}</strong>. Linking them stops the amount
              being counted twice in your tax figures.
            </p>
            {linkState.matches.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.625rem 0.75rem",
                  border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                  borderRadius: 8,
                  fontSize: "0.8125rem",
                }}
              >
                <span>
                  <strong>{formatPence(m.amountPence)}</strong>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {m.platform} · {shortDate(m.periodStart)}
                  </span>
                </span>
                <Button variant="secondary" onClick={() => handleLink(m.id)} disabled={linking === m.id}>
                  {linking === m.id ? "Linking..." : "Link"}
                </Button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => { setLinkState(null); load(); }}>
                Keep separate
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Invoice"
        message="This will permanently delete this invoice. Any linked earnings are unlinked, not deleted. This can't be undone."
        confirmLabel="Delete"
      />
    </>
  );
}

// ── Clients tab ──────────────────────────────────────────────────────────────

function ClientsPanel({
  clients,
  reload,
  onError,
}: {
  clients: Client[];
  reload: () => void;
  onError: (msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const reset = () => {
    setEditId(null);
    setName("");
    setEmail("");
    setPhone("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setPostcode("");
    setFormError(null);
  };

  const openEdit = (c: Client) => {
    setEditId(c.id);
    setName(c.name);
    setEmail(c.email ?? "");
    setPhone(c.phone ?? "");
    setAddressLine1(c.addressLine1 ?? "");
    setAddressLine2(c.addressLine2 ?? "");
    setCity(c.city ?? "");
    setPostcode(c.postcode ?? "");
    setFormError(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!name.trim()) {
      setFormError("Client name is required");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        addressLine1: addressLine1.trim() || null,
        addressLine2: addressLine2.trim() || null,
        city: city.trim() || null,
        postcode: postcode.trim() || null,
      };
      if (editId) await api.patch(`/clients/${editId}`, body);
      else await api.post("/clients", body);
      setShowForm(false);
      reset();
      reload();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/clients/${deleteTarget.id}`);
      setDeleteTarget(null);
      reload();
    } catch (err: any) {
      onError(err.message);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <Button variant="primary" onClick={() => { reset(); setShowForm(true); }}>
          Add Client
        </Button>
      </div>

      {clients.length === 0 ? (
        <Card>
          <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
            No clients yet. Save the people and businesses you invoice - their details
            pre-fill new invoices and the Bill-To block on the PDF.
          </p>
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Address</th>
                <th>Invoices</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontSize: "0.875rem", fontWeight: 500 }}>{c.name}</td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{c.email || "-"}</td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    {[c.city, c.postcode].filter(Boolean).join(", ") || "-"}
                  </td>
                  <td style={{ fontSize: "0.8125rem" }}>{c._count?.invoices ?? 0}</td>
                  <td>
                    <div className="table__actions">
                      <button className="table__action-btn" onClick={() => openEdit(c)}>Edit</button>
                      <button className="table__action-btn" onClick={() => setDeleteTarget(c)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); reset(); }}
        title={editId ? "Edit Client" : "Add Client"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Input id="cl-name" label="Name" placeholder="Acme Ltd" value={name} onChange={(e) => setName(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Input id="cl-email" label="Email (for invoices + chasing)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input id="cl-phone" label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Input id="cl-addr1" label="Address line 1 (optional)" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
          <Input id="cl-addr2" label="Address line 2 (optional)" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Input id="cl-city" label="Town / city (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input id="cl-postcode" label="Postcode (optional)" value={postcode} onChange={(e) => setPostcode(e.target.value)} />
          </div>
          {formError && <div className="alert alert--error">{formError}</div>}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => { setShowForm(false); reset(); }}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : editId ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={remove}
        title="Delete Client"
        message={
          (deleteTarget?._count?.invoices ?? 0) > 0
            ? "This client has invoices, so they'll be archived (hidden from pickers) rather than deleted - invoice history keeps their details."
            : "This will permanently delete this client."
        }
        confirmLabel="Delete"
      />
    </>
  );
}
