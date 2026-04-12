"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Modal } from "../../../components/ui/Modal";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { Pagination } from "../../../components/ui/Pagination";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import type {
  Expense,
  PaginatedResponse,
  ExpenseSummary,
  TaxEstimate,
} from "@mileclear/shared";
import { EXPENSE_CATEGORIES, formatPence } from "@mileclear/shared";

const categoryOptions = EXPENSE_CATEGORIES.map((c) => ({
  value: c.value,
  label: `${c.label}${c.deductibleWithMileage ? "" : " (vehicle cost)"}`,
}));

const filterOptions = [
  { value: "", label: "All categories" },
  ...categoryOptions,
];

function categoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterCat, setFilterCat] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form state
  const [formCategory, setFormCategory] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formVendor, setFormVendor] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Summary
  const [summary, setSummary] = useState<ExpenseSummary[]>([]);
  const [taxEstimate, setTaxEstimate] = useState<TaxEstimate | null>(null);

  const resetForm = () => {
    setFormCategory("");
    setFormAmount("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormDescription("");
    setFormVendor("");
    setFormNotes("");
    setFormError(null);
    setEditId(null);
  };

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (filterCat) params.set("category", filterCat);
      const res = await api.get<PaginatedResponse<Expense>>(`/expenses?${params}`);
      setExpenses(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filterCat]);

  const loadSummary = useCallback(async () => {
    try {
      const [sumRes, taxRes] = await Promise.all([
        api.get<{ data: ExpenseSummary[] }>("/expenses/summary"),
        api.get<{ data: TaxEstimate }>("/expenses/tax-estimate"),
      ]);
      setSummary(sumRes.data);
      setTaxEstimate(taxRes.data);
    } catch {}
  }, []);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const openEdit = (exp: Expense) => {
    setEditId(exp.id);
    setFormCategory(exp.category);
    setFormAmount(String(exp.amountPence / 100));
    setFormDate(exp.date.slice(0, 10));
    setFormDescription(exp.description ?? "");
    setFormVendor(exp.vendor ?? "");
    setFormNotes(exp.notes ?? "");
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formCategory || !formAmount || !formDate) {
      setFormError("Category, amount, and date are required");
      return;
    }
    const pence = Math.round(parseFloat(formAmount) * 100);
    if (isNaN(pence) || pence <= 0) {
      setFormError("Amount must be a positive number");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      const body = {
        category: formCategory,
        amountPence: pence,
        date: formDate,
        description: formDescription.trim() || undefined,
        vendor: formVendor.trim() || undefined,
        notes: formNotes.trim() || undefined,
      };
      if (editId) {
        await api.patch(`/expenses/${editId}`, body);
      } else {
        await api.post("/expenses", body);
      }
      setShowForm(false);
      resetForm();
      loadExpenses();
      loadSummary();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/expenses/${deleteId}`);
      setDeleteId(null);
      loadExpenses();
      loadSummary();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <>
      <PageHeader title="Expenses" subtitle="Track business costs alongside your mileage" />

      {/* Tax Estimate */}
      {taxEstimate && (
        <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
          <div className="stat-card">
            <div className="stat-card__value">{formatPence(taxEstimate.grossEarningsPence)}</div>
            <div className="stat-card__label">Gross Earnings ({taxEstimate.taxYear})</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value" style={{ color: "var(--emerald-400)" }}>
              -{formatPence(taxEstimate.mileageDeductionPence + taxEstimate.allowableExpensesPence)}
            </div>
            <div className="stat-card__label">Deductions</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value">{formatPence(taxEstimate.taxableProfitPence)}</div>
            <div className="stat-card__label">Taxable Profit</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__value" style={{ color: "var(--dash-red)" }}>
              {formatPence(taxEstimate.totalTaxOwedPence)}
            </div>
            <div className="stat-card__label">Est. Tax + NI ({taxEstimate.effectiveRatePercent}%)</div>
          </div>
        </div>
      )}

      {/* Tax breakdown */}
      {taxEstimate && taxEstimate.totalTaxOwedPence > 0 && (
        <Card style={{ marginBottom: "var(--dash-gap)" }}>
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.9375rem", fontWeight: 600 }}>
            Tax Breakdown - {taxEstimate.taxYear}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.8125rem" }}>
            <span style={{ color: "var(--text-secondary)" }}>Gross earnings</span>
            <span style={{ textAlign: "right" }}>{formatPence(taxEstimate.grossEarningsPence)}</span>

            <span style={{ color: "var(--text-secondary)" }}>Mileage allowance (HMRC)</span>
            <span style={{ textAlign: "right", color: "var(--emerald-400)" }}>-{formatPence(taxEstimate.mileageDeductionPence)}</span>

            <span style={{ color: "var(--text-secondary)" }}>Allowable expenses</span>
            <span style={{ textAlign: "right", color: "var(--emerald-400)" }}>-{formatPence(taxEstimate.allowableExpensesPence)}</span>

            {taxEstimate.vehicleExpensesPence > 0 && (
              <>
                <span style={{ color: "var(--text-tertiary)", fontSize: "0.75rem" }}>Vehicle costs (not deducted with mileage)</span>
                <span style={{ textAlign: "right", color: "var(--text-tertiary)", fontSize: "0.75rem" }}>{formatPence(taxEstimate.vehicleExpensesPence)}</span>
              </>
            )}

            <span style={{ fontWeight: 600 }}>Taxable profit</span>
            <span style={{ textAlign: "right", fontWeight: 600 }}>{formatPence(taxEstimate.taxableProfitPence)}</span>

            <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.06))", margin: "0.25rem 0" }} />

            <span style={{ color: "var(--text-secondary)" }}>Income tax</span>
            <span style={{ textAlign: "right" }}>{formatPence(taxEstimate.incomeTaxPence)}</span>

            <span style={{ color: "var(--text-secondary)" }}>Class 2 NI</span>
            <span style={{ textAlign: "right" }}>{formatPence(taxEstimate.class2NiPence)}</span>

            <span style={{ color: "var(--text-secondary)" }}>Class 4 NI</span>
            <span style={{ textAlign: "right" }}>{formatPence(taxEstimate.class4NiPence)}</span>

            <span style={{ fontWeight: 700, color: "var(--dash-red)" }}>Estimated tax owed</span>
            <span style={{ textAlign: "right", fontWeight: 700, color: "var(--dash-red)" }}>{formatPence(taxEstimate.totalTaxOwedPence)}</span>
          </div>
          <p style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", margin: "0.75rem 0 0" }}>
            Estimate only - based on 2025-26 rates. Does not account for other income, allowances, or adjustments. Consult an accountant for your actual liability.
          </p>
        </Card>
      )}

      {/* Expense summary by category */}
      {summary.length > 0 && (
        <Card title="This Year by Category" style={{ marginBottom: "var(--dash-gap)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {summary
              .sort((a, b) => b.totalPence - a.totalPence)
              .map((s) => (
                <div
                  key={s.category}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.375rem 0",
                    fontSize: "0.8125rem",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {categoryLabel(s.category)}
                    {!s.deductibleWithMileage && (
                      <Badge variant="source">vehicle cost</Badge>
                    )}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {formatPence(s.totalPence)} ({s.count})
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ minWidth: 200 }}>
          <Select
            id="expense-filter"
            value={filterCat}
            onChange={(e) => { setFilterCat(e.target.value); setPage(1); }}
            options={filterOptions}
            aria-label="Filter by category"
          />
        </div>
        <Button
          variant="primary"
          onClick={() => { resetForm(); setShowForm(true); }}
        >
          Add Expense
        </Button>
      </div>

      {error && <div className="alert alert--error" style={{ marginBottom: "1rem" }}>{error}</div>}

      {loading ? (
        <LoadingSkeleton variant="row" count={6} />
      ) : expenses.length === 0 ? (
        <Card>
          <p style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
            {filterCat ? "No expenses in this category." : "No expenses recorded yet. Add your first business expense."}
          </p>
        </Card>
      ) : (
        <>
          <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
            {total} expense{total !== 1 ? "s" : ""}
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Vendor</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {new Date(exp.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" })}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>{categoryLabel(exp.category)}</td>
                    <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{exp.description || "-"}</td>
                    <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{exp.vendor || "-"}</td>
                    <td style={{ fontSize: "0.875rem", fontWeight: 600 }}>{formatPence(exp.amountPence)}</td>
                    <td>
                      <div className="table__actions">
                        <button className="table__action-btn" onClick={() => openEdit(exp)}>Edit</button>
                        <button className="table__action-btn" onClick={() => setDeleteId(exp.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editId ? "Edit Expense" : "Add Expense"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Select
            id="exp-category"
            label="Category"
            value={formCategory}
            onChange={(e) => setFormCategory(e.target.value)}
            placeholder="Select category..."
            options={categoryOptions}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Input
              id="exp-amount"
              label="Amount"
              type="number"
              placeholder="e.g. 12.50"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
            />
            <Input
              id="exp-date"
              label="Date"
              type="date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
            />
          </div>
          <Input
            id="exp-desc"
            label="Description"
            placeholder="What was it for?"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
          />
          <Input
            id="exp-vendor"
            label="Vendor (optional)"
            placeholder="e.g. Halfords, Q-Park"
            value={formVendor}
            onChange={(e) => setFormVendor(e.target.value)}
          />
          <Input
            id="exp-notes"
            label="Notes (optional)"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
          />
          {formError && <div className="alert alert--error">{formError}</div>}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={formSaving}>
              {formSaving ? "Saving..." : editId ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Expense"
        message="This will permanently delete this expense. This can't be undone."
        confirmLabel="Delete"
      />
    </>
  );
}
