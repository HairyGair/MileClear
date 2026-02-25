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
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import type { Vehicle } from "@mileclear/shared";
import { FUEL_TYPES, VEHICLE_TYPES } from "@mileclear/shared";

const FUEL_OPTIONS = FUEL_TYPES.map((f) => ({
  value: f,
  label: f.charAt(0).toUpperCase() + f.slice(1),
}));

const VEHICLE_TYPE_OPTIONS = VEHICLE_TYPES.map((v) => ({
  value: v,
  label: v.charAt(0).toUpperCase() + v.slice(1),
}));

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add/Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [form, setForm] = useState({
    make: "",
    model: "",
    year: "",
    fuelType: "petrol",
    vehicleType: "car",
    registrationPlate: "",
    estimatedMpg: "",
    isPrimary: true,
  });
  const [formLoading, setFormLoading] = useState(false);

  // DVLA lookup
  const [regLookup, setRegLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);

  // Delete
  const [deleteVehicle, setDeleteVehicle] = useState<Vehicle | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Vehicle[]>("/vehicles/");
      setVehicles(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const openAdd = () => {
    setEditVehicle(null);
    setForm({
      make: "",
      model: "",
      year: "",
      fuelType: "petrol",
      vehicleType: "car",
      registrationPlate: "",
      estimatedMpg: "",
      isPrimary: vehicles.length === 0,
    });
    setRegLookup("");
    setShowModal(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditVehicle(v);
    setForm({
      make: v.make,
      model: v.model,
      year: v.year ? String(v.year) : "",
      fuelType: v.fuelType,
      vehicleType: v.vehicleType,
      registrationPlate: v.registrationPlate || "",
      estimatedMpg: v.estimatedMpg ? String(v.estimatedMpg) : "",
      isPrimary: v.isPrimary,
    });
    setShowModal(true);
  };

  const handleLookup = async () => {
    if (!regLookup) return;
    setLookupLoading(true);
    try {
      const res = await api.post<any>("/vehicles/lookup", {
        registrationNumber: regLookup.replace(/\s/g, "").toUpperCase(),
      });
      setForm((f) => ({
        ...f,
        make: res.make || f.make,
        model: "",
        year: res.yearOfManufacture ? String(res.yearOfManufacture) : f.year,
        fuelType: res.fuelType?.toLowerCase() || f.fuelType,
        registrationPlate: regLookup.replace(/\s/g, "").toUpperCase(),
      }));
    } catch (err: any) {
      setError(err.message || "DVLA lookup failed");
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSave = async () => {
    setFormLoading(true);
    try {
      const body = {
        make: form.make,
        model: form.model,
        year: form.year ? parseInt(form.year) : undefined,
        fuelType: form.fuelType,
        vehicleType: form.vehicleType,
        registrationPlate: form.registrationPlate || undefined,
        estimatedMpg: form.estimatedMpg ? parseFloat(form.estimatedMpg) : undefined,
        isPrimary: form.isPrimary,
      };

      if (editVehicle) {
        await api.patch(`/vehicles/${editVehicle.id}`, body);
      } else {
        await api.post("/vehicles/", body);
      }
      setShowModal(false);
      loadVehicles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleSetPrimary = async (v: Vehicle) => {
    try {
      await api.patch(`/vehicles/${v.id}`, { isPrimary: true });
      loadVehicles();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteVehicle) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/vehicles/${deleteVehicle.id}`);
      setDeleteVehicle(null);
      loadVehicles();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Vehicles"
        subtitle="Manage your registered vehicles"
        action={
          <Button variant="primary" size="sm" onClick={openAdd}>
            + Add vehicle
          </Button>
        }
      />

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="card" count={2} style={{ marginBottom: 12 }} />
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 15l2-7a1 1 0 01.96-.73h12.08a1 1 0 01.96.73L21 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <rect x="2" y="15" width="20" height="5" rx="1.5" stroke="currentColor" strokeWidth="2" />
              <circle cx="7" cy="20" r="1.5" fill="currentColor" />
              <circle cx="17" cy="20" r="1.5" fill="currentColor" />
            </svg>
          }
          title="No vehicles yet"
          description="Add your vehicle to get accurate HMRC mileage rates."
          action={
            <Button variant="primary" size="sm" onClick={openAdd}>
              Add your vehicle
            </Button>
          }
        />
      ) : (
        <div className="grid-auto">
          {vehicles.map((v) => (
            <div key={v.id} className="vehicle-card">
              <div className="vehicle-card__head">
                <div>
                  <div className="vehicle-card__name">
                    {v.make} {v.model}
                  </div>
                  {v.year && <div className="vehicle-card__year">{v.year}</div>}
                </div>
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  {v.isPrimary && <Badge variant="primary">Primary</Badge>}
                  <Badge variant="source">{v.vehicleType}</Badge>
                </div>
              </div>

              <div className="vehicle-card__details">
                <div className="vehicle-card__detail">
                  <span className="vehicle-card__detail-label">Fuel:</span>
                  {v.fuelType}
                </div>
                {v.registrationPlate && (
                  <div className="vehicle-card__detail">
                    <span className="vehicle-card__detail-label">Reg:</span>
                    {v.registrationPlate}
                  </div>
                )}
                {v.estimatedMpg && (
                  <div className="vehicle-card__detail">
                    <span className="vehicle-card__detail-label">MPG:</span>
                    {v.estimatedMpg}
                  </div>
                )}
              </div>

              <div className="vehicle-card__actions">
                <Button variant="ghost" size="sm" onClick={() => openEdit(v)}>
                  Edit
                </Button>
                {!v.isPrimary && (
                  <Button variant="ghost" size="sm" onClick={() => handleSetPrimary(v)}>
                    Set primary
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteVehicle(v)}
                  style={{ color: "var(--dash-red)" }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editVehicle ? "Edit Vehicle" : "Add Vehicle"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={formLoading}>
              {formLoading ? "Saving..." : editVehicle ? "Save changes" : "Add vehicle"}
            </Button>
          </>
        }
      >
        {/* DVLA Lookup */}
        {!editVehicle && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Input
                id="regLookup"
                label="DVLA Reg Lookup (optional)"
                value={regLookup}
                onChange={(e) => setRegLookup(e.target.value)}
                placeholder="e.g. AB12 CDE"
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              onClick={handleLookup}
              disabled={lookupLoading || !regLookup}
            >
              {lookupLoading ? "Looking up..." : "Lookup"}
            </Button>
          </div>
        )}

        <div className="section-divider" />

        <div className="form-row">
          <Input
            id="make"
            label="Make"
            value={form.make}
            onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))}
            placeholder="e.g. Toyota"
            required
          />
          <Input
            id="model"
            label="Model"
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="e.g. Prius"
            required
          />
        </div>
        <div className="form-row">
          <Input
            id="year"
            label="Year"
            type="number"
            value={form.year}
            onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            placeholder="e.g. 2020"
          />
          <Input
            id="regPlate"
            label="Registration plate"
            value={form.registrationPlate}
            onChange={(e) => setForm((f) => ({ ...f, registrationPlate: e.target.value }))}
            placeholder="e.g. AB12 CDE"
          />
        </div>
        <div className="form-row">
          <Select
            id="fuelType"
            label="Fuel type"
            value={form.fuelType}
            onChange={(e) => setForm((f) => ({ ...f, fuelType: e.target.value }))}
            options={FUEL_OPTIONS}
          />
          <Select
            id="vehicleType"
            label="Vehicle type"
            value={form.vehicleType}
            onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))}
            options={VEHICLE_TYPE_OPTIONS}
          />
        </div>
        <Input
          id="mpg"
          label="Estimated MPG"
          type="number"
          step="0.1"
          value={form.estimatedMpg}
          onChange={(e) => setForm((f) => ({ ...f, estimatedMpg: e.target.value }))}
          placeholder="e.g. 45.0"
        />
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteVehicle}
        onClose={() => setDeleteVehicle(null)}
        onConfirm={handleDelete}
        title="Delete Vehicle"
        message={`Are you sure you want to delete ${deleteVehicle?.make} ${deleteVehicle?.model}?`}
        loading={deleteLoading}
      />
    </>
  );
}
