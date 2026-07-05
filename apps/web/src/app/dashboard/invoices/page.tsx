"use client";

// Sole-trader invoice tracker — web parity with the mobile screens
// (invoices.tsx / invoice-form.tsx), 5 Jul 2026. Same deliberate scope:
// a tidy list with paid/unpaid status, the anti-double-count link flow,
// and the Phase-1 late-payment chase (a mailto draft in the user's own
// mail client — the template lives in @mileclear/shared so the legal
// wording can't drift from mobile).

import { useEffect, useState, useCallback } from "react";
import { api, isApiError } from "../../../lib/api";
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
import { formatPence, buildInvoiceChaseMailto, invoiceDaysOverdue } from "@mileclear/shared";

type InvoiceStatus = "sent" | "paid" | "overdue" | "written_off";

interface Invoice {
  id: string;
  company: string;
  clientEmail: string | null;
  reference: string | null;
  amountPence: number;
  sentAt: string;
  dueAt: string;
  paidAt: string | null;
  status: InvoiceStatus;
  notes: string | null;
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

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceListResponse["summary"] | null>(null);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form modal
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formCompany, setFormCompany] = useState("");
  const [formClientEmail, setFormClientEmail] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formSentAt, setFormSentAt] = useState("");
  const [formDueAt, setFormDueAt] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [formPaidAt, setFormPaidAt] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formWriteOff, setFormWriteOff] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Link-or-keep flow after marking paid (anti-double-count — mirrors
  // the mobile LinkEarningSheet).
  const [linkState, setLinkState] = useState<{ invoice: Invoice; matches: PotentialEarningMatch[] } | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  const resetForm = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditId(null);
    setFormCompany("");
    setFormClientEmail("");
    setFormReference("");
    setFormAmount("");
    setFormSentAt(today);
    setFormDueAt(isoDatePlusDays(today, 30));
    setDueTouched(false);
    setFormPaidAt("");
    setFormNotes("");
    setFormWriteOff(false);
    setFormError(null);
  };

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

  const openEdit = (inv: Invoice) => {
    setEditId(inv.id);
    setFormCompany(inv.company);
    setFormClientEmail(inv.clientEmail ?? "");
    setFormReference(inv.reference ?? "");
    setFormAmount((inv.amountPence / 100).toFixed(2));
    setFormSentAt(inv.sentAt.slice(0, 10));
    setFormDueAt(inv.dueAt.slice(0, 10));
    setDueTouched(true);
    setFormPaidAt(inv.paidAt ? inv.paidAt.slice(0, 10) : "");
    setFormNotes(inv.notes ?? "");
    setFormWriteOff(inv.status === "written_off");
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formCompany.trim()) {
      setFormError("Who is the invoice to?");
      return;
    }
    const pounds = parseFloat(formAmount);
    if (!Number.isFinite(pounds) || pounds <= 0) {
      setFormError("Enter the invoice amount in pounds");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const body = {
        company: formCompany.trim(),
        clientEmail: formClientEmail.trim() || null,
        reference: formReference.trim() || null,
        amountPence: Math.round(pounds * 100),
        sentAt: formSentAt,
        dueAt: formDueAt,
        paidAt: formPaidAt || null,
        notes: formNotes.trim() || null,
        ...(editId ? { writeOff: formWriteOff } : {}),
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
        setFormError("Free plan tracks 3 invoices per month — upgrade to Pro for unlimited.");
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

  const outstanding = (summary?.sent.totalPence ?? 0) + (summary?.overdue.totalPence ?? 0);

  return (
    <>
      <PageHeader title="Invoices" subtitle="Track who owes you — and chase the ones who are late" />

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

      {error && <div className="alert alert--error" style={{ marginBottom: "1rem" }}>{error}</div>}

      {loading ? (
        <LoadingSkeleton variant="row" count={6} />
      ) : invoices.length === 0 ? (
        <Card>
          <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
            {filter
              ? "No invoices with this status."
              : "No invoices yet. Track who owes you for freelance work — we'll keep the list tidy for your accountant."}
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
                    <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{inv.reference || "-"}</td>
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
                          <a
                            className="table__action-btn"
                            href={buildInvoiceChaseMailto(inv, senderName)}
                            title={inv.clientEmail ? `Opens a pre-filled email to ${inv.clientEmail}` : "Opens a pre-filled email draft — add a client email to pre-address it"}
                          >
                            Chase
                          </a>
                        )}
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

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editId ? "Edit Invoice" : "Add Invoice"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Input
              id="inv-amount"
              label="Amount (£)"
              type="number"
              placeholder="e.g. 400.00"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
            />
            <Input
              id="inv-reference"
              label="Reference (optional)"
              placeholder="PO number, job ID..."
              value={formReference}
              onChange={(e) => setFormReference(e.target.value)}
            />
          </div>
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
          {editId && (
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={formWriteOff}
                onChange={(e) => setFormWriteOff(e.target.checked)}
              />
              Write off (won't be paid — excluded from outstanding totals)
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
