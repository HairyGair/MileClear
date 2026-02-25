"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Modal } from "../../../components/ui/Modal";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { Pagination } from "../../../components/ui/Pagination";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";

const PAGE_SIZE = 20;

interface FuelLog {
  id: string;
  vehicleId: string | null;
  litres: number;
  costPence: number;
  stationName: string | null;
  odometerReading: number | null;
  loggedAt: string;
  createdAt: string;
  vehicle?: { make: string; model: string } | null;
}

interface Vehicle {
  id: string;
  make: string;
  model: string;
}

interface FuelLogsResponse {
  data: FuelLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function formatPence(pence: number): string {
  return `\u00A3${(pence / 100).toFixed(2)}`;
}

export default function FuelPage() {
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    vehicleId: "",
    litres: "",
    costPounds: "",
    stationName: "",
    loggedAt: new Date().toISOString().slice(0, 16),
  });
  const [addLoading, setAddLoading] = useState(false);

  // Delete
  const [deleteLog, setDeleteLog] = useState<FuelLog | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await api.get<FuelLogsResponse>(`/fuel/logs?${params}`);
      setLogs(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  const loadVehicles = useCallback(async () => {
    try {
      const res = await api.get<{ data: Vehicle[] }>("/vehicles/");
      setVehicles(res.data);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    loadLogs();
    loadVehicles();
  }, [loadLogs, loadVehicles]);

  // Compute totals
  const totalSpendPence = logs.reduce((sum, l) => sum + l.costPence, 0);
  const totalLitres = logs.reduce((sum, l) => sum + l.litres, 0);
  const avgPencePerLitre = totalLitres > 0 ? Math.round(totalSpendPence / totalLitres) : 0;

  // Add
  const handleAdd = async () => {
    const litres = parseFloat(addForm.litres);
    const costPounds = parseFloat(addForm.costPounds);
    if (!addForm.litres || isNaN(litres) || litres <= 0) {
      setError("Please enter a valid number of litres");
      return;
    }
    if (!addForm.costPounds || isNaN(costPounds) || costPounds <= 0) {
      setError("Please enter a valid cost");
      return;
    }
    setAddLoading(true);
    setError(null);
    try {
      await api.post("/fuel/logs", {
        vehicleId: addForm.vehicleId || undefined,
        litres,
        costPence: Math.round(costPounds * 100),
        stationName: addForm.stationName.trim() || undefined,
        loggedAt: new Date(addForm.loggedAt).toISOString(),
      });
      setShowAdd(false);
      setAddForm({ vehicleId: "", litres: "", costPounds: "", stationName: "", loggedAt: new Date().toISOString().slice(0, 16) });
      loadLogs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteLog) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/fuel/logs/${deleteLog.id}`);
      setDeleteLog(null);
      loadLogs();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const vehicleOptions = [
    { value: "", label: "No vehicle" },
    ...vehicles.map((v) => ({ value: v.id, label: `${v.make} ${v.model}` })),
  ];

  return (
    <>
      <PageHeader
        title="Fuel"
        subtitle={`${total} fill-up${total !== 1 ? "s" : ""} recorded`}
        action={
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
            + Add fill-up
          </Button>
        }
      />

      {/* Summary */}
      <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--amber">{formatPence(totalSpendPence)}</div>
          <div className="stat-card__label">Total Spend</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{totalLitres.toFixed(1)}L</div>
          <div className="stat-card__label">Total Litres</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{avgPencePerLitre > 0 ? `${(avgPencePerLitre / 100).toFixed(1)}p` : "—"}</div>
          <div className="stat-card__label">Avg Cost/Litre</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{total}</div>
          <div className="stat-card__label">Fill-ups</div>
        </div>
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="row" count={5} style={{ marginBottom: 8 }} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 22V8l4-6h6l4 6v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 2v4M3 14h14M21 10v12M17 10h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
          title="No fuel logs yet"
          description="Track your fuel fill-ups to see spending trends and cost per mile."
          action={
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
              Add your first fill-up
            </Button>
          }
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Station</th>
                  <th>Litres</th>
                  <th>Cost</th>
                  <th className="hide-mobile">Cost/L</th>
                  <th className="hide-mobile">Vehicle</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(log.loggedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {log.stationName || <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td>{log.litres.toFixed(1)}L</td>
                    <td style={{ fontWeight: 600 }}>{formatPence(log.costPence)}</td>
                    <td className="hide-mobile">
                      {(log.costPence / log.litres / 100).toFixed(1)}p/L
                    </td>
                    <td className="hide-mobile">
                      {log.vehicle ? (
                        `${log.vehicle.make} ${log.vehicle.model}`
                      ) : (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="table__actions">
                        <button
                          className="table__action-btn table__action-btn--danger"
                          onClick={() => setDeleteLog(log)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}

      {/* Add Modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Fuel Fill-up"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={addLoading}>
              {addLoading ? "Adding..." : "Add fill-up"}
            </Button>
          </>
        }
      >
        <div className="form-row">
          <Input
            id="addLitres"
            label="Litres"
            type="number"
            step="0.1"
            min="0"
            value={addForm.litres}
            onChange={(e) => setAddForm((f) => ({ ...f, litres: e.target.value }))}
            placeholder="e.g. 45.5"
          />
          <Input
            id="addCost"
            label="Cost (pounds)"
            type="number"
            step="0.01"
            min="0"
            value={addForm.costPounds}
            onChange={(e) => setAddForm((f) => ({ ...f, costPounds: e.target.value }))}
            placeholder="e.g. 72.50"
          />
        </div>
        <Input
          id="addStation"
          label="Station name"
          value={addForm.stationName}
          onChange={(e) => setAddForm((f) => ({ ...f, stationName: e.target.value }))}
          placeholder="e.g. Tesco Extra"
        />
        <div className="form-row">
          <Select
            id="addVehicle"
            label="Vehicle"
            value={addForm.vehicleId}
            onChange={(e) => setAddForm((f) => ({ ...f, vehicleId: e.target.value }))}
            options={vehicleOptions}
          />
          <Input
            id="addDate"
            label="Date"
            type="datetime-local"
            value={addForm.loggedAt}
            onChange={(e) => setAddForm((f) => ({ ...f, loggedAt: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteLog}
        onClose={() => setDeleteLog(null)}
        onConfirm={handleDelete}
        title="Delete Fuel Log"
        message="Are you sure you want to delete this fuel log? This action cannot be undone."
        loading={deleteLoading}
      />
    </>
  );
}
