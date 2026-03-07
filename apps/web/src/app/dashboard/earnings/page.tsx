"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../components/ui/Toast";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Modal } from "../../../components/ui/Modal";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { Pagination } from "../../../components/ui/Pagination";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import type { Earning } from "@mileclear/shared";
import { GIG_PLATFORMS } from "@mileclear/shared";

const PAGE_SIZE = 20;

const PLATFORM_OPTIONS = [
  { value: "", label: "All platforms" },
  ...GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label })),
];

interface EarningsResponse {
  data: Earning[];
  total: number;
  totalAmountPence: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export default function EarningsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [platformFilter, setPlatformFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    platform: "uber",
    amount: "",
    periodStart: "",
    periodEnd: "",
  });
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal
  const [editEarning, setEditEarning] = useState<Earning | null>(null);
  const [editForm, setEditForm] = useState({
    platform: "uber",
    amount: "",
    periodStart: "",
    periodEnd: "",
  });
  const [editLoading, setEditLoading] = useState(false);

  // CSV import
  const [showCsv, setShowCsv] = useState(false);
  const [csvContent, setCsvContent] = useState("");
  const [csvPlatform, setCsvPlatform] = useState("uber");
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [csvLoading, setCsvLoading] = useState(false);

  // Delete
  const [deleteEarning, setDeleteEarning] = useState<Earning | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadEarnings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (platformFilter) {
        params.set("platform", platformFilter);
      }
      const res = await api.get<EarningsResponse>(`/earnings/?${params}`);
      setEarnings(res.data);
      setTotal(res.total);
      setTotalAmount(res.totalAmountPence);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, platformFilter]);

  useEffect(() => {
    loadEarnings();
  }, [loadEarnings]);

  // Add earning
  const handleAdd = async () => {
    if (!addForm.amount || isNaN(parseFloat(addForm.amount))) {
      setError("Please enter a valid amount");
      return;
    }
    if (!addForm.periodStart || !addForm.periodEnd) {
      setError("Please select both start and end dates");
      return;
    }
    setAddLoading(true);
    setError(null);
    try {
      const amountPence = Math.round(parseFloat(addForm.amount) * 100);
      await api.post("/earnings/", {
        platform: addForm.platform,
        amountPence,
        periodStart: addForm.periodStart,
        periodEnd: addForm.periodEnd,
      });
      setShowAdd(false);
      setAddForm({ platform: "uber", amount: "", periodStart: "", periodEnd: "" });
      loadEarnings();
      toast("Earning added");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  // Open edit modal pre-filled with earning data
  const openEdit = (earning: Earning) => {
    setEditEarning(earning);
    setEditForm({
      platform: earning.platform,
      amount: (earning.amountPence / 100).toFixed(2),
      periodStart: earning.periodStart.slice(0, 10),
      periodEnd: earning.periodEnd.slice(0, 10),
    });
  };

  // Edit earning
  const handleEdit = async () => {
    if (!editEarning) return;
    if (!editForm.amount || isNaN(parseFloat(editForm.amount))) {
      setError("Please enter a valid amount");
      return;
    }
    if (!editForm.periodStart || !editForm.periodEnd) {
      setError("Please select both start and end dates");
      return;
    }
    setEditLoading(true);
    setError(null);
    try {
      const amountPence = Math.round(parseFloat(editForm.amount) * 100);
      await api.patch(`/earnings/${editEarning.id}`, {
        platform: editForm.platform,
        amountPence,
        periodStart: editForm.periodStart,
        periodEnd: editForm.periodEnd,
      });
      setEditEarning(null);
      loadEarnings();
      toast("Earning updated");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // CSV upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsvContent(reader.result as string);
    };
    reader.readAsText(file);
  };

  const handleCsvPreview = async () => {
    setCsvLoading(true);
    try {
      const res = await api.post<any>("/earnings/csv/preview", {
        csvContent,
        platform: csvPlatform,
      });
      setCsvPreview(res.data ?? res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCsvLoading(false);
    }
  };

  const handleCsvConfirm = async () => {
    if (!csvPreview?.rows) return;
    const importCount = csvPreview.rows.length;
    setCsvLoading(true);
    try {
      await api.post("/earnings/csv/confirm", csvPreview.rows);
      setShowCsv(false);
      setCsvContent("");
      setCsvPreview(null);
      loadEarnings();
      toast(`CSV import complete: ${importCount} earning${importCount !== 1 ? "s" : ""} imported`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCsvLoading(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteEarning) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/earnings/${deleteEarning.id}`);
      setDeleteEarning(null);
      loadEarnings();
      toast("Earning deleted");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const platformLabel = (val: string) =>
    GIG_PLATFORMS.find((p) => p.value === val)?.label || val;

  return (
    <>
      <PageHeader
        title="Earnings"
        subtitle="Track income from gig platforms"
        action={
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {user?.isPremium ? (
              <Button variant="secondary" size="sm" onClick={() => setShowCsv(true)}>
                Import CSV
              </Button>
            ) : (
              <Button variant="secondary" size="sm" disabled title="Premium feature">
                Import CSV (Pro)
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
              + Add earning
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <div className="hero-card" style={{ marginBottom: "var(--dash-gap)" }}>
        <div className="hero-card__label">Total Earnings</div>
        <div className="hero-card__value">{formatPence(totalAmount)}</div>
        <div className="hero-card__meta">
          <span>{total} earning{total !== 1 ? "s" : ""} recorded</span>
        </div>
      </div>

      {/* Platform filter */}
      <div style={{ marginBottom: "1.25rem", maxWidth: 220 }}>
        <Select
          id="platformFilter"
          value={platformFilter}
          onChange={(e) => {
            setPlatformFilter(e.target.value);
            setPage(1);
          }}
          options={PLATFORM_OPTIONS}
        />
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="row" count={5} style={{ marginBottom: 8 }} />
      ) : earnings.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2v20M7 7h6.5a3 3 0 010 6H9M7 13h7a3 3 0 010 6H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
          title="No earnings yet"
          description="Add your platform earnings manually or import from CSV."
          action={
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
              Add your first earning
            </Button>
          }
        />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {earnings.map((earning) => (
              <div key={earning.id} className="earning-card">
                <div className="earning-card__left">
                  <div className="earning-card__amount">{formatPence(earning.amountPence)}</div>
                  <div className="earning-card__meta">
                    <Badge variant="source">{platformLabel(earning.platform)}</Badge>
                    <span>
                      {new Date(earning.periodStart).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                      {" \u2013 "}
                      {new Date(earning.periodEnd).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </span>
                    <Badge variant="source">{earning.source}</Badge>
                  </div>
                </div>
                <div className="earning-card__right">
                  <button
                    className="table__action-btn"
                    onClick={() => openEdit(earning)}
                  >
                    Edit
                  </button>
                  <button
                    className="table__action-btn table__action-btn--danger"
                    onClick={() => setDeleteEarning(earning)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {/* Add Earning Modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Earning"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={addLoading}>
              {addLoading ? "Adding..." : "Add earning"}
            </Button>
          </>
        }
      >
        <Select
          id="addPlatform"
          label="Platform"
          value={addForm.platform}
          onChange={(e) => setAddForm((f) => ({ ...f, platform: e.target.value }))}
          options={GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label }))}
        />
        <Input
          id="addAmount"
          label="Amount (pounds)"
          type="number"
          step="0.01"
          min="0"
          value={addForm.amount}
          onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
          placeholder="e.g. 150.00"
        />
        <div className="form-row">
          <Input
            id="addPeriodStart"
            label="Period start"
            type="date"
            value={addForm.periodStart}
            onChange={(e) => setAddForm((f) => ({ ...f, periodStart: e.target.value }))}
          />
          <Input
            id="addPeriodEnd"
            label="Period end"
            type="date"
            value={addForm.periodEnd}
            onChange={(e) => setAddForm((f) => ({ ...f, periodEnd: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Edit Earning Modal */}
      <Modal
        open={!!editEarning}
        onClose={() => setEditEarning(null)}
        title="Edit Earning"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditEarning(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleEdit} disabled={editLoading}>
              {editLoading ? "Saving..." : "Save changes"}
            </Button>
          </>
        }
      >
        <Select
          id="editPlatform"
          label="Platform"
          value={editForm.platform}
          onChange={(e) => setEditForm((f) => ({ ...f, platform: e.target.value }))}
          options={GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label }))}
        />
        <Input
          id="editAmount"
          label="Amount (pounds)"
          type="number"
          step="0.01"
          min="0"
          value={editForm.amount}
          onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
          placeholder="e.g. 150.00"
        />
        <div className="form-row">
          <Input
            id="editPeriodStart"
            label="Period start"
            type="date"
            value={editForm.periodStart}
            onChange={(e) => setEditForm((f) => ({ ...f, periodStart: e.target.value }))}
          />
          <Input
            id="editPeriodEnd"
            label="Period end"
            type="date"
            value={editForm.periodEnd}
            onChange={(e) => setEditForm((f) => ({ ...f, periodEnd: e.target.value }))}
          />
        </div>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        open={showCsv}
        onClose={() => {
          setShowCsv(false);
          setCsvPreview(null);
          setCsvContent("");
        }}
        title="Import Earnings from CSV"
        large
        footer={
          csvPreview ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCsvPreview(null);
                  setCsvContent("");
                }}
              >
                Back
              </Button>
              <Button variant="primary" size="sm" onClick={handleCsvConfirm} disabled={csvLoading}>
                {csvLoading ? "Importing..." : `Import ${csvPreview.rows?.length || 0} rows`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowCsv(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCsvPreview}
                disabled={!csvContent || csvLoading}
              >
                {csvLoading ? "Parsing..." : "Preview"}
              </Button>
            </>
          )
        }
      >
        {!csvPreview ? (
          <>
            <div className="form-group">
              <label className="form-label">CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="form-input"
                style={{ padding: "0.5rem" }}
              />
            </div>
            <Select
              id="csvPlatform"
              label="Platform"
              value={csvPlatform}
              onChange={(e) => setCsvPlatform(e.target.value)}
              options={GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label }))}
            />
          </>
        ) : (
          <div className="csv-preview">
            <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
              Found {csvPreview.rows?.length || 0} earning{(csvPreview.rows?.length || 0) !== 1 ? "s" : ""} to import. Review before confirming.
            </p>
            {(csvPreview.duplicateCount > 0 || csvPreview.totalAmountPence != null) && (
              <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                {csvPreview.totalAmountPence != null && (
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                    Total: <strong style={{ color: "var(--text-primary)" }}>{formatPence(csvPreview.totalAmountPence)}</strong>
                  </span>
                )}
                {csvPreview.duplicateCount > 0 && (
                  <span style={{ fontSize: "0.8125rem", color: "var(--color-warning, #f59e0b)" }}>
                    {csvPreview.duplicateCount} duplicate{csvPreview.duplicateCount !== 1 ? "s" : ""} detected (shown with reduced opacity)
                  </span>
                )}
              </div>
            )}
            {csvPreview.rows && csvPreview.rows.length > 0 && (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Amount</th>
                      <th>Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.slice(0, 20).map((row: any, i: number) => (
                      <tr
                        key={i}
                        style={row.isDuplicate ? { opacity: 0.4 } : undefined}
                        title={row.isDuplicate ? "Duplicate — already imported" : undefined}
                      >
                        <td>{row.platform}</td>
                        <td>{formatPence(row.amountPence)}</td>
                        <td>
                          {row.periodStart} \u2013 {row.periodEnd}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteEarning}
        onClose={() => setDeleteEarning(null)}
        onConfirm={handleDelete}
        title="Delete Earning"
        message="Are you sure you want to delete this earning record?"
        loading={deleteLoading}
      />
    </>
  );
}
