"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { GIG_PLATFORMS } from "@mileclear/shared";

interface DetailTrip extends Trip {
  insights?: TripInsights | null;
  coordinates?: TripCoordinate[];
}

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
                <Badge variant={detailTrip.classification === "business" ? "business" : "personal"}>
                  {detailTrip.classification}
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
                    <div className="trip-detail__insight-value">{detailTrip.insights.routeEfficiency}x</div>
                    <div className="trip-detail__insight-label">Route</div>
                  </div>
                </div>

                {(detailTrip.insights.longestNonStopMiles > 0.1 || detailTrip.insights.timeStoppedSecs > 60) && (
                  <div className="trip-detail__insights-notes">
                    {detailTrip.insights.longestNonStopMiles > 0.1 && (
                      <span className="trip-detail__insights-note">
                        Longest non-stop stretch: {detailTrip.insights.longestNonStopMiles} mi
                      </span>
                    )}
                    {detailTrip.insights.timeStoppedSecs > 60 && detailTrip.insights.timeMovingSecs > 0 && (
                      <span className="trip-detail__insights-note">
                        {Math.round((detailTrip.insights.timeMovingSecs / (detailTrip.insights.timeMovingSecs + detailTrip.insights.timeStoppedSecs)) * 100)}% of your trip was spent moving
                      </span>
                    )}
                  </div>
                )}

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
    </>
  );
}
