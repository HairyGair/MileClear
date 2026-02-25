"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
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
import type { Trip, PaginatedResponse } from "@mileclear/shared";
import { GIG_PLATFORMS } from "@mileclear/shared";

const PAGE_SIZE = 20;

const PLATFORM_OPTIONS = GIG_PLATFORMS.map((p) => ({
  value: p.value,
  label: p.label,
}));

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "business" | "personal">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [editClass, setEditClass] = useState("business");
  const [editPlatform, setEditPlatform] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Add manual trip modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    startAddress: "",
    endAddress: "",
    distanceMiles: "",
    classification: "business",
    platformTag: "",
    notes: "",
    startedAt: new Date().toISOString().slice(0, 16),
  });
  const [addLoading, setAddLoading] = useState(false);

  // Delete modal
  const [deleteTrip, setDeleteTrip] = useState<Trip | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (filter !== "all") {
        params.set("classification", filter);
      }
      const res = await api.get<PaginatedResponse<Trip>>(`/trips/?${params}`);
      setTrips(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const handleFilterChange = (f: "all" | "business" | "personal") => {
    setFilter(f);
    setPage(1);
  };

  // Edit
  const openEdit = (trip: Trip) => {
    setEditTrip(trip);
    setEditClass(trip.classification);
    setEditPlatform(trip.platformTag || "");
    setEditNotes(trip.notes || "");
  };

  const handleEdit = async () => {
    if (!editTrip) return;
    setEditLoading(true);
    try {
      await api.patch(`/trips/${editTrip.id}`, {
        classification: editClass,
        platformTag: editPlatform || null,
        notes: editNotes || null,
      });
      setEditTrip(null);
      loadTrips();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  // Add
  const handleAdd = async () => {
    if (!addForm.startAddress.trim()) {
      setError("Start address is required");
      return;
    }
    if (!addForm.endAddress.trim()) {
      setError("End address is required");
      return;
    }
    const distance = parseFloat(addForm.distanceMiles);
    if (!addForm.distanceMiles || isNaN(distance) || distance <= 0) {
      setError("Please enter a valid distance");
      return;
    }
    setAddLoading(true);
    setError(null);
    try {
      await api.post("/trips/", {
        startAddress: addForm.startAddress.trim(),
        endAddress: addForm.endAddress.trim(),
        distanceMiles: distance,
        classification: addForm.classification,
        platformTag: addForm.platformTag || undefined,
        notes: addForm.notes || undefined,
        startedAt: new Date(addForm.startedAt).toISOString(),
        startLat: 0,
        startLng: 0,
      });
      setShowAdd(false);
      setAddForm({
        startAddress: "",
        endAddress: "",
        distanceMiles: "",
        classification: "business",
        platformTag: "",
        notes: "",
        startedAt: new Date().toISOString().slice(0, 16),
      });
      loadTrips();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteTrip) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/trips/${deleteTrip.id}`);
      setDeleteTrip(null);
      loadTrips();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Trips"
        subtitle={`${total} trip${total !== 1 ? "s" : ""} recorded`}
        action={
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
            + Add trip
          </Button>
        }
      />

      {/* Filters */}
      <div className="filter-chips" style={{ marginBottom: "1.25rem" }}>
        {(["all", "business", "personal"] as const).map((f) => (
          <button
            key={f}
            className={`filter-chip ${filter === f ? "filter-chip--active" : ""}`}
            onClick={() => handleFilterChange(f)}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="row" count={5} style={{ marginBottom: 8 }} />
      ) : trips.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h18M12 3v18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
          title="No trips yet"
          description="Your trips will appear here once you start tracking or add them manually."
          action={
            <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
              Add your first trip
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
                  <th>Route</th>
                  <th>Distance</th>
                  <th>Type</th>
                  <th className="hide-mobile">Platform</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => (
                  <tr key={trip.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(trip.startedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </td>
                    <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {trip.startAddress || "Unknown"} → {trip.endAddress || "Unknown"}
                    </td>
                    <td>{trip.distanceMiles?.toFixed(1) || "0"} mi</td>
                    <td>
                      <Badge variant={trip.classification === "business" ? "business" : "personal"}>
                        {trip.classification}
                      </Badge>
                    </td>
                    <td className="hide-mobile">
                      {trip.platformTag ? (
                        <Badge variant="source">{trip.platformTag}</Badge>
                      ) : (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <div className="table__actions">
                        <button
                          className="table__action-btn"
                          onClick={() => openEdit(trip)}
                        >
                          Edit
                        </button>
                        <button
                          className="table__action-btn table__action-btn--danger"
                          onClick={() => setDeleteTrip(trip)}
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

      {/* Edit Modal */}
      <Modal
        open={!!editTrip}
        onClose={() => setEditTrip(null)}
        title="Edit Trip"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditTrip(null)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleEdit} disabled={editLoading}>
              {editLoading ? "Saving..." : "Save changes"}
            </Button>
          </>
        }
      >
        <Select
          id="editClass"
          label="Classification"
          value={editClass}
          onChange={(e) => setEditClass(e.target.value)}
          options={[
            { value: "business", label: "Business" },
            { value: "personal", label: "Personal" },
          ]}
        />
        <Select
          id="editPlatform"
          label="Platform"
          value={editPlatform}
          onChange={(e) => setEditPlatform(e.target.value)}
          options={[{ value: "", label: "None" }, ...PLATFORM_OPTIONS]}
        />
        <Input
          id="editNotes"
          label="Notes"
          value={editNotes}
          onChange={(e) => setEditNotes(e.target.value)}
          placeholder="Optional notes"
        />
      </Modal>

      {/* Add Trip Modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Manual Trip"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={addLoading}>
              {addLoading ? "Adding..." : "Add trip"}
            </Button>
          </>
        }
      >
        <div className="form-row">
          <Input
            id="addStart"
            label="Start address"
            value={addForm.startAddress}
            onChange={(e) => setAddForm((f) => ({ ...f, startAddress: e.target.value }))}
            placeholder="e.g. 10 Downing Street"
          />
          <Input
            id="addEnd"
            label="End address"
            value={addForm.endAddress}
            onChange={(e) => setAddForm((f) => ({ ...f, endAddress: e.target.value }))}
            placeholder="e.g. Buckingham Palace"
          />
        </div>
        <div className="form-row">
          <Input
            id="addDistance"
            label="Distance (miles)"
            type="number"
            step="0.1"
            min="0"
            value={addForm.distanceMiles}
            onChange={(e) => setAddForm((f) => ({ ...f, distanceMiles: e.target.value }))}
            placeholder="e.g. 12.5"
          />
          <Input
            id="addDate"
            label="Date & time"
            type="datetime-local"
            value={addForm.startedAt}
            onChange={(e) => setAddForm((f) => ({ ...f, startedAt: e.target.value }))}
          />
        </div>
        <div className="form-row">
          <Select
            id="addClass"
            label="Classification"
            value={addForm.classification}
            onChange={(e) => setAddForm((f) => ({ ...f, classification: e.target.value }))}
            options={[
              { value: "business", label: "Business" },
              { value: "personal", label: "Personal" },
            ]}
          />
          <Select
            id="addPlatform"
            label="Platform"
            value={addForm.platformTag}
            onChange={(e) => setAddForm((f) => ({ ...f, platformTag: e.target.value }))}
            options={[{ value: "", label: "None" }, ...PLATFORM_OPTIONS]}
          />
        </div>
        <Input
          id="addNotes"
          label="Notes"
          value={addForm.notes}
          onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Optional notes"
        />
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteTrip}
        onClose={() => setDeleteTrip(null)}
        onConfirm={handleDelete}
        title="Delete Trip"
        message={`Are you sure you want to delete this trip? This action cannot be undone.`}
        loading={deleteLoading}
      />
    </>
  );
}
