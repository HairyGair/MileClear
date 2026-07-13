"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Select } from "../../../components/ui/Select";
import { Modal } from "../../../components/ui/Modal";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import {
  EXPENSE_CATEGORIES,
  GIG_PLATFORMS,
  formatPence,
} from "@mileclear/shared";

// ── Types ─────────────────────────────────────────────────────────────

interface BankTransaction {
  id: string;
  userId: string;
  plaidConnectionId: string;
  externalId: string;
  merchant: string;
  descriptionRaw: string | null;
  amountPence: number; // signed: + credit, - debit
  currency: string;
  transactionDate: string;
  status: "pending" | "accepted" | "ignored" | "consumed";
  suggestedKind: "earning" | "expense" | "invoice_payment" | "unknown" | null;
  suggestedCategory: string | null;
  suggestedConfidence: number | null;
  resolvedEarningId: string | null;
  resolvedExpenseId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface InboxListResponse {
  data: BankTransaction[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

const EXPENSE_LABEL: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.value, c.label])
);
const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(
  GIG_PLATFORMS.map((p) => [p.value, p.label])
);

const platformOptions = GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label }));
const categoryOptions = EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function confidenceColor(conf: number | null): string {
  if (conf === null) return "var(--text-tertiary)";
  if (conf >= 80) return "var(--emerald-400)";
  if (conf >= 50) return "var(--amber-400)";
  return "var(--text-tertiary)";
}

function confidenceLabel(conf: number | null): string {
  if (conf === null) return "-";
  if (conf >= 80) return "High confidence";
  if (conf >= 50) return "Medium confidence";
  return "Low confidence";
}

