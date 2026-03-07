"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../../../lib/api";
import { PageHeader } from "../../../components/dashboard/PageHeader";
import { Badge } from "../../../components/ui/Badge";
import { Pagination } from "../../../components/ui/Pagination";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingSkeleton } from "../../../components/ui/LoadingSkeleton";

const PAGE_SIZE = 20;

interface Shift {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  vehicle?: { make: string; model: string } | null;
  tripCount?: number;
  tripMiles?: number;
}

interface ShiftsResponse {
  data: Shift[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "Active";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatMiles(miles: number): string {
  return miles.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "completed" | "active">("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (filter !== "all") params.set("status", filter);
      const res = await api.get<ShiftsResponse>(`/shifts/?${params}`);
      setShifts(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFilterChange = (f: "all" | "completed" | "active") => {
    setFilter(f);
    setPage(1);
  };

  // Stats from current page data
  const completedShifts = shifts.filter((s) => s.status === "completed");
  const totalDurationMs = completedShifts.reduce((sum, s) => {
    if (!s.endedAt) return sum;
    return sum + (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime());
  }, 0);
  const avgDurationMs = completedShifts.length > 0 ? totalDurationMs / completedShifts.length : 0;
  const avgHours = Math.floor(avgDurationMs / 3600000);
  const avgMins = Math.floor((avgDurationMs % 3600000) / 60000);
  const totalShiftTrips = shifts.reduce((sum, s) => sum + (s.tripCount ?? 0), 0);
  const totalShiftMiles = shifts.reduce((sum, s) => sum + (s.tripMiles ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Shifts"
        subtitle={`${total} shift${total !== 1 ? "s" : ""} recorded`}
      />

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: "var(--dash-gap)" }}>
        <div className="stat-card">
          <div className="stat-card__value">{total}</div>
          <div className="stat-card__label">Total Shifts</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{avgHours > 0 ? `${avgHours}h ${avgMins}m` : avgMins > 0 ? `${avgMins}m` : "—"}</div>
          <div className="stat-card__label">Avg Duration</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{totalShiftTrips}</div>
          <div className="stat-card__label">Page Trips</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value stat-card__value--amber">{formatMiles(totalShiftMiles)} mi</div>
          <div className="stat-card__label">Page Miles</div>
        </div>
      </div>

      {/* Filter */}
      <div className="filter-chips" style={{ marginBottom: "1.25rem" }}>
        {(["all", "completed", "active"] as const).map((f) => (
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
      ) : shifts.length === 0 ? (
        <EmptyState
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          }
          title="No shifts yet"
          description="Start a shift from the mobile app to track your work sessions."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Trips</th>
                  <th>Miles</th>
                  <th className="hide-mobile">Vehicle</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((shift) => (
                  <tr key={shift.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(shift.startedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {new Date(shift.startedAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {shift.endedAt && (
                        <>
                          {" – "}
                          {new Date(shift.endedAt).toLocaleTimeString("en-GB", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatDuration(shift.startedAt, shift.endedAt)}</td>
                    <td>{shift.tripCount ?? 0}</td>
                    <td>{formatMiles(shift.tripMiles ?? 0)} mi</td>
                    <td className="hide-mobile">
                      {shift.vehicle ? (
                        `${shift.vehicle.make} ${shift.vehicle.model}`
                      ) : (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <Badge variant={shift.status === "active" ? "success" : "source"}>
                        {shift.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </>
  );
}
