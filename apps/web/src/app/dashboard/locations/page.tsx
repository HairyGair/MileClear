"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Badge } from "../../../components/ui/Badge";
import { Input } from "../../../components/ui/Input";
import { Select } from "../../../components/ui/Select";
import { Modal } from "../../../components/ui/Modal";
import { ConfirmModal } from "../../../components/ui/ConfirmModal";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";
import type { SavedLocation } from "@mileclear/shared";

const FREE_LIMIT = 2;

const LOCATION_TYPE_OPTIONS = [
  { value: "home", label: "Home" },
  { value: "work", label: "Work" },
  { value: "depot", label: "Depot" },
  { value: "custom", label: "Custom" },
];

const TYPE_ICONS: Record<string, string> = {
  home: "\u{1F3E0}",
  work: "\u{1F3E2}",
  depot: "\u{1F4E6}",
  custom: "\u{1F4CD}",
};

export default function LocationsPage() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    locationType: "home",
    latitude: "",
    longitude: "",
    radiusMeters: "150",
    geofenceEnabled: true,
  });
  const [formLoading, setFormLoading] = useState(false);

  // Delete
  const [deleteLocation, setDeleteLocation] = useState<SavedLocation | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isPremium = user?.isPremium ?? false;
  const atFreeLimit = !isPremium && locations.length >= FREE_LIMIT;

  const loadLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: SavedLocation[] }>("/saved-locations/");
      setLocations(res.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const openAdd = () => {
    setEditId(null);
    setForm({
      name: "",
      locationType: "home",
      latitude: "",
      longitude: "",
      radiusMeters: "150",
      geofenceEnabled: true,
    });
    setShowForm(true);
  };

  const openEdit = (loc: SavedLocation) => {
    setEditId(loc.id);
    setForm({
      name: loc.name,
      locationType: loc.locationType,
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      radiusMeters: String(loc.radiusMeters),
      geofenceEnabled: loc.geofenceEnabled,
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    const lat = parseFloat(form.latitude);
    const lng = parseFloat(form.longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError("Please enter a valid latitude (-90 to 90)");
      return;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      setError("Please enter a valid longitude (-180 to 180)");
      return;
    }
    const radius = parseInt(form.radiusMeters, 10);
    if (isNaN(radius) || radius <= 0) {
      setError("Please enter a valid radius");
      return;
    }

    setFormLoading(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        locationType: form.locationType,
        latitude: lat,
        longitude: lng,
        radiusMeters: radius,
        geofenceEnabled: form.geofenceEnabled,
      };

      if (editId) {
        await api.patch(`/saved-locations/${editId}`, body);
      } else {
        await api.post("/saved-locations/", body);
      }
      setShowForm(false);
      loadLocations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteLocation) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/saved-locations/${deleteLocation.id}`);
      setDeleteLocation(null);
      loadLocations();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Saved Locations"
        subtitle="Manage your home, work, and depot locations for auto-trip detection"
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={openAdd}
            disabled={atFreeLimit}
          >
            + Add location
          </Button>
        }
      />

      {atFreeLimit && (
        <div className="alert alert--warning" style={{ marginBottom: "1rem" }}>
          Free accounts are limited to {FREE_LIMIT} saved locations. Upgrade to Pro for unlimited.
        </div>
      )}

      {!isPremium && !atFreeLimit && locations.length > 0 && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-faint)", marginBottom: "1rem" }}>
          {locations.length}/{FREE_LIMIT} free locations used
        </p>
      )}

      {error && (
        <div className="alert alert--error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingSkeleton variant="row" count={3} style={{ marginBottom: 8 }} />
      ) : locations.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
            </svg>
          }
          title="No saved locations yet"
          description="Save your frequent locations like home, work, or depot. On mobile, these enable automatic trip detection via geofencing."
          action={
            <Button variant="primary" size="sm" onClick={openAdd}>
              Add your first location
            </Button>
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {locations.map((loc) => (
            <div key={loc.id} className="earning-card">
              <div className="earning-card__left">
                <div className="earning-card__amount">
                  {TYPE_ICONS[loc.locationType] || TYPE_ICONS.custom} {loc.name}
                </div>
                <div className="earning-card__meta">
                  <Badge variant="source">{loc.locationType}</Badge>
                  <span>
                    {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                  </span>
                  <span>{loc.radiusMeters}m radius</span>
                  {loc.geofenceEnabled && <Badge variant="business">Geofence</Badge>}
                </div>
              </div>
              <div className="earning-card__right">
                <button
                  className="table__action-btn"
                  onClick={() => openEdit(loc)}
                >
                  Edit
                </button>
                <button
                  className="table__action-btn table__action-btn--danger"
                  onClick={() => setDeleteLocation(loc)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? "Edit Location" : "Add Location"}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={formLoading}>
              {formLoading ? "Saving..." : editId ? "Save changes" : "Add location"}
            </Button>
          </>
        }
      >
        <Input
          id="locName"
          label="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Home, Warehouse, Office"
        />
        <Select
          id="locType"
          label="Type"
          value={form.locationType}
          onChange={(e) => setForm((f) => ({ ...f, locationType: e.target.value }))}
          options={LOCATION_TYPE_OPTIONS}
        />
        <div className="form-row">
          <Input
            id="locLat"
            label="Latitude"
            type="number"
            step="0.0001"
            value={form.latitude}
            onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
            placeholder="e.g. 51.5074"
          />
          <Input
            id="locLng"
            label="Longitude"
            type="number"
            step="0.0001"
            value={form.longitude}
            onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
            placeholder="e.g. -0.1278"
          />
        </div>
        <div className="form-row">
          <Input
            id="locRadius"
            label="Geofence radius (metres)"
            type="number"
            min="50"
            max="1000"
            value={form.radiusMeters}
            onChange={(e) => setForm((f) => ({ ...f, radiusMeters: e.target.value }))}
          />
          <div className="form-group">
            <label className="form-label" htmlFor="locGeofence">Geofence enabled</label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginTop: "0.25rem" }}>
              <input
                id="locGeofence"
                type="checkbox"
                checked={form.geofenceEnabled}
                onChange={(e) => setForm((f) => ({ ...f, geofenceEnabled: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: "var(--amber)" }}
              />
              <span style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>
                {form.geofenceEnabled ? "On" : "Off"}
              </span>
            </label>
          </div>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginTop: "0.25rem" }}>
          Tip: Use Google Maps to find coordinates. Right-click any point and copy the lat/lng.
        </p>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteLocation}
        onClose={() => setDeleteLocation(null)}
        onConfirm={handleDelete}
        title="Delete Location"
        message={`Are you sure you want to delete "${deleteLocation?.name}"? This will also disable geofencing for this location on mobile.`}
        loading={deleteLoading}
      />
    </>
  );
}