// ── Page ──────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [items, setItems] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<BankTransaction | null>(null);
  const [actionKind, setActionKind] = useState<"earning" | "expense">("expense");
  const [actionCategory, setActionCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<InboxListResponse>("/inbox?pageSize=100");
      setItems(res.data ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Suggested invoice payment (Get Paid Phase 4): suggestedCategory holds
  // the invoice id; fetch its display details when the panel opens.
  const [suggestedInvoice, setSuggestedInvoice] = useState<{
    id: string;
    company: string;
    invoiceNumber: number | null;
    amountPence: number;
  } | null>(null);

  const openTransaction = (txn: BankTransaction) => {
    setActive(txn);
    const isCredit = txn.amountPence > 0;
    setActionKind(isCredit ? "earning" : "expense");
    setSuggestedInvoice(null);
    if (txn.suggestedKind === "invoice_payment" && txn.suggestedCategory) {
      setActionCategory("");
      api
        .get<{ data: { id: string; company: string; invoiceNumber: number | null; amountPence: number } }>(`/invoices/${txn.suggestedCategory}`)
        .then((res) => setSuggestedInvoice(res.data))
        .catch(() => setSuggestedInvoice(null));
    } else {
      setActionCategory(txn.suggestedCategory ?? "");
    }
  };

  const handleAcceptInvoicePayment = async () => {
    if (!active || !suggestedInvoice) return;
    setBusy(true);
    try {
      await api.post(`/inbox/${active.id}/accept`, {
        kind: "invoice_payment",
        invoiceId: suggestedInvoice.id,
      });
      setItems((prev) => prev.filter((x) => x.id !== active.id));
      setActive(null);
      setSuggestedInvoice(null);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async () => {
    if (!active) return;
    if (!actionCategory) {
      setError(actionKind === "earning" ? "Pick a platform" : "Pick a category");
      return;
    }
    setBusy(true);
    try {
      const body =
        actionKind === "earning"
          ? { kind: "earning" as const, platform: actionCategory }
          : { kind: "expense" as const, category: actionCategory };
      await api.post(`/inbox/${active.id}/accept`, body);
      setItems((prev) => prev.filter((x) => x.id !== active.id));
      setActive(null);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleIgnore = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await api.post(`/inbox/${active.id}/ignore`);
      setItems((prev) => prev.filter((x) => x.id !== active.id));
      setActive(null);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Triage every transaction from your connected bank into earnings or expenses"
      />

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "var(--dash-gap)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : items.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>✓</div>
            <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>All caught up</h3>
            <p
              style={{
                margin: 0,
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                lineHeight: 1.5,
              }}
            >
              No bank transactions waiting for review. New ones appear here after your next sync.
              If you haven&apos;t connected a bank yet, do that on the Earnings page first.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "0.75rem",
            }}
          >
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-tertiary)",
              }}
            >
              From your bank
            </div>
            <div
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              {items.length} to review
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Date</th>
                <th>Suggested</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th style={{ width: "1%" }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((txn) => {
                const isCredit = txn.amountPence > 0;
                const suggested =
                  txn.suggestedKind === "earning"
                    ? PLATFORM_LABEL[txn.suggestedCategory ?? ""] ?? "Earning"
                    : txn.suggestedKind === "expense"
                    ? EXPENSE_LABEL[txn.suggestedCategory ?? ""] ?? "Expense"
                    : "Needs review";
                return (
                  <tr key={txn.id}>
                    <td>
                      <div
                        style={{
                          fontWeight: 600,
                          color: "var(--text-primary)",
                        }}
                      >
                        {txn.merchant}
                      </div>
                    </td>
                    <td style={{ color: "var(--text-secondary)" }}>
                      {formatDate(txn.transactionDate)}
                    </td>
                    <td>
                      <span style={{ color: "var(--text-secondary)" }}>{suggested}</span>
                      <span
                        title={confidenceLabel(txn.suggestedConfidence)}
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: confidenceColor(txn.suggestedConfidence),
                          marginLeft: 8,
                          verticalAlign: "middle",
                        }}
                      />
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        fontWeight: 700,
                        color: isCredit ? "var(--emerald-400)" : "var(--dash-red)",
                      }}
                    >
                      {isCredit ? "+" : "-"}
                      {formatPence(Math.abs(txn.amountPence))}
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openTransaction(txn)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Accept / Ignore modal */}
      <Modal
        open={!!active}
        onClose={() => !busy && setActive(null)}
        title={active ? active.merchant : ""}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={handleIgnore} disabled={busy}>
              Ignore
            </Button>
            <Button variant="primary" size="sm" onClick={handleAccept} disabled={busy}>
              {busy ? "Saving..." : "Accept"}
            </Button>
          </>
        }
      >
        {active && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              {active.amountPence > 0 ? "+" : "-"}
              {formatPence(Math.abs(active.amountPence))} · {formatDate(active.transactionDate)}
            </div>
            {suggestedInvoice && (
              <div
                style={{
                  border: "1px solid rgba(16,185,129,0.35)",
                  background: "rgba(16,185,129,0.08)",
                  borderRadius: 8,
                  padding: "0.75rem",
                  fontSize: "0.8125rem",
                }}
              >
                <p style={{ margin: "0 0 0.5rem" }}>
                  This looks like payment for{" "}
                  <strong>
                    {suggestedInvoice.invoiceNumber != null
                      ? `INV-${String(suggestedInvoice.invoiceNumber).padStart(4, "0")}`
                      : "an invoice"}
                  </strong>{" "}
                  from <strong>{suggestedInvoice.company}</strong> (
                  {formatPence(suggestedInvoice.amountPence)}).
                </p>
                <Button variant="primary" size="sm" onClick={handleAcceptInvoicePayment} disabled={busy}>
                  {busy ? "Saving..." : "Mark invoice paid"}
                </Button>
              </div>
            )}
            <Select
              id="kind"
              label="Treat as"
              value={actionKind}
              onChange={(e) => {
                const next = e.target.value as "earning" | "expense";
                setActionKind(next);
                setActionCategory("");
              }}
              options={[
                { value: "earning", label: "Earning (money in)" },
                { value: "expense", label: "Expense (money out)" },
              ]}
            />
            <Select
              id="category"
              label={actionKind === "earning" ? "Platform" : "Expense category"}
              value={actionCategory}
              onChange={(e) => setActionCategory(e.target.value)}
              options={[
                { value: "", label: "Choose..." },
                ...(actionKind === "earning" ? platformOptions : categoryOptions),
              ]}
            />
            {error && <div className="alert alert--error">{error}</div>}
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-tertiary)",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              Pick a different category than the suggestion and the categoriser learns -
              next time the same merchant arrives, your choice becomes the default.
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
