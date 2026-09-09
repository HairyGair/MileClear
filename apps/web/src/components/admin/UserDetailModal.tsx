"use client";

// The admin user detail modal, moved out of the old admin page (Sep 2026).
// Used by the Users section and by any page that links to a user.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { addDarkBasemap } from "@/lib/basemap";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import {
  AdminDeletedTrip,
  AdminTripPath,
  AdminUserDetail,
  AdminUserEvent,
  buildDiagnosticDumpText,
  DiagnosticDump,
  downloadTextFile,
  formatPence,
  platformLabel,
  timeAgo,
  TripMapRange,
} from "@/components/admin/legacy";

// ---------------------------------------------------------------------------
// User Detail Modal
// ---------------------------------------------------------------------------

export function UserDetailModal({
  userId,
  open,
  onClose,
}: {
  userId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiagnosticDump | null>(null);
  const [events, setEvents] = useState<AdminUserEvent[] | null>(null);
  const [showAllEvents, setShowAllEvents] = useState(false);
  // Recently deleted trips (archive) + restore state
  const [deletedTrips, setDeletedTrips] = useState<AdminDeletedTrip[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);
  // Trip filter for the diagnostic events panel - when set, the events
  // list is scoped to that trip's time window (±60s). Mirrors the
  // mobile Drive Detection screen pattern.
  const [tripFilter, setTripFilter] = useState<{
    id: string;
    started_at: string;
    ended_at: string | null;
  } | null>(null);

  // Push notification to specific user
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushAction, setPushAction] = useState("open_app");
  const [pushSending, setPushSending] = useState(false);
  const [pushResult, setPushResult] = useState<string | null>(null);

  // Remote engine switch (set_native_engine silent push)
  const [engineSending, setEngineSending] = useState(false);
  const [engineResult, setEngineResult] = useState<string | null>(null);

  // Notes editor
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesMessage, setNotesMessage] = useState<string | null>(null);

  // Trip map
  const [tripPaths, setTripPaths] = useState<AdminTripPath[] | null>(null);
  const [tripMapRange, setTripMapRange] = useState<TripMapRange>("last20");
  const [tripMapLoading, setTripMapLoading] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // Add trip form
  const [tripOpen, setTripOpen] = useState(false);
  const [tripVehicleId, setTripVehicleId] = useState("");
  const [tripStartedAt, setTripStartedAt] = useState("");
  const [tripEndedAt, setTripEndedAt] = useState("");
  const [tripStartLat, setTripStartLat] = useState("");
  const [tripStartLng, setTripStartLng] = useState("");
  const [tripEndLat, setTripEndLat] = useState("");
  const [tripEndLng, setTripEndLng] = useState("");
  const [tripStartAddress, setTripStartAddress] = useState("");
  const [tripEndAddress, setTripEndAddress] = useState("");
  const [tripDistance, setTripDistance] = useState("");
  const [tripClassification, setTripClassification] = useState<"business" | "personal" | "unclassified">("unclassified");
  const [tripPlatform, setTripPlatform] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [tripSaving, setTripSaving] = useState(false);
  const [tripResult, setTripResult] = useState<string | null>(null);

  const resetTripForm = useCallback(() => {
    setTripVehicleId("");
    setTripStartedAt("");
    setTripEndedAt("");
    setTripStartLat("");
    setTripStartLng("");
    setTripEndLat("");
    setTripEndLng("");
    setTripStartAddress("");
    setTripEndAddress("");
    setTripDistance("");
    setTripClassification("unclassified");
    setTripPlatform("");
    setTripNotes("");
    setTripResult(null);
  }, []);

  useEffect(() => {
    if (!userId || !open) return;
    setLoading(true);
    setError(null);
    setUser(null);
    setDiag(null);
    setPushTitle("");
    setPushBody("");
    setPushAction("open_app");
    setPushResult(null);
    setEngineResult(null);
    setNotesDraft("");
    setNotesMessage(null);
    setTripOpen(false);
    setTripPaths(null);
    resetTripForm();
    setEvents(null);
    setShowAllEvents(false);
    setDeletedTrips(null);
    setRestoringId(null);
    setRestoreResult(null);
    Promise.all([
      api.get<{ data: AdminUserDetail }>(`/admin/users/${userId}`),
      api.get<{ data: DiagnosticDump | null }>(`/admin/users/${userId}/diagnostics`).catch(() => ({ data: null })),
      api.get<{ data: AdminUserEvent[] }>(`/admin/users/${userId}/events`).catch(() => ({ data: [] as AdminUserEvent[] })),
      api.get<{ data: AdminDeletedTrip[] }>(`/admin/users/${userId}/deleted-trips`).catch(() => ({ data: [] as AdminDeletedTrip[] })),
    ])
      .then(([userRes, diagRes, eventsRes, deletedRes]) => {
        setUser(userRes.data);
        setDiag(diagRes.data);
        setEvents(eventsRes.data);
        setDeletedTrips(deletedRes.data);
        setNotesDraft(userRes.data.notes ?? "");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId, open, resetTripForm]);

  // Fetch trip paths whenever the modal opens or the range changes
  useEffect(() => {
    if (!userId || !open) return;
    setTripMapLoading(true);
    const params = new URLSearchParams();
    if (tripMapRange === "last20") params.set("limit", "20");
    else if (tripMapRange === "last50") params.set("limit", "50");
    else if (tripMapRange === "last7d") { params.set("days", "7"); params.set("limit", "100"); }
    api
      .get<{ data: AdminTripPath[] }>(`/admin/users/${userId}/trip-paths?${params}`)
      .then((res) => setTripPaths(res.data))
      .catch(() => setTripPaths([]))
      .finally(() => setTripMapLoading(false));
  }, [userId, open, tripMapRange]);

  // Render the Leaflet map when trip paths + container are ready
  useEffect(() => {
    if (!open || !tripPaths || tripPaths.length === 0 || !mapContainerRef.current) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    const renderMap = () => {
      const L = (window as any).L;
      if (!L || !mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: false,
      });
      addDarkBasemap(L, map);

      const colours = [
        "#fbbf24", "#60a5fa", "#34d399", "#f472b6", "#a78bfa",
        "#fb923c", "#2dd4bf", "#f87171", "#c084fc", "#facc15",
      ];

      const allLatlngs: [number, number][] = [];
      tripPaths!.forEach((t, i) => {
        const colour = colours[i % colours.length];
        if (t.coordinates.length >= 2) {
          const latlngs = t.coordinates.map((c) => [c.lat, c.lng] as [number, number]);
          L.polyline(latlngs, { color: colour, weight: 3, opacity: 0.8, smoothFactor: 1.5 }).addTo(map);
          allLatlngs.push(...latlngs);
        } else if (t.endLat !== null && t.endLng !== null) {
          const start: [number, number] = [t.startLat, t.startLng];
          const end: [number, number] = [t.endLat, t.endLng];
          L.polyline([start, end], {
            color: colour,
            weight: 2,
            opacity: 0.6,
            dashArray: "6, 8",
          }).addTo(map);
          allLatlngs.push(start, end);
        }
      });

      if (allLatlngs.length > 0) {
        map.fitBounds(L.latLngBounds(allLatlngs), { padding: [30, 30] });
      } else {
        map.setView([54.5, -2.5], 6);
      }

      mapInstanceRef.current = map;
    };

    if ((window as any).L) {
      renderMap();
      return;
    }

    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = renderMap;
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [open, tripPaths]);

  const handleSaveNotes = async () => {
    if (!userId) return;
    setNotesSaving(true);
    setNotesMessage(null);
    try {
      const res = await api.patch<{ data: { id: string; notes: string | null } }>(
        `/admin/users/${userId}/notes`,
        { notes: notesDraft.trim() || null },
      );
      if (user) setUser({ ...user, notes: res.data.notes });
      setNotesMessage("Saved");
      setTimeout(() => setNotesMessage(null), 2000);
    } catch (err: any) {
      setNotesMessage(`Error: ${err.message}`);
    } finally {
      setNotesSaving(false);
    }
  };

  const handleCreateTrip = async () => {
    if (!userId) return;
    if (!tripVehicleId || !tripStartedAt || !tripEndedAt || !tripStartLat || !tripStartLng || !tripEndLat || !tripEndLng) {
      setTripResult("Error: vehicle, start/end times, and start/end coords are required");
      return;
    }
    setTripSaving(true);
    setTripResult(null);
    try {
      const body: Record<string, unknown> = {
        vehicleId: tripVehicleId,
        startLat: Number(tripStartLat),
        startLng: Number(tripStartLng),
        endLat: Number(tripEndLat),
        endLng: Number(tripEndLng),
        startedAt: new Date(tripStartedAt).toISOString(),
        endedAt: new Date(tripEndedAt).toISOString(),
        classification: tripClassification,
      };
      if (tripStartAddress.trim()) body.startAddress = tripStartAddress.trim();
      if (tripEndAddress.trim()) body.endAddress = tripEndAddress.trim();
      if (tripDistance.trim()) body.distanceMiles = Number(tripDistance);
      if (tripPlatform.trim()) body.platformTag = tripPlatform.trim();
      if (tripNotes.trim()) body.notes = tripNotes.trim();

      await api.post<{ data: unknown }>(`/admin/users/${userId}/trips`, body);
      setTripResult("Trip created");
      resetTripForm();
      setTripOpen(false);
      // Refresh user detail to show the new trip in Recent Trips
      const refreshed = await api.get<{ data: AdminUserDetail }>(`/admin/users/${userId}`);
      setUser(refreshed.data);
    } catch (err: any) {
      setTripResult(`Error: ${err.message}`);
    } finally {
      setTripSaving(false);
    }
  };

  const handleRestoreDeletedTrip = async (deletedTripId: string) => {
    if (!userId || restoringId) return;
    setRestoringId(deletedTripId);
    setRestoreResult(null);
    try {
      const res = await api.post<{ data: { tripId: string; coordinateCount: number } }>(
        `/admin/deleted-trips/${deletedTripId}/restore`,
        {}
      );
      setRestoreResult(`Restored as trip ${res.data.tripId.slice(0, 8)} (${res.data.coordinateCount} route points)`);
      // Refresh user detail (Recent Trips) and the archive list
      const [refreshed, deletedRes] = await Promise.all([
        api.get<{ data: AdminUserDetail }>(`/admin/users/${userId}`),
        api.get<{ data: AdminDeletedTrip[] }>(`/admin/users/${userId}/deleted-trips`).catch(() => ({ data: [] as AdminDeletedTrip[] })),
      ]);
      setUser(refreshed.data);
      setDeletedTrips(deletedRes.data);
    } catch (err: any) {
      setRestoreResult(`Error: ${err.message}`);
    } finally {
      setRestoringId(null);
    }
  };

  const handleSendPush = async (dryRun: boolean) => {
    if (!pushTitle.trim() || !pushBody.trim() || !userId) return;
    setPushSending(true);
    setPushResult(null);
    try {
      const res = await api.post<{ data: { sent: number; dryRun: boolean } }>("/admin/send-push", {
        audience: "specific",
        userId,
        title: pushTitle.trim(),
        body: pushBody.trim(),
        action: pushAction,
        dryRun,
      });
      setPushResult(dryRun ? `Dry run: would send to ${res.data.sent} device(s)` : `Sent to ${res.data.sent} device(s)`);
      if (!dryRun) { setPushTitle(""); setPushBody(""); }
    } catch (err: any) {
      setPushResult(`Error: ${err.message}`);
    } finally {
      setPushSending(false);
    }
  };

  const handleEngineSwitch = async (enabled: boolean) => {
    if (!userId) return;
    setEngineSending(true);
    setEngineResult(null);
    try {
      const res = await api.post<{ data: { sent: boolean; detail: string } }>(
        `/admin/users/${userId}/engine`,
        { enabled }
      );
      setEngineResult(res.data.detail);
    } catch (err: any) {
      setEngineResult(`Error: ${err.message}`);
    } finally {
      setEngineSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="User Details" large>
      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <LoadingSkeleton variant="text" count={4} />
        </div>
      )}

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}

      {user && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Identity */}
          <div className="settings-section">
            <h4 className="settings-section__title">Identity</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem 1.5rem",
                fontSize: "0.875rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Email</span>
                <p style={{ marginTop: 2, fontWeight: 500 }}>{user.email}</p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Name</span>
                <p style={{ marginTop: 2 }}>{user.displayName || "-"}</p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Joined</span>
                <p style={{ marginTop: 2 }}>
                  {new Date(user.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Status</span>
                <div style={{ marginTop: 4, display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                  {user.isPremium && <Badge variant="pro">PRO</Badge>}
                  {user.isAdmin && <Badge variant="primary">Admin</Badge>}
                  {!user.isPremium && !user.isAdmin && <Badge variant="source">Free</Badge>}
                  {user.emailVerified && <Badge variant="success">Verified</Badge>}
                  {!user.emailVerified && <Badge variant="danger">Unverified</Badge>}
                  {user.unreachable && (
                    <span title="Placeholder Apple email + no push token - cannot be contacted by any channel">
                      <Badge variant="danger">Unreachable</Badge>
                    </span>
                  )}
                  {user.lifecycle?.churnRisk && (
                    <span title="Had a trip habit (2+/week) but the last fortnight dropped below one prior week's average">
                      <Badge variant="danger">Churn risk</Badge>
                    </span>
                  )}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Reachability</span>
                <div style={{ marginTop: 4, display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                  <Badge variant={user.hasPushToken ? "success" : "source"}>
                    {user.hasPushToken ? "Push ✓" : "No push"}
                  </Badge>
                  <span
                    title={
                      user.marketingEmailsEnabled === false
                        ? `Opted out ${user.marketingEmailsDisabledAt ? new Date(user.marketingEmailsDisabledAt).toLocaleDateString("en-GB") : ""}${user.marketingEmailsDisabledSource ? ` via ${user.marketingEmailsDisabledSource}` : ""}`
                        : "Receives marketing emails (PECR soft opt-in)"
                    }
                  >
                    <Badge variant={user.marketingEmailsEnabled === false ? "danger" : "success"}>
                      {user.marketingEmailsEnabled === false ? "Marketing off" : "Marketing ✓"}
                    </Badge>
                  </span>
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Segment</span>
                <p style={{ marginTop: 2, fontSize: "0.8125rem" }}>
                  {[user.workType, user.dashboardMode && `${user.dashboardMode} mode`, user.userIntent]
                    .filter(Boolean)
                    .join(" · ") || "-"}
                </p>
              </div>
            </div>
          </div>

          {/* OAuth providers */}
          {(user.appleId || user.googleId) && (
            <div className="settings-section">
              <h4 className="settings-section__title">OAuth Providers</h4>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {user.appleId && <Badge variant="source">Apple</Badge>}
                {user.googleId && <Badge variant="source">Google</Badge>}
              </div>
            </div>
          )}

          {/* Monetisation */}
          <div className="settings-section">
            <h4 className="settings-section__title">Monetisation</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem 1.5rem",
                fontSize: "0.875rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Subscription</span>
                <div style={{ marginTop: 4, display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
                  {user.subscriptionPlatform === "apple" && <Badge variant="source">Apple IAP</Badge>}
                  {user.subscriptionPlatform === "stripe" && <Badge variant="source">Stripe</Badge>}
                  {user.subscriptionEnvironment === "sandbox" && (
                    <span title="Seen on a sandbox webhook: TestFlight or App Review. Grants Pro, never revenue."><Badge variant="warning">Sandbox</Badge></span>
                  )}
                  {user.subscriptionPeriod && user.subscriptionEnvironment !== "sandbox" && (
                    <span title={user.subscriptionPeriodInferred ? "Inferred from expiry date (product id not stamped yet)" : "From the stamped product id"}>
                      <Badge variant="source">{user.subscriptionPeriod === "annual" ? "Annual" : "Monthly"}{user.subscriptionPeriodInferred ? " (inferred)" : ""}</Badge>
                    </span>
                  )}
                  {(!user.subscriptionPlatform || user.subscriptionPlatform === "none") && (
                    <Badge variant="source">{user.isPremium ? "Comp (admin grant)" : "None"}</Badge>
                  )}
                </div>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Premium expires</span>
                <p style={{ marginTop: 2 }}>
                  {user.premiumExpiresAt
                    ? new Date(user.premiumExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : "-"}
                </p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Trial used</span>
                <p style={{ marginTop: 2 }}>
                  {user.trialUsedAt
                    ? new Date(user.trialUsedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : "No (trial-eligible)"}
                </p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Referral Pro until</span>
                <p style={{ marginTop: 2 }}>
                  {user.referralProUntil
                    ? new Date(user.referralProUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                    : "-"}
                </p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Referrals</span>
                <p style={{ marginTop: 2 }}>
                  {user._count.referralsMade ?? 0} made
                  {user.referralCode ? ` · code ${user.referralCode}` : ""}
                  {user.referredByCode ? ` · joined via ${user.referredByCode}` : ""}
                </p>
              </div>
            </div>
            {(user.stripeCustomerId || user.stripeSubscriptionId) && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                  fontSize: "0.8125rem",
                  fontFamily: "monospace",
                  color: "var(--text-secondary)",
                  marginTop: "0.5rem",
                }}
              >
                {user.stripeCustomerId && <span>Customer: {user.stripeCustomerId}</span>}
                {user.stripeSubscriptionId && (
                  <span>Subscription: {user.stripeSubscriptionId}</span>
                )}
              </div>
            )}
          </div>

          {/* Activity */}
          <div className="settings-section">
            <h4 className="settings-section__title">Activity</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem 1.5rem",
                fontSize: "0.875rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Last trip</span>
                <p style={{ marginTop: 2 }} title={user.lastTripAt ? new Date(user.lastTripAt).toLocaleString() : ""}>
                  {user.lastTripAt ? `${timeAgo(user.lastTripAt)} (${new Date(user.lastTripAt).toLocaleDateString("en-GB")})` : "-"}
                </p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Last login</span>
                <p style={{ marginTop: 2 }} title={user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : ""}>
                  {user.lastLoginAt ? `${timeAgo(user.lastLoginAt)} (${new Date(user.lastLoginAt).toLocaleDateString("en-GB")})` : "-"}
                </p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Platform</span>
                <p style={{ marginTop: 2 }}>
                  {platformLabel(user.platforms)}
                  {user.platforms && user.platforms.length > 0 ? ` (${user.platforms.join(", ")})` : ""}
                </p>
              </div>
              <div>
                <span style={{ color: "var(--text-secondary)" }}>Signed up</span>
                <p style={{ marginTop: 2 }}>
                  {user.signupPlatform ? user.signupPlatform : "-"}
                  {user.signupLocation ? ` · ${user.signupLocation}` : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="settings-section">
            <h4 className="settings-section__title">Stats</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.75rem",
              }}
            >
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <p className="stat-card__label">Miles</p>
                <p className="stat-card__value" style={{ fontSize: "1.25rem" }}>
                  {user.totalMiles.toFixed(1)}
                </p>
              </div>
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <p className="stat-card__label">Trips</p>
                <p className="stat-card__value" style={{ fontSize: "1.25rem" }}>
                  {user._count.trips}
                </p>
              </div>
              <div className="stat-card" style={{ padding: "0.75rem" }}>
                <p className="stat-card__label">Earnings</p>
                <p
                  className="stat-card__value stat-card__value--emerald"
                  style={{ fontSize: "1.25rem" }}
                >
                  {formatPence(user.totalEarningsPence)}
                </p>
              </div>
            </div>
          </div>

          {/* Feature Adoption */}
          <div className="settings-section">
            <h4 className="settings-section__title">Feature Adoption</h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: "0.375rem",
              }}
            >
              {([
                { label: "Shifts", count: user._count.shifts },
                { label: "Fuel logs", count: user._count.fuelLogs },
                { label: "Earnings", count: user._count.earnings },
                { label: "Expenses", count: user._count.expenses },
                { label: "Invoices", count: user._count.invoices },
                { label: "Saved locations", count: user._count.savedLocations },
                { label: "Achievements", count: user._count.achievements },
                { label: "Feedback", count: user._count.feedback },
                { label: "Open Banking", on: user.integrations?.openBanking },
                { label: "HMRC MTD", on: user.integrations?.hmrc },
                { label: "QuickBooks", on: user.integrations?.quickbooks },
                { label: "Discord", on: user.integrations?.discord },
                { label: "Accountant share", on: user.integrations?.accountantSharing },
              ] as Array<{ label: string; count?: number; on?: boolean }>).map((f) => {
                const used = f.count !== undefined ? f.count > 0 : !!f.on;
                return (
                  <div
                    key={f.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.375rem",
                      padding: "0.375rem 0.5rem",
                      borderRadius: 6,
                      fontSize: "0.75rem",
                      border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                      background: used ? "rgba(16,185,129,0.08)" : "transparent",
                      color: used ? "var(--text-primary)" : "var(--text-tertiary)",
                    }}
                  >
                    <span>{f.label}</span>
                    <span style={{ fontWeight: 600 }}>
                      {f.count !== undefined ? (f.count > 0 ? f.count : "-") : f.on ? "✓" : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lifecycle */}
          {user.lifecycle && (
            <div className="settings-section">
              <h4 className="settings-section__title">Lifecycle</h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem 1.5rem",
                  fontSize: "0.875rem",
                  marginBottom: "0.75rem",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-secondary)" }}>First trip</span>
                  <p style={{ marginTop: 2 }}>
                    {user.lifecycle.firstTripAt
                      ? `${new Date(user.lifecycle.firstTripAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} (${Math.max(0, Math.round((new Date(user.lifecycle.firstTripAt).getTime() - new Date(user.createdAt).getTime()) / 86_400_000))}d after signup)`
                      : "Never"}
                  </p>
                </div>
                <div>
                  <span style={{ color: "var(--text-secondary)" }}>Last 8 weeks</span>
                  <p style={{ marginTop: 2 }}>
                    {user.lifecycle.weeklyTrips.reduce((a, b) => a + b, 0)} trips
                    {user.lifecycle.churnRisk ? " · declining" : ""}
                  </p>
                </div>
              </div>
              {/* Weekly trips sparkline: single series, oldest week → current */}
              {(() => {
                const weeks = user.lifecycle!.weeklyTrips;
                const max = Math.max(1, ...weeks);
                const barW = 28;
                const gap = 2;
                const h = 56;
                const w = weeks.length * (barW + gap) - gap;
                return (
                  <div>
                    <svg
                      width={w}
                      height={h}
                      viewBox={`0 0 ${w} ${h}`}
                      role="img"
                      aria-label={`Trips per week over the last 8 weeks: ${weeks.join(", ")}`}
                      style={{ display: "block" }}
                    >
                      {weeks.map((count, i) => {
                        const barH = count === 0 ? 2 : Math.max(3, (count / max) * (h - 14));
                        return (
                          <g key={i}>
                            <rect
                              x={i * (barW + gap)}
                              y={h - barH}
                              width={barW}
                              height={barH}
                              rx={2}
                              fill={count === 0 ? "rgba(255,255,255,0.12)" : "var(--amber-500, #f59e0b)"}
                            >
                              <title>{`${count} trip${count === 1 ? "" : "s"}, ${i === 7 ? "this week" : `${7 - i} week${7 - i === 1 ? "" : "s"} ago`}`}</title>
                            </rect>
                            {i === 7 && count > 0 && (
                              <text
                                x={i * (barW + gap) + barW / 2}
                                y={h - barH - 3}
                                textAnchor="middle"
                                fontSize={10}
                                fill="var(--text-secondary, #8494a7)"
                              >
                                {count}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                    <div style={{ display: "flex", justifyContent: "space-between", width: w, fontSize: "0.6875rem", color: "var(--text-tertiary)", marginTop: 2 }}>
                      <span>8 wks ago</span>
                      <span>this week</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Trip Map */}
          <div className="settings-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", gap: "0.5rem", flexWrap: "wrap" }}>
              <h4 className="settings-section__title" style={{ margin: 0 }}>Trip Map</h4>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                {([
                  { v: "last20", label: "Last 20" },
                  { v: "last50", label: "Last 50" },
                  { v: "last7d", label: "Last 7 days" },
                ] as Array<{ v: TripMapRange; label: string }>).map((opt) => (
                  <button
                    key={opt.v}
                    className={`filter-chip ${tripMapRange === opt.v ? "filter-chip--active" : ""}`}
                    onClick={() => setTripMapRange(opt.v)}
                    type="button"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {tripMapLoading ? (
              <LoadingSkeleton variant="card" style={{ height: 320 }} />
            ) : tripPaths && tripPaths.length > 0 ? (
              <>
                <div
                  ref={mapContainerRef}
                  style={{
                    height: 320,
                    width: "100%",
                    borderRadius: 8,
                    overflow: "hidden",
                    border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                  }}
                />
                <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", margin: "0.5rem 0 0" }}>
                  {tripPaths.length} trip{tripPaths.length !== 1 ? "s" : ""} plotted. Each colour is a different trip.
                </p>
              </>
            ) : (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                No trips in the selected range.
              </p>
            )}
          </div>

          {/* Admin Notes */}
          <div className="settings-section">
            <h4 className="settings-section__title">Admin Notes</h4>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Private notes about this user (support history, context, etc.)"
              rows={4}
              maxLength={10000}
              style={{
                width: "100%",
                padding: "0.625rem 0.75rem",
                background: "var(--bg-elevated, rgba(255,255,255,0.03))",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                borderRadius: "6px",
                color: "var(--text-primary, #fff)",
                fontSize: "0.8125rem",
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveNotes}
                disabled={notesSaving || notesDraft === (user.notes ?? "")}
              >
                {notesSaving ? "Saving..." : "Save notes"}
              </Button>
              {notesMessage && (
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: notesMessage.startsWith("Error") ? "var(--dash-red)" : "var(--emerald-400)",
                  }}
                >
                  {notesMessage}
                </span>
              )}
            </div>
          </div>

          {/* Add Trip (restore missing trip) */}
          <div className="settings-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <h4 className="settings-section__title" style={{ margin: 0 }}>Add Trip</h4>
              <Button variant="ghost" size="sm" onClick={() => setTripOpen((v) => !v)}>
                {tripOpen ? "Hide" : "Show form"}
              </Button>
            </div>
            {tripOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {user.vehicles.length === 0 ? (
                  <p style={{ fontSize: "0.8125rem", color: "var(--dash-red)", margin: 0 }}>
                    This user has no vehicles. Cannot create a trip until they add one.
                  </p>
                ) : (
                  <>
                    <Select
                      id="trip-vehicle"
                      value={tripVehicleId}
                      onChange={(e) => setTripVehicleId(e.target.value)}
                      aria-label="Vehicle"
                      placeholder="Select vehicle..."
                      options={user.vehicles.map((v) => ({
                        value: v.id,
                        label: `${v.make} ${v.model} (${v.vehicleType}, ${v.fuelType})`,
                      }))}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <Input
                        id="trip-started-at"
                        type="datetime-local"
                        value={tripStartedAt}
                        onChange={(e) => setTripStartedAt(e.target.value)}
                        placeholder="Started at"
                      />
                      <Input
                        id="trip-ended-at"
                        type="datetime-local"
                        value={tripEndedAt}
                        onChange={(e) => setTripEndedAt(e.target.value)}
                        placeholder="Ended at"
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <Input
                        id="trip-start-lat"
                        type="number"
                        value={tripStartLat}
                        onChange={(e) => setTripStartLat(e.target.value)}
                        placeholder="Start lat"
                      />
                      <Input
                        id="trip-start-lng"
                        type="number"
                        value={tripStartLng}
                        onChange={(e) => setTripStartLng(e.target.value)}
                        placeholder="Start lng"
                      />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <Input
                        id="trip-end-lat"
                        type="number"
                        value={tripEndLat}
                        onChange={(e) => setTripEndLat(e.target.value)}
                        placeholder="End lat"
                      />
                      <Input
                        id="trip-end-lng"
                        type="number"
                        value={tripEndLng}
                        onChange={(e) => setTripEndLng(e.target.value)}
                        placeholder="End lng"
                      />
                    </div>
                    <Input
                      id="trip-start-address"
                      value={tripStartAddress}
                      onChange={(e) => setTripStartAddress(e.target.value)}
                      placeholder="Start address (optional)"
                    />
                    <Input
                      id="trip-end-address"
                      value={tripEndAddress}
                      onChange={(e) => setTripEndAddress(e.target.value)}
                      placeholder="End address (optional)"
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                      <Input
                        id="trip-distance"
                        type="number"
                        value={tripDistance}
                        onChange={(e) => setTripDistance(e.target.value)}
                        placeholder="Distance (mi, optional)"
                      />
                      <Select
                        id="trip-classification"
                        value={tripClassification}
                        onChange={(e) => setTripClassification(e.target.value as "business" | "personal" | "unclassified")}
                        aria-label="Classification"
                        options={[
                          { value: "unclassified", label: "Unclassified" },
                          { value: "business", label: "Business" },
                          { value: "personal", label: "Personal" },
                        ]}
                      />
                    </div>
                    <Input
                      id="trip-platform"
                      value={tripPlatform}
                      onChange={(e) => setTripPlatform(e.target.value)}
                      placeholder="Platform tag (e.g. uber, deliveroo) - optional"
                    />
                    <Input
                      id="trip-notes"
                      value={tripNotes}
                      onChange={(e) => setTripNotes(e.target.value)}
                      placeholder="Trip notes (optional)"
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleCreateTrip}
                        disabled={tripSaving}
                      >
                        {tripSaving ? "Creating..." : "Create trip"}
                      </Button>
                      {tripResult && (
                        <span
                          style={{
                            fontSize: "0.8125rem",
                            color: tripResult.startsWith("Error") ? "var(--dash-red)" : "var(--emerald-400)",
                          }}
                        >
                          {tripResult}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Vehicles */}
          {user.vehicles.length > 0 && (
            <div className="settings-section">
              <h4 className="settings-section__title">
                Vehicles ({user.vehicles.length})
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                {user.vehicles.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-secondary)",
                      padding: "0.375rem 0.5rem",
                      background: "var(--bg-secondary)",
                      borderRadius: 6,
                    }}
                  >
                    {v.make} {v.model} ({v.fuelType})
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Trips */}
          {user.trips.length > 0 && (
            <div className="settings-section">
              <h4 className="settings-section__title">Recent Trips</h4>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Distance</th>
                      <th>Type</th>
                      <th>Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.trips.map((trip) => (
                      <tr key={trip.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                          {new Date(trip.startedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "2-digit",
                          })}
                        </td>
                        <td style={{ fontSize: "0.8125rem" }}>
                          {trip.distanceMiles.toFixed(1)} mi
                        </td>
                        <td>
                          <Badge
                            variant={trip.classification === "business" ? "business" : trip.classification === "personal" ? "personal" : "source"}
                          >
                            {trip.classification}
                          </Badge>
                        </td>
                        <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                          {trip.platformTag || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recently deleted trips (archive, last 60 days) */}
          {deletedTrips && deletedTrips.length > 0 && (
            <div className="settings-section">
              <h4 className="settings-section__title">Recently Deleted</h4>
              <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", margin: "0 0 0.5rem" }}>
                Trips removed in the last 60 days. Restore creates a new trip with the same details and route.
              </p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Distance</th>
                      <th>From / To</th>
                      <th>Deleted</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedTrips.map((dt) => (
                      <tr key={dt.id}>
                        <td style={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                          {dt.startedAt
                            ? new Date(dt.startedAt).toLocaleDateString("en-GB", {
                                day: "numeric",
                                month: "short",
                                year: "2-digit",
                              })
                            : "-"}
                        </td>
                        <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                          {dt.distanceMiles != null ? `${dt.distanceMiles.toFixed(1)} mi` : "-"}
                        </td>
                        <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: 260 }}>
                          {dt.startAddress || "?"} {"\u2192"} {dt.endAddress || "?"}
                        </td>
                        <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                          {new Date(dt.deletedAt).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          by {dt.deletedBy}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {dt.restoredTripId ? (
                            <Badge variant="success">Restored</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={!!restoringId}
                              onClick={() => handleRestoreDeletedTrip(dt.id)}
                            >
                              {restoringId === dt.id ? "Restoring..." : "Restore"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {restoreResult && (
                <p
                  style={{
                    fontSize: "0.8125rem",
                    marginTop: "0.5rem",
                    color: restoreResult.startsWith("Error") ? "var(--dash-red)" : "var(--emerald-400)",
                  }}
                >
                  {restoreResult}
                </p>
              )}
            </div>
          )}

          {/* Recent Events (comms + activity history) */}
          {events && events.length > 0 && (() => {
            const isComms = (t: string) =>
              t.startsWith("notification.") || t.startsWith("email.") || t === "admin.push_sent";
            const visible = showAllEvents ? events : events.filter((e) => isComms(e.type));
            return (
              <div className="settings-section">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <h4 className="settings-section__title" style={{ margin: 0 }}>
                    {showAllEvents ? "Recent Events" : "Comms History"}
                  </h4>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <button
                      type="button"
                      className={`filter-chip ${!showAllEvents ? "filter-chip--active" : ""}`}
                      onClick={() => setShowAllEvents(false)}
                    >
                      Comms
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${showAllEvents ? "filter-chip--active" : ""}`}
                      onClick={() => setShowAllEvents(true)}
                    >
                      All events
                    </button>
                  </div>
                </div>
                {visible.length === 0 ? (
                  <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                    No {showAllEvents ? "events" : "notifications or emails"} recorded for this user.
                  </p>
                ) : (
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Event</th>
                          <th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.slice(0, 40).map((e) => {
                          const meta = e.metadata ?? {};
                          const detail = [
                            typeof meta.title === "string" ? meta.title : null,
                            typeof meta.reason === "string" ? meta.reason : null,
                            typeof meta.action === "string" ? meta.action : null,
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <tr key={e.id}>
                              <td
                                style={{ whiteSpace: "nowrap", fontSize: "0.75rem", color: "var(--text-secondary)" }}
                                title={new Date(e.createdAt).toLocaleString()}
                              >
                                {timeAgo(e.createdAt)}
                              </td>
                              <td style={{ fontSize: "0.75rem", fontFamily: "monospace" }}>{e.type}</td>
                              <td
                                style={{ fontSize: "0.75rem", color: "var(--text-secondary)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                title={Object.keys(meta).length ? JSON.stringify(meta) : ""}
                              >
                                {detail || (Object.keys(meta).length ? JSON.stringify(meta).slice(0, 80) : "-")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Drive Detection Diagnostics */}
          <div className="settings-section">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              <h4 className="settings-section__title" style={{ margin: 0 }}>Drive Detection</h4>
              {diag && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const safeEmail = user.email.replace(/[^a-z0-9]/gi, "_");
                    const ts = new Date(diag.capturedAt).toISOString().replace(/[:.]/g, "-").slice(0, 19);
                    downloadTextFile(`mileclear-diagnostics-${safeEmail}-${ts}.txt`, buildDiagnosticDumpText(diag, user));
                  }}
                >
                  Download .txt
                </Button>
              )}
            </div>
            {diag ? (() => {
              const st = diag.statusJson as Record<string, unknown>;
              const verdictColor = diag.verdict === "healthy" ? "var(--emerald-400)"
                : diag.verdict === "error" ? "var(--dash-red)"
                : diag.verdict === "warning" ? "var(--amber-500)"
                : "var(--dash-blue, #3b82f6)";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{
                      padding: "0.15rem 0.5rem",
                      borderRadius: "6px",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: verdictColor,
                      background: `color-mix(in srgb, ${verdictColor} 15%, transparent)`,
                    }}>
                      {diag.verdict}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      v{diag.appVersion} (build {diag.buildNumber}) - {diag.platform} {diag.osVersion}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {new Date(diag.capturedAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.25rem 1rem", fontSize: "0.8125rem" }}>
                    {[
                      ["Task running", st.taskRunning, st.taskRunning === true],
                      ["BG permission", st.backgroundPermission, st.backgroundPermission === "granted"],
                      ["Enabled", st.enabled, st.enabled === true],
                      ["Auto-recording", st.autoRecordingActive, st.autoRecordingActive !== true],
                      ["Buffered coords", st.bufferedCoordinates, undefined],
                      ["Quiet hours", st.quietHours, undefined],
                    ].map(([label, value, good], i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.15rem 0" }}>
                        <span style={{ color: "var(--text-secondary)" }}>{String(label)}</span>
                        <span style={{
                          fontWeight: 600,
                          color: good === undefined ? "var(--text-secondary)"
                            : good ? "var(--emerald-400)" : "var(--dash-red)",
                        }}>
                          {String(value ?? "-")}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* App state - current foreground/background + seconds since last
                      transition. Lets a reviewer spot 'iOS suspended the app for
                      14 minutes here' at a glance. */}
                  {(() => {
                    const appState = st.appState as { currentState?: string; secondsInCurrentState?: number; lastForegroundedAt?: string; lastBackgroundedAt?: string } | undefined;
                    if (!appState) return null;
                    return (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", padding: "0.5rem 0.625rem", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                        <strong style={{ color: "var(--text-primary)" }}>App state:</strong> {appState.currentState ?? "?"}
                        {typeof appState.secondsInCurrentState === "number" && (
                          <> ({Math.round(appState.secondsInCurrentState / 60)} min ago)</>
                        )}
                        {appState.lastForegroundedAt && (
                          <> · last fg {new Date(appState.lastForegroundedAt).toLocaleTimeString()}</>
                        )}
                      </div>
                    );
                  })()}

                  {/* Activity summary (24h event counts) - matches the mobile
                      Drive Detection screen layout. */}
                  {(() => {
                    const summary = st.activitySummary as Record<string, number> | undefined;
                    const entries = summary ? Object.entries(summary).sort(([, a], [, b]) => b - a) : [];
                    if (entries.length === 0) return null;
                    return (
                      <div>
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 0.375rem" }}>
                          Activity (last 24h)
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.25rem 0.75rem", fontSize: "0.75rem" }}>
                          {entries.map(([event, count]) => (
                            <div key={event} style={{ display: "flex", justifyContent: "space-between", padding: "0.15rem 0" }}>
                              <span style={{ color: "var(--text-tertiary)" }}>{event}</span>
                              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Recent trips (last 10) - gives the reviewer a quick view of
                      what the device thinks it's been recording. Tap to filter
                      the events list below to that trip's time window. */}
                  {(() => {
                    const trips = st.recentTrips as Array<{
                      id: string;
                      start_address: string | null;
                      end_address: string | null;
                      distance_miles: number;
                      started_at: string;
                      ended_at: string | null;
                      classification: string | null;
                      synced_at: string | null;
                    }> | undefined;
                    if (!trips || trips.length === 0) return null;
                    return (
                      <div>
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 0.375rem" }}>
                          Recent trips on device (tap to filter events)
                        </p>
                        {tripFilter && (
                          <button
                            type="button"
                            onClick={() => setTripFilter(null)}
                            style={{ background: "none", border: "none", color: "var(--amber-500)", fontSize: "0.75rem", cursor: "pointer", padding: "0.25rem 0", marginBottom: "0.25rem" }}
                          >
                            ← Show all events
                          </button>
                        )}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "240px", overflow: "auto" }}>
                          {trips.map((t) => {
                            const selected = tripFilter?.id === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setTripFilter(selected ? null : t)}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: "0.5rem",
                                  padding: "0.375rem 0.5rem",
                                  fontSize: "0.75rem",
                                  background: selected ? "rgba(245,166,35,0.12)" : "rgba(255,255,255,0.02)",
                                  border: selected ? "1px solid rgba(245,166,35,0.4)" : "1px solid transparent",
                                  borderRadius: "4px",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  opacity: tripFilter && !selected ? 0.5 : 1,
                                  color: "var(--text-primary)",
                                }}
                              >
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {t.start_address ?? "?"} → {t.end_address ?? "?"}
                                </span>
                                <span style={{ color: "var(--text-tertiary)", flexShrink: 0 }}>
                                  {t.distance_miles.toFixed(1)} mi · {new Date(t.started_at).toLocaleTimeString()}
                                  {!t.synced_at && <span style={{ color: "var(--amber-500)" }}> · unsynced</span>}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Routing stats (24h call breakdown by source) */}
                  {(() => {
                    const routing = st.routingStats as { totalCalls?: number; bySource?: Record<string, { count: number; avgLatencyMs: number }> } | undefined;
                    if (!routing || !routing.totalCalls) return null;
                    return (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", padding: "0.5rem 0.625rem", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                        <strong style={{ color: "var(--text-primary)" }}>Routing (24h):</strong> {routing.totalCalls} calls
                        {routing.bySource && Object.entries(routing.bySource).map(([source, stats]) => (
                          <span key={source} style={{ marginLeft: "0.5rem" }}>
                            · {source} ×{stats.count} (~{stats.avgLatencyMs}ms)
                          </span>
                        ))}
                      </div>
                    );
                  })()}

                  {diag.eventsJson.length > 0 && (() => {
                    // Resolve saved-location UUIDs to names in event payloads
                    // (mirrors the mobile Drive Detection screen).
                    const savedLocations = st.savedLocations as Array<{ id: string; name: string }> | undefined;
                    const lookup = new Map<string, string>();
                    if (savedLocations) for (const l of savedLocations) lookup.set(l.id, l.name);

                    // Filter to the selected trip's time window (±60s).
                    const filtered = tripFilter
                      ? diag.eventsJson.filter((ev) => {
                          const t = new Date(ev.recorded_at).getTime();
                          const start = new Date(tripFilter.started_at).getTime() - 60_000;
                          const end = tripFilter.ended_at
                            ? new Date(tripFilter.ended_at).getTime() + 60_000
                            : Date.now();
                          return t >= start && t <= end;
                        })
                      : diag.eventsJson;
                    return (
                      <div>
                        <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 0.375rem" }}>
                          Events ({filtered.length}{tripFilter ? ` of ${diag.eventsJson.length}, filtered` : ""})
                        </p>
                        <div style={{ maxHeight: "400px", overflow: "auto", fontSize: "0.75rem", lineHeight: 1.6, color: "var(--text-tertiary)", border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))", borderRadius: "6px", padding: "0.5rem 0.625rem" }}>
                          {filtered.map((ev, i) => {
                            // Replace any locationId UUID in the data with `${uuid} (${name})`
                            let dataDisplay = ev.data;
                            if (dataDisplay) {
                              for (const [id, name] of lookup) {
                                if (dataDisplay.includes(id)) {
                                  dataDisplay = dataDisplay.replace(id, `${id} (${name})`);
                                  break;
                                }
                              }
                            }
                            return (
                              <div key={i}>
                                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{ev.event}</span>
                                {dataDisplay && <span> {dataDisplay}</span>}
                                <span style={{ marginLeft: "0.5rem", opacity: 0.6 }}>
                                  {new Date(ev.recorded_at).toLocaleTimeString()}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })() : (
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                No diagnostics uploaded yet
              </p>
            )}
          </div>

          {/* Send Push Notification */}
          <div className="settings-section">
            <h4 className="settings-section__title">Send Push Notification</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <Input
                id="pushTitle"
                placeholder="Notification title"
                value={pushTitle}
                onChange={(e) => setPushTitle(e.target.value)}
                maxLength={100}
              />
              <Input
                id="pushBody"
                placeholder="Notification body"
                value={pushBody}
                onChange={(e) => setPushBody(e.target.value)}
                maxLength={200}
              />
              {/* Deep-link action - every push must route somewhere on tap. */}
              <Select
                id="pushAction"
                value={pushAction}
                onChange={(e) => setPushAction(e.target.value)}
                options={[
                  { value: "open_app", label: "Tap opens: app (default)" },
                  { value: "open_dashboard", label: "Tap opens: Dashboard" },
                  { value: "open_trips", label: "Tap opens: Trips" },
                  { value: "open_unclassified_trips", label: "Tap opens: Unclassified trips" },
                  { value: "open_settings", label: "Tap opens: Settings" },
                  { value: "open_diagnostics", label: "Tap opens: Drive Detection diagnostics" },
                  { value: "open_sync_status", label: "Tap opens: Sync status" },
                  { value: "open_billing", label: "Tap opens: Billing" },
                  { value: "open_exports", label: "Tap opens: Exports" },
                  { value: "open_referrals", label: "Tap opens: Referrals" },
                ]}
              />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSendPush(true)}
                  disabled={pushSending || !pushTitle.trim() || !pushBody.trim()}
                >
                  Dry Run
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSendPush(false)}
                  disabled={pushSending || !pushTitle.trim() || !pushBody.trim()}
                >
                  {pushSending ? "Sending..." : "Send"}
                </Button>
              </div>
              {pushResult && (
                <p style={{ fontSize: "0.8125rem", color: pushResult.startsWith("Error") ? "var(--dash-red)" : "var(--emerald-400)", margin: 0 }}>
                  {pushResult}
                </p>
              )}
            </div>
          </div>

          {/* Remote engine switch - set_native_engine silent push. The per-user
              rollback lever for the ClearTrack rollout: devices where the
              native engine never opens recordings (silent non-capture) get
              flipped back to the JS engine without the user doing anything.
              Needs the device on an OTA that includes the handler (10 Jun
              2026+); older bundles ignore the push harmlessly. */}
          <div className="settings-section">
            <h4 className="settings-section__title">Trip Detection Engine</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <p style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)", margin: 0 }}>
                Latest dump reports:{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {diag
                    ? (diag.statusJson as { nativeEngineEnabled?: boolean }).nativeEngineEnabled === true
                      ? "ClearTrack (native)"
                      : "JS engine"
                    : "unknown (no dump)"}
                </strong>
                . Switching sends a silent push; it takes effect when the device receives it.
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEngineSwitch(false)}
                  disabled={engineSending}
                >
                  Switch to JS engine
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEngineSwitch(true)}
                  disabled={engineSending}
                >
                  Switch to ClearTrack
                </Button>
              </div>
              {engineResult && (
                <p style={{ fontSize: "0.8125rem", color: engineResult.startsWith("Error") ? "var(--dash-red)" : "var(--emerald-400)", margin: 0 }}>
                  {engineResult}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
