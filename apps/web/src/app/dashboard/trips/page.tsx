"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import type { Trip, TripInsights, TripCoordinate, PaginatedResponse } from "@mileclear/shared";
import { GIG_PLATFORMS, BUSINESS_PURPOSES, fetchRouteDistance } from "@mileclear/shared";
import { useAuth } from "../../../lib/auth-context";
import { useToast } from "../../../components/ui/Toast";

interface DetailTrip extends Trip {
  insights?: TripInsights | null;
  coordinates?: TripCoordinate[];
}

const PAGE_SIZE = 20;

const PLATFORM_OPTIONS = GIG_PLATFORMS.map((p) => ({
  value: p.value,
  label: p.label,
}));

const PURPOSE_OPTIONS = BUSINESS_PURPOSES.map((bp) => ({
  value: bp.value,
  label: bp.label,
}));

export default function TripsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const workType = (user as any)?.workType ?? "gig";
  const isGigDriver = workType === "gig" || workType === "both";
  const isEmployeeDriver = workType === "employee" || workType === "both";

  const initialFilter = (searchParams?.get("filter") as "all" | "business" | "personal" | "unclassified") || "all";

  const [trips, setTrips] = useState<Trip[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<"all" | "business" | "personal" | "unclassified">(initialFilter);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit modal
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [editClass, setEditClass] = useState("business");
  const [editPlatform, setEditPlatform] = useState("");
  const [editBusinessPurpose, setEditBusinessPurpose] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Merge state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMerge, setShowMerge] = useState(false);
  const [mergeClass, setMergeClass] = useState("business");
  const [mergePlatform, setMergePlatform] = useState("");
  const [mergeLoading, setMergeLoading] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    if (selectedIds.size < 2) return;
    setMergeLoading(true);
    try {
      const sorted = trips
        .filter((t) => selectedIds.has(t.id))
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      await api.post("/trips/merge", {
        tripIds: sorted.map((t) => t.id),
        classification: mergeClass,
        platformTag: mergePlatform || null,
      });
      setShowMerge(false);
      setSelectedIds(new Set());
      setMergeClass("business");
      setMergePlatform("");
      toast("Trips merged successfully", "success");
      loadTrips();
    } catch (err: any) {
      toast(err.message || "Failed to merge trips", "error");
    } finally {
      setMergeLoading(false);
    }
  };

  // Add manual trip modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    startAddress: "",
    endAddress: "",
    distanceMiles: "",
    classification: "business",
    platformTag: "",
    businessPurpose: "",
    notes: "",
    startedAt: new Date().toISOString().slice(0, 16),
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addCoords, setAddCoords] = useState<{
    startLat: number; startLng: number; endLat: number; endLng: number;
  } | null>(null);
  const [routeCalcStatus, setRouteCalcStatus] = useState<"idle" | "calculating" | "done" | "error">("idle");
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Extract UK postcode (full or partial outcode) from an address string
  const extractPostcode = (addr: string): { code: string; partial: boolean } | null => {
    const full = addr.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
    if (full) return { code: full[1].replace(/\s+/g, ""), partial: false };
    const partial = addr.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\b/i);
    if (partial) return { code: partial[1], partial: true };
    return null;
  };

  // Geocode via Postcodes.io (UK postcode/outcode) or Nominatim (fallback)
  const geocodeAddress = async (addr: string): Promise<{ lat: number; lng: number } | null> => {
    // Try postcode first — most accurate for UK
    const pc = extractPostcode(addr);
    if (pc) {
      try {
        const endpoint = pc.partial
          ? `https://api.postcodes.io/outcodes/${pc.code}`
          : `https://api.postcodes.io/postcodes/${pc.code}`;
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 200 && data.result) {
            return { lat: data.result.latitude, lng: data.result.longitude };
          }
        }
      } catch { /* fall through to Nominatim */ }
    }
    // Fallback: Nominatim with countrycodes=gb
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addr)}&format=json&limit=1&countrycodes=gb`,
        { headers: { "User-Agent": "MileClear/1.0" } }
      );
      const data = await res.json();
      if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch { /* give up */ }
    return null;
  };

  // Geocode addresses and calculate route distance (debounced)
  useEffect(() => {
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    const start = addForm.startAddress.trim();
    const end = addForm.endAddress.trim();
    if (!start || !end || start.length < 3 || end.length < 3) {
      setAddCoords(null);
      setRouteCalcStatus("idle");
      return;
    }
    geocodeTimerRef.current = setTimeout(async () => {
      setRouteCalcStatus("calculating");
      try {
        const [startGeo, endGeo] = await Promise.all([
          geocodeAddress(start),
          geocodeAddress(end),
        ]);
        if (!startGeo || !endGeo) {
          setRouteCalcStatus("error");
          return;
        }
        const coords = {
          startLat: startGeo.lat,
          startLng: startGeo.lng,
          endLat: endGeo.lat,
          endLng: endGeo.lng,
        };
        setAddCoords(coords);
        const route = await fetchRouteDistance(coords.startLat, coords.startLng, coords.endLat, coords.endLng);
        if (route) {
          setAddForm((f) => ({ ...f, distanceMiles: String(route.distanceMiles) }));
          setRouteCalcStatus("done");
        } else {
          setRouteCalcStatus("error");
        }
      } catch {
        setRouteCalcStatus("error");
      }
    }, 800);
    return () => { if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current); };
  }, [addForm.startAddress, addForm.endAddress]);

  // Delete modal
  const [deleteTrip, setDeleteTrip] = useState<Trip | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Detail modal (view trip + insights)
  const [detailTrip, setDetailTrip] = useState<DetailTrip | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

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
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params.set("to", end.toISOString());
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
  }, [page, filter, dateFrom, dateTo]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const handleFilterChange = (f: "all" | "business" | "personal" | "unclassified") => {
    setFilter(f);
    setPage(1);
  };

  // Edit
  const openEdit = (trip: Trip) => {
    setEditTrip(trip);
    setEditClass(trip.classification);
    setEditPlatform(trip.platformTag || "");
    setEditBusinessPurpose((trip as any).businessPurpose || "");
    setEditNotes(trip.notes || "");
  };

  const handleEdit = async () => {
    if (!editTrip) return;
    setEditLoading(true);
    try {
      await api.patch(`/trips/${editTrip.id}`, {
        classification: editClass,
        platformTag: editPlatform || null,
        businessPurpose: editBusinessPurpose || null,
        notes: editNotes || null,
      });
      setEditTrip(null);
      toast("Trip updated");
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
        businessPurpose: addForm.businessPurpose || undefined,
        notes: addForm.notes || undefined,
        startedAt: new Date(addForm.startedAt).toISOString(),
        startLat: addCoords?.startLat ?? 0,
        startLng: addCoords?.startLng ?? 0,
        endLat: addCoords?.endLat,
        endLng: addCoords?.endLng,
      });
      setShowAdd(false);
      setAddCoords(null);
      setRouteCalcStatus("idle");
      setAddForm({
        startAddress: "",
        endAddress: "",
        distanceMiles: "",
        classification: "business",
        platformTag: "",
        businessPurpose: "",
        notes: "",
        startedAt: new Date().toISOString().slice(0, 16),
      });
      toast("Trip added");
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
      toast("Trip deleted");
      loadTrips();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Detail
  const openDetail = async (trip: Trip) => {
    setDetailLoading(true);
    setDetailTrip(trip);
    setShowMap(false);
    try {
      const res = await api.get<{ data: DetailTrip }>(`/trips/${trip.id}`);
      setDetailTrip(res.data);
    } catch {
      // Still show basic trip info without insights
    } finally {
      setDetailLoading(false);
    }
  };

  // Cleanup map on modal close
  const closeDetail = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    setShowMap(false);
    setDetailTrip(null);
  };

  // Load Leaflet and render map
  useEffect(() => {
    if (!showMap || !detailTrip || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // Already rendered

    const hasCoords = detailTrip.coordinates && detailTrip.coordinates.length >= 2;
    const hasStartEnd = detailTrip.startLat && detailTrip.startLng;
    if (!hasCoords && !hasStartEnd) return;

    function renderMap() {
      const L = (window as any).L;
      if (!L || !mapContainerRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      });

      // Dark tile layer
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      const coords = detailTrip!.coordinates || [];
      const startIcon = L.divIcon({
        className: "trip-map-marker trip-map-marker--start",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const endIcon = L.divIcon({
        className: "trip-map-marker trip-map-marker--end",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      if (coords.length >= 2) {
        // Draw GPS trail
        const latlngs = coords.map((c: TripCoordinate) => [c.lat, c.lng]);
        const polyline = L.polyline(latlngs, {
          color: "#fbbf24",
          weight: 3,
          opacity: 0.85,
          smoothFactor: 1.5,
        }).addTo(map);

        L.marker(latlngs[0], { icon: startIcon }).addTo(map);
        L.marker(latlngs[latlngs.length - 1], { icon: endIcon }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
      } else if (detailTrip!.startLat && detailTrip!.startLng) {
        // Just start/end markers with straight line
        const start: [number, number] = [detailTrip!.startLat, detailTrip!.startLng];
        L.marker(start, { icon: startIcon }).addTo(map);

        if (detailTrip!.endLat && detailTrip!.endLng) {
          const end: [number, number] = [detailTrip!.endLat, detailTrip!.endLng];
          L.marker(end, { icon: endIcon }).addTo(map);
          L.polyline([start, end], {
            color: "#fbbf24",
            weight: 2,
            opacity: 0.6,
            dashArray: "8, 8",
          }).addTo(map);
          map.fitBounds(L.latLngBounds(start, end), { padding: [30, 30] });
        } else {
          map.setView(start, 14);
        }
      }

      mapInstanceRef.current = map;
    }

    // Check if Leaflet is already loaded
    if ((window as any).L) {
      renderMap();
      return;
    }

    // Load Leaflet CSS
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Load Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => renderMap();
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [showMap, detailTrip]);

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
        {(["all", "unclassified", "business", "personal"] as const).map((f) => (
          <button
            key={f}
            className={`filter-chip ${filter === f ? "filter-chip--active" : ""}`}
            onClick={() => handleFilterChange(f)}
          >
            {f === "all" ? "All" : f === "unclassified" ? "Inbox" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Date range filter */}
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", alignItems: "flex-end" }}>
        <Input
          id="dateFrom"
          label="From"
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          style={{ maxWidth: 180 }}
        />
        <Input
          id="dateTo"
          label="To"
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          style={{ maxWidth: 180 }}
        />
        {(dateFrom || dateTo) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
          >
            Clear
          </Button>
        )}
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
          {/* Merge controls */}
          {selectedIds.size > 0 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.75rem 1rem",
              marginBottom: "0.75rem",
              background: "rgba(96, 165, 250, 0.08)",
              border: "1px solid rgba(96, 165, 250, 0.25)",
              borderRadius: "var(--radius-lg, 12px)",
              fontSize: "0.875rem",
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round">
                <circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" />
                <path d="M6 21V9a9 9 0 009 9" />
              </svg>
              <span style={{ color: "#93c5fd", fontWeight: 600 }}>
                {selectedIds.size} trip{selectedIds.size !== 1 ? "s" : ""} selected
              </span>
              <span style={{ flex: 1 }} />
              <button
                style={{
                  color: "var(--text-muted)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  padding: "0.375rem 0.75rem",
                }}
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowMerge(true)}
                disabled={selectedIds.size < 2}
              >
                Merge {selectedIds.size} Trips
              </Button>
            </div>
          )}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
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
                  <tr key={trip.id} style={selectedIds.has(trip.id) ? { background: "rgba(96, 165, 250, 0.06)" } : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(trip.id)}
                        onChange={() => toggleSelect(trip.id)}
                        style={{ accentColor: "#60a5fa", width: 16, height: 16, cursor: "pointer" }}
                      />
                    </td>
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
                      <Badge variant={trip.classification === "business" ? "business" : trip.classification === "personal" ? "personal" : "warning"}>
                        {trip.classification === "unclassified" ? "Unclassified" : trip.classification}
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
                          onClick={() => openDetail(trip)}
                        >
                          View
                        </button>
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
            { value: "unclassified", label: "Unclassified" },
          ]}
        />
        {isGigDriver && (
          <Select
            id="editPlatform"
            label="Platform"
            value={editPlatform}
            onChange={(e) => setEditPlatform(e.target.value)}
            options={[{ value: "", label: "None" }, ...PLATFORM_OPTIONS]}
          />
        )}
        {isEmployeeDriver && (
          <Select
            id="editBusinessPurpose"
            label="Business Purpose"
            value={editBusinessPurpose}
            onChange={(e) => setEditBusinessPurpose(e.target.value)}
            options={[{ value: "", label: "None" }, ...PURPOSE_OPTIONS]}
          />
        )}
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
          <div style={{ flex: 1 }}>
            <Input
              id="addDistance"
              label={
                routeCalcStatus === "calculating"
                  ? "Distance (calculating route...)"
                  : routeCalcStatus === "done"
                    ? "Distance (road route)"
                    : "Distance (miles)"
              }
              type="number"
              step="0.1"
              min="0"
              value={addForm.distanceMiles}
              onChange={(e) => setAddForm((f) => ({ ...f, distanceMiles: e.target.value }))}
              placeholder={routeCalcStatus === "calculating" ? "Calculating..." : "e.g. 12.5"}
            />
            {routeCalcStatus === "done" && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem", display: "block" }}>
                Auto-calculated via road — you can override
              </span>
            )}
            {routeCalcStatus === "error" && (
              <span style={{ fontSize: "0.75rem", color: "var(--amber-400)", marginTop: "0.25rem", display: "block" }}>
                Could not calculate route — enter distance manually
              </span>
            )}
          </div>
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
          {isGigDriver && (
            <Select
              id="addPlatform"
              label="Platform"
              value={addForm.platformTag}
              onChange={(e) => setAddForm((f) => ({ ...f, platformTag: e.target.value }))}
              options={[{ value: "", label: "None" }, ...PLATFORM_OPTIONS]}
            />
          )}
          {isEmployeeDriver && (
            <Select
              id="addBusinessPurpose"
              label="Business Purpose"
              value={addForm.businessPurpose}
              onChange={(e) => setAddForm((f) => ({ ...f, businessPurpose: e.target.value }))}
              options={[{ value: "", label: "None" }, ...PURPOSE_OPTIONS]}
            />
          )}
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

      {/* Trip Detail Modal */}
      <Modal
        open={!!detailTrip}
        onClose={closeDetail}
        title="Trip Details"
        footer={
          <Button variant="ghost" size="sm" onClick={closeDetail}>
            Close
          </Button>
        }
      >
        {detailTrip && (
          <div className="trip-detail">
            {/* Route visualization — clickable to show map */}
            <button
              className={`trip-detail__route trip-detail__route--clickable${showMap ? " trip-detail__route--active" : ""}`}
              onClick={() => {
                if (showMap && mapInstanceRef.current) {
                  mapInstanceRef.current.remove();
                  mapInstanceRef.current = null;
                }
                setShowMap(!showMap);
              }}
            >
              <div className="trip-detail__route-dots">
                <div className="trip-detail__route-dot trip-detail__route-dot--start" />
                <div className="trip-detail__route-line" />
                <div className="trip-detail__route-dot trip-detail__route-dot--end" />
              </div>
              <div className="trip-detail__route-addrs">
                <span className={`trip-detail__route-addr${!detailTrip.startAddress ? " trip-detail__route-addr--muted" : ""}`}>
                  {detailTrip.startAddress || "Unknown start"}
                </span>
                <span className={`trip-detail__route-addr${!detailTrip.endAddress ? " trip-detail__route-addr--muted" : ""}`}>
                  {detailTrip.endAddress || "Unknown end"}
                </span>
              </div>
              <div className="trip-detail__route-toggle">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {showMap ? (
                    <polyline points="18 15 12 9 6 15" />
                  ) : (
                    <>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </>
                  )}
                </svg>
              </div>
            </button>

            {/* Map container */}
            {showMap && (
              <div className="trip-detail__map-wrap">
                <div ref={mapContainerRef} className="trip-detail__map" />
              </div>
            )}

            {/* Stats strip */}
            <div className="trip-detail__stats">
              <div className="trip-detail__stat">
                <div className="trip-detail__stat-value">
                  {detailTrip.distanceMiles?.toFixed(1) || "0"} mi
                </div>
                <div className="trip-detail__stat-label">Distance</div>
              </div>
              <div className="trip-detail__stat">
                <div className="trip-detail__stat-value">
                  {detailTrip.endedAt && detailTrip.startedAt
                    ? (() => {
                        const secs = Math.floor((new Date(detailTrip.endedAt).getTime() - new Date(detailTrip.startedAt).getTime()) / 1000);
                        const m = Math.floor(secs / 60);
                        return `${m} min`;
                      })()
                    : "--"}
                </div>
                <div className="trip-detail__stat-label">Duration</div>
              </div>
              <div className="trip-detail__stat">
                <Badge variant={detailTrip.classification === "business" ? "business" : detailTrip.classification === "personal" ? "personal" : "warning"}>
                  {detailTrip.classification === "unclassified" ? "Unclassified" : detailTrip.classification}
                </Badge>
                <div className="trip-detail__stat-label">Type</div>
              </div>
            </div>

            {/* Trip Insights */}
            {detailLoading ? (
              <div className="trip-detail__loading">
                <span className="trip-detail__loading-dot">Loading insights</span>
              </div>
            ) : detailTrip.insights ? (
              <div className="trip-detail__insights">
                <div className="trip-detail__insights-header">
                  <div className="trip-detail__insights-icon">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <span className="trip-detail__insights-title">Trip Insights</span>
                </div>

                <div className="trip-detail__insights-grid">
                  <div className="trip-detail__insight">
                    <div className="trip-detail__insight-value">{detailTrip.insights.topSpeedMph}</div>
                    <div className="trip-detail__insight-label">Top mph</div>
                  </div>
                  <div className="trip-detail__insight">
                    <div className="trip-detail__insight-value">{detailTrip.insights.avgMovingSpeedMph}</div>
                    <div className="trip-detail__insight-label">Avg mph</div>
                  </div>
                  <div className="trip-detail__insight">
                    <div className="trip-detail__insight-value">
                      {detailTrip.insights.timeStoppedSecs >= 60
                        ? `${Math.round(detailTrip.insights.timeStoppedSecs / 60)}m`
                        : `${detailTrip.insights.timeStoppedSecs}s`}
                    </div>
                    <div className="trip-detail__insight-label">Stopped</div>
                  </div>
                  <div className="trip-detail__insight">
                    <div className="trip-detail__insight-value">{detailTrip.insights.numberOfStops ?? 0}</div>
                    <div className="trip-detail__insight-label">Stops</div>
                  </div>
                </div>

                <div className="trip-detail__insights-notes">
                  {detailTrip.insights.routeDirectnessNote && (
                    <span className="trip-detail__insights-note">
                      {detailTrip.insights.routeDirectnessNote}
                    </span>
                  )}
                  {detailTrip.insights.longestNonStopMiles > 0.1 && (
                    <span className="trip-detail__insights-note">
                      Longest non-stop: {detailTrip.insights.longestNonStopMiles} mi
                    </span>
                  )}
                  {detailTrip.insights.timeStoppedSecs > 60 && detailTrip.insights.timeMovingSecs > 0 && (
                    <span className="trip-detail__insights-note">
                      {Math.round((detailTrip.insights.timeMovingSecs / (detailTrip.insights.timeMovingSecs + detailTrip.insights.timeStoppedSecs)) * 100)}% of your trip was moving
                    </span>
                  )}
                </div>

                {(detailTrip.insights.speedFunFact || detailTrip.insights.distanceFunFact) && (
                  <div className="trip-detail__fun-fact">
                    <span className="trip-detail__fun-fact-icon">&#9889;</span>
                    <span>{detailTrip.insights.speedFunFact || detailTrip.insights.distanceFunFact}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="trip-detail__no-insights">
                No GPS data recorded — insights are available for tracked trips
              </div>
            )}

            {/* Meta info */}
            <div className="trip-detail__meta">
              <span className="trip-detail__meta-item">
                <span className="trip-detail__meta-label">Started</span>
                {new Date(detailTrip.startedAt).toLocaleString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
              {detailTrip.endedAt && (
                <span className="trip-detail__meta-item">
                  <span className="trip-detail__meta-label">Ended</span>
                  {new Date(detailTrip.endedAt).toLocaleString("en-GB", {
                    hour: "2-digit", minute: "2-digit",
                  })}
                </span>
              )}
              {detailTrip.platformTag && (
                <span className="trip-detail__meta-item">
                  <Badge variant="source">{detailTrip.platformTag}</Badge>
                </span>
              )}
              {(detailTrip as any).businessPurpose && (
                <span className="trip-detail__meta-item">
                  <Badge variant="primary">{(detailTrip as any).businessPurpose.replace(/_/g, " ")}</Badge>
                </span>
              )}
              {detailTrip.notes && (
                <span className="trip-detail__meta-item" style={{ flexBasis: "100%" }}>
                  <span className="trip-detail__meta-label">Notes:</span>
                  {detailTrip.notes}
                </span>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Merge Modal */}
      <Modal
        open={showMerge}
        onClose={() => setShowMerge(false)}
        title={`Merge ${selectedIds.size} Trips`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowMerge(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleMerge} disabled={mergeLoading}>
              {mergeLoading ? "Merging..." : "Merge Trips"}
            </Button>
          </>
        }
      >
        {(() => {
          const selected = trips
            .filter((t) => selectedIds.has(t.id))
            .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
          const first = selected[0];
          const last = selected[selected.length - 1];
          const totalMiles = selected.reduce((sum, t) => sum + (t.distanceMiles ?? 0), 0);
          if (!first || !last) return null;
          return (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "0.875rem",
              marginBottom: "1.25rem",
              fontSize: "0.8125rem",
              color: "var(--text-secondary, #9ca3af)",
              lineHeight: 1.7,
            }}>
              <div><strong style={{ color: "var(--emerald-500)" }}>Start:</strong> {first.startAddress || "Unknown"}</div>
              <div><strong style={{ color: "var(--dash-red)" }}>End:</strong> {last.endAddress || "Unknown"}</div>
              <div style={{ marginTop: 6, display: "flex", gap: "1.5rem" }}>
                <span><strong>{totalMiles.toFixed(1)}</strong> mi total</span>
                <span>
                  {new Date(first.startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  {" — "}
                  {last.endedAt ? new Date(last.endedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "ongoing"}
                </span>
              </div>
            </div>
          );
        })()}

        <Select
          id="mergeClass"
          label="Classification"
          value={mergeClass}
          onChange={(e) => setMergeClass(e.target.value)}
          options={[
            { value: "business", label: "Business" },
            { value: "personal", label: "Personal" },
          ]}
        />
        {mergeClass === "business" && (
          <Select
            id="mergePlatform"
            label="Platform (optional)"
            value={mergePlatform}
            onChange={(e) => setMergePlatform(e.target.value)}
            options={[
              { value: "", label: "None" },
              ...GIG_PLATFORMS.map((p) => ({ value: p.value, label: p.label })),
            ]}
          />
        )}
      </Modal>
    </>
  );
}
