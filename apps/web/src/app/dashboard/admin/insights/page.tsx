"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";

// ───────────── Shared types ─────────────────────────────────────────────────

interface FunnelStep {
  key: string;
  label: string;
  count: number;
  pctOfPrev: number;
  pctOfTotal: number;
}

interface RetentionData {
  cohortSize: number;
  cohortWindow: string;
  d1: { count: number; pct: number };
  d7: { count: number; pct: number };
  d30: { count: number; pct: number };
}

interface ActiveTrip {
  id: string;
  userId: string;
  userLabel: string;
  startedAt: string;
  minutesElapsed: number;
  startAddress: string | null;
  distanceMiles: number;
  classification: string;
  platformTag: string | null;
}

interface ActiveShift {
  id: string;
  userId: string;
  userLabel: string;
  startedAt: string;
  minutesElapsed: number;
}

interface DiagnosticPanels {
  windowDays: number;
  ratingFunnel: { type: string; count: number }[];
  classificationAccuracy: {
    accepted: number;
    rejected: number;
    accuracyPercent: number | null;
  };
  lowQualityTripCount: number;
  heartbeatAlerts: { type: string; count: number }[];
}

interface OnboardingStep {
  label: string;
  count: number;
  pct: number;
}

interface AuditEvent {
  id: string;
  type: string;
  action: string;
  userId: string | null;
  userLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface EmailEvent {
  id: string;
  type: string;
  userId: string | null;
  userLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface TopUsersData {
  byMiles: { id: string; label: string; totalMiles: number; tripCount: number }[];
  byProTenure: {
    id: string;
    label: string;
    accountAgeDays: number;
    premiumExpiresAt: string | null;
  }[];
  byEngagement: { id: string; label: string; tripsLast30d: number }[];
}

interface BenchmarkObserver {
  category: string;
  windowDays: number;
  contributors: number;
  privacyFloorMet: boolean;
  p25: number | null;
  median: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
}

// ───────────── Small UI helpers ─────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "rgba(15, 23, 42, 0.6)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: 14,
        padding: 20,
        marginBottom: 20,
      }}
    >
      <h3
        style={{
          fontSize: "1rem",
          fontWeight: 700,
          color: "#f9fafb",
          margin: 0,
          marginBottom: description ? 4 : 14,
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            fontSize: "0.8125rem",
            color: "#64748b",
            margin: 0,
            marginBottom: 14,
          }}
        >
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

// ───────────── Page ────────────────────────────────────────────────────────

export default function AdminInsightsPage() {
  return (
    <main style={{ padding: "2rem 1.5rem", maxWidth: 1100, margin: "0 auto" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <a
          href="/dashboard/admin"
          style={{
            color: "#94a3b8",
            fontSize: "0.875rem",
            textDecoration: "none",
            display: "inline-block",
            marginBottom: "0.5rem",
          }}
        >
          ← Back to Admin
        </a>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#f9fafb",
            margin: 0,
          }}
        >
          Insights
        </h1>
        <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginTop: 4 }}>
          Funnel, retention, active recordings, diagnostic panels, comp logs and more.
        </p>
      </header>

      <FunnelCard />
      <RetentionCard />
      <ActiveRecordingsCard />
      <DiagnosticPanelsCard />
      <OnboardingFunnelCard />
      <CompPremiumCard />
      <AuditLogCard />
      <EmailEventsCard />
      <TopUsersCard />
      <BenchmarkObserverCard />
    </main>
  );
}

// ───────────── 1. Funnel ───────────────────────────────────────────────────

function FunnelCard() {
  const [data, setData] = useState<{ steps: FunnelStep[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: { steps: FunnelStep[] } }>("/admin/funnel")
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load funnel"));
  }, []);

  return (
    <Card
      title="Conversion funnel"
      description="Signup → first trip → 5+ trips → earnings logged → Pro upgrade"
    >
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {!data && !error && <p style={{ color: "#64748b" }}>Loading…</p>}
      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.steps.map((s) => (
            <div
              key={s.key}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 16,
                alignItems: "center",
                padding: "10px 12px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 8,
              }}
            >
              <span style={{ color: "#e2e8f0", fontSize: "0.9375rem" }}>{s.label}</span>
              <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: "1.125rem" }}>
                {s.count.toLocaleString()}
              </span>
              <span style={{ color: "#64748b", fontSize: "0.8125rem" }}>
                {s.pctOfPrev.toFixed(1)}% of prev · {s.pctOfTotal.toFixed(1)}% of total
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ───────────── 2. Retention ────────────────────────────────────────────────

function RetentionCard() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: RetentionData }>("/admin/retention")
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load retention"));
  }, []);

  return (
    <Card
      title="Retention (D1 / D7 / D30)"
      description="Of users who signed up in the last 90 days, what fraction logged a trip on or after each day from signup."
    >
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {!data && !error && <p style={{ color: "#64748b" }}>Loading…</p>}
      {data && (
        <>
          <p style={{ color: "#94a3b8", fontSize: "0.8125rem", marginBottom: 12 }}>
            Cohort: {data.cohortSize} signups in last 90 days
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {(["d1", "d7", "d30"] as const).map((k) => (
              <div
                key={k}
                style={{
                  background: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.15)",
                  borderRadius: 10,
                  padding: 14,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: 4 }}>
                  {k.toUpperCase()}
                </div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fbbf24" }}>
                  {data[k].pct.toFixed(1)}%
                </div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: 2 }}>
                  {data[k].count} active
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ───────────── 3. Active Recordings ────────────────────────────────────────

function ActiveRecordingsCard() {
  const [data, setData] = useState<{ activeTrips: ActiveTrip[]; activeShifts: ActiveShift[] } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ data: { activeTrips: ActiveTrip[]; activeShifts: ActiveShift[] } }>(
        "/admin/active-recordings"
      )
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load active recordings"));
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 30000);
    return () => clearInterval(i);
  }, [load]);

  return (
    <Card
      title="Active recordings (live)"
      description="Trips with no endedAt and shifts with status=active, in the last 24h. Refreshes every 30s."
    >
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {!data && !error && <p style={{ color: "#64748b" }}>Loading…</p>}
      {data && (
        <>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginBottom: 10 }}>
            <strong style={{ color: "#10b981" }}>{data.activeTrips.length}</strong> active{" "}
            {data.activeTrips.length === 1 ? "trip" : "trips"} ·{" "}
            <strong style={{ color: "#10b981" }}>{data.activeShifts.length}</strong> active{" "}
            {data.activeShifts.length === 1 ? "shift" : "shifts"}
          </p>
          {data.activeTrips.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: "0.875rem", color: "#94a3b8", margin: "0 0 8px" }}>
                Trips in progress
              </h4>
              {data.activeTrips.map((t) => (
                <div
                  key={t.id}
                  style={{
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: "0.875rem",
                    color: "#e2e8f0",
                  }}
                >
                  <strong>{t.userLabel}</strong> · {formatMinutes(t.minutesElapsed)} elapsed ·{" "}
                  {t.distanceMiles.toFixed(1)}mi
                  {t.platformTag && <> · {t.platformTag}</>}
                  {t.startAddress && (
                    <div style={{ color: "#64748b", fontSize: "0.8125rem", marginTop: 2 }}>
                      from {t.startAddress}
                    </div>
                  )}
                  {t.minutesElapsed > 240 && (
                    <div style={{ color: "#f59e0b", fontSize: "0.75rem", marginTop: 2 }}>
                      ⚠ Over 4 hours - possibly stuck
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {data.activeShifts.length > 0 && (
            <div>
              <h4 style={{ fontSize: "0.875rem", color: "#94a3b8", margin: "0 0 8px" }}>
                Shifts in progress
              </h4>
              {data.activeShifts.map((s) => (
                <div
                  key={s.id}
                  style={{
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: "0.875rem",
                    color: "#e2e8f0",
                  }}
                >
                  <strong>{s.userLabel}</strong> · {formatMinutes(s.minutesElapsed)} elapsed
                  {s.minutesElapsed > 720 && (
                    <div style={{ color: "#f59e0b", fontSize: "0.75rem", marginTop: 2 }}>
                      ⚠ Over 12 hours - possibly stuck
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {data.activeTrips.length === 0 && data.activeShifts.length === 0 && (
            <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
              No active recordings right now.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

// ───────────── 4. Diagnostic Panels ────────────────────────────────────────

function DiagnosticPanelsCard() {
  const [data, setData] = useState<DiagnosticPanels | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: DiagnosticPanels }>("/admin/diagnostic-panels")
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load diagnostic panels"));
  }, []);

  return (
    <Card
      title="Diagnostic panels"
      description="Rating funnel, classification accuracy, low-quality trips and heartbeat alerts. Last 7 days."
    >
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {!data && !error && <p style={{ color: "#64748b" }}>Loading…</p>}
      {data && (
        <>
          <h4 style={{ fontSize: "0.8125rem", color: "#94a3b8", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Rating funnel
          </h4>
          {data.ratingFunnel.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "0.8125rem", marginBottom: 14 }}>
              No rating events in the last 7 days.
            </p>
          ) : (
            <div style={{ marginBottom: 14 }}>
              {data.ratingFunnel.map((r) => (
                <div
                  key={r.type}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "4px 0",
                    fontSize: "0.875rem",
                    color: "#e2e8f0",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>{r.type.replace("rating.", "")}</span>
                  <strong>{r.count}</strong>
                </div>
              ))}
            </div>
          )}

          <h4 style={{ fontSize: "0.8125rem", color: "#94a3b8", margin: "10px 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Classification accuracy
          </h4>
          <p style={{ color: "#e2e8f0", fontSize: "0.9375rem", marginBottom: 14 }}>
            {data.classificationAccuracy.accuracyPercent !== null ? (
              <>
                <strong style={{ color: "#fbbf24", fontSize: "1.125rem" }}>
                  {data.classificationAccuracy.accuracyPercent.toFixed(1)}%
                </strong>{" "}
                accepted · {data.classificationAccuracy.accepted}/
                {data.classificationAccuracy.accepted + data.classificationAccuracy.rejected} signals
              </>
            ) : (
              <span style={{ color: "#64748b" }}>No classification feedback yet.</span>
            )}
          </p>

          <h4 style={{ fontSize: "0.8125rem", color: "#94a3b8", margin: "10px 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Low-quality trips
          </h4>
          <p style={{ color: "#e2e8f0", fontSize: "0.9375rem", marginBottom: 14 }}>
            <strong style={{ color: "#fbbf24" }}>{data.lowQualityTripCount}</strong> auto-detected
            trips under 0.3mi in the last 7 days
          </p>

          <h4 style={{ fontSize: "0.8125rem", color: "#94a3b8", margin: "10px 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Heartbeat alerts
          </h4>
          {data.heartbeatAlerts.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "0.8125rem" }}>
              No heartbeat alerts.
            </p>
          ) : (
            data.heartbeatAlerts.map((h) => (
              <div
                key={h.type}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "4px 0",
                  fontSize: "0.875rem",
                  color: "#e2e8f0",
                }}
              >
                <span style={{ color: "#94a3b8" }}>{h.type.replace("diagnostic_alert.", "")}</span>
                <strong>{h.count}</strong>
              </div>
            ))
          )}
        </>
      )}
    </Card>
  );
}

// ───────────── 5. Onboarding-derived funnel ────────────────────────────────

function OnboardingFunnelCard() {
  const [data, setData] = useState<{ total: number; steps: OnboardingStep[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: { total: number; steps: OnboardingStep[] } }>("/admin/onboarding-derived")
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load onboarding funnel"));
  }, []);

  return (
    <Card
      title="Onboarding completion (derived)"
      description="Per-step completion derived from observable user state (no per-step events emitted yet)."
    >
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {!data && !error && <p style={{ color: "#64748b" }}>Loading…</p>}
      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.steps.map((s) => (
            <div
              key={s.label}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 16,
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
                alignItems: "center",
              }}
            >
              <span style={{ color: "#e2e8f0", fontSize: "0.875rem" }}>{s.label}</span>
              <span style={{ color: "#fbbf24", fontWeight: 700 }}>{s.count}</span>
              <span style={{ color: "#64748b", fontSize: "0.8125rem", minWidth: 56, textAlign: "right" }}>
                {s.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ───────────── 6. Comp Pro account ─────────────────────────────────────────

function CompPremiumCard() {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const [months, setMonths] = useState(12);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!userId.trim() || !reason.trim()) {
      setError("User ID and reason are both required");
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ data: { ok: boolean; premiumExpiresAt: string } }>(
        `/admin/users/${userId.trim()}/comp-premium`,
        { reason: reason.trim(), months }
      );
      setResult(`Comped Pro until ${new Date(res.data.premiumExpiresAt).toLocaleDateString("en-GB")}.`);
      setUserId("");
      setReason("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Comp failed");
    } finally {
      setSubmitting(false);
    }
  }, [userId, reason, months]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 6,
    color: "#f0f2f5",
    fontSize: "0.875rem",
  };

  return (
    <Card
      title="Comp Pro account"
      description="Grant a Pro account with a stated reason. Logged to the audit trail below."
    >
      {error && <p style={{ color: "#f87171", fontSize: "0.875rem", marginBottom: 8 }}>{error}</p>}
      {result && <p style={{ color: "#10b981", fontSize: "0.875rem", marginBottom: 8 }}>{result}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          type="text"
          placeholder="User ID (UUID)"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Reason (e.g. 'Beta tester comp', 'Press review')"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={inputStyle}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ color: "#94a3b8", fontSize: "0.875rem" }}>Months:</label>
          <input
            type="number"
            min={1}
            max={120}
            value={months}
            onChange={(e) => setMonths(parseInt(e.target.value || "0", 10) || 0)}
            style={{ ...inputStyle, width: 80 }}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            background: "#fbbf24",
            color: "#030712",
            fontWeight: 700,
            border: "none",
            padding: "10px 18px",
            borderRadius: 6,
            cursor: submitting ? "wait" : "pointer",
            alignSelf: "flex-start",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Comping…" : "Comp Pro"}
        </button>
      </div>
    </Card>
  );
}

// ───────────── 7. Audit log ────────────────────────────────────────────────

function AuditLogCard() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: AuditEvent[] }>("/admin/audit-log")
      .then((res) => setEvents(res.data))
      .catch(() => setError("Could not load audit log"));
  }, []);

  return (
    <Card
      title="Admin audit log"
      description="Comp grants, premium toggles and other admin actions. Most recent first."
    >
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {!events && !error && <p style={{ color: "#64748b" }}>Loading…</p>}
      {events && events.length === 0 && (
        <p style={{ color: "#64748b", fontSize: "0.875rem" }}>No admin actions logged yet.</p>
      )}
      {events && events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {events.map((e) => (
            <div
              key={e.id}
              style={{
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
                fontSize: "0.875rem",
                color: "#e2e8f0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{e.action}</strong>
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{formatDate(e.createdAt)}</span>
              </div>
              {e.userLabel && (
                <div style={{ color: "#94a3b8", fontSize: "0.8125rem", marginTop: 2 }}>
                  Target: {e.userLabel}
                </div>
              )}
              {e.metadata && Object.keys(e.metadata).length > 0 && (
                <pre
                  style={{
                    color: "#64748b",
                    fontSize: "0.75rem",
                    margin: "4px 0 0",
                    fontFamily: "ui-monospace, monospace",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(e.metadata, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ───────────── 8. Email events ─────────────────────────────────────────────

function EmailEventsCard() {
  const [events, setEvents] = useState<EmailEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: EmailEvent[] }>("/admin/email-events")
      .then((res) => setEvents(res.data))
      .catch(() => setError("Could not load email events"));
  }, []);

  return (
    <Card
      title="Email outbox"
      description="Recent app_events with type starting 'email.'. Currently empty until the email service is wired to logEvent."
    >
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {!events && !error && <p style={{ color: "#64748b" }}>Loading…</p>}
      {events && events.length === 0 && (
        <p style={{ color: "#64748b", fontSize: "0.875rem" }}>
          No email events yet. Wire `email.sent`/`email.bounced` events into the email service to start populating.
        </p>
      )}
      {events && events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {events.map((e) => (
            <div
              key={e.id}
              style={{
                padding: "8px 10px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: 6,
                fontSize: "0.875rem",
                color: "#e2e8f0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{e.type}</strong>
                <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{formatDate(e.createdAt)}</span>
              </div>
              {e.userLabel && (
                <div style={{ color: "#94a3b8", fontSize: "0.8125rem", marginTop: 2 }}>{e.userLabel}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ───────────── 9. Top users ────────────────────────────────────────────────

function TopUsersCard() {
  const [data, setData] = useState<TopUsersData | null>(null);
  const [tab, setTab] = useState<"miles" | "tenure" | "engagement">("miles");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: TopUsersData }>("/admin/top-users")
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load top users"));
  }, []);

  return (
    <Card
      title="Top users"
      description="Sorted lists for outreach, testimonials and case studies."
    >
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {!data && !error && <p style={{ color: "#64748b" }}>Loading…</p>}
      {data && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {(
              [
                { key: "miles", label: "By miles" },
                { key: "tenure", label: "By account age" },
                { key: "engagement", label: "By engagement (30d)" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background:
                    tab === t.key ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.03)",
                  color: tab === t.key ? "#fbbf24" : "#94a3b8",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tab === "miles" &&
              data.byMiles.map((u, i) => (
                <div key={u.id} style={topUserRow}>
                  <span style={{ color: "#64748b", width: 24 }}>{i + 1}</span>
                  <span style={{ flex: 1, color: "#e2e8f0" }}>{u.label}</span>
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                    {u.totalMiles.toFixed(0)} mi
                  </span>
                  <span style={{ color: "#64748b", fontSize: "0.8125rem", minWidth: 70, textAlign: "right" }}>
                    {u.tripCount} trips
                  </span>
                </div>
              ))}
            {tab === "tenure" &&
              data.byProTenure.map((u, i) => (
                <div key={u.id} style={topUserRow}>
                  <span style={{ color: "#64748b", width: 24 }}>{i + 1}</span>
                  <span style={{ flex: 1, color: "#e2e8f0" }}>{u.label}</span>
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                    {u.accountAgeDays}d
                  </span>
                </div>
              ))}
            {tab === "engagement" &&
              data.byEngagement.map((u, i) => (
                <div key={u.id} style={topUserRow}>
                  <span style={{ color: "#64748b", width: 24 }}>{i + 1}</span>
                  <span style={{ flex: 1, color: "#e2e8f0" }}>{u.label}</span>
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>
                    {u.tripsLast30d} trips
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </Card>
  );
}

const topUserRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "6px 10px",
  background: "rgba(255,255,255,0.03)",
  borderRadius: 6,
  fontSize: "0.875rem",
};

// ───────────── 10. Benchmark observer ─────────────────────────────────────

function BenchmarkObserverCard() {
  const [data, setData] = useState<BenchmarkObserver | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: BenchmarkObserver }>("/admin/benchmark-observer")
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load benchmark observer"));
  }, []);

  return (
    <Card
      title="Anonymous benchmark observer"
      description="Raw bucket calculations - sanity-check the percentiles surfaced in the user-facing 'How You Compare' card."
    >
      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {!data && !error && <p style={{ color: "#64748b" }}>Loading…</p>}
      {data && (
        <>
          <p style={{ color: "#94a3b8", fontSize: "0.8125rem", marginBottom: 12 }}>
            {data.category} · {data.windowDays}d window ·{" "}
            <strong style={{ color: data.privacyFloorMet ? "#10b981" : "#f59e0b" }}>
              {data.contributors} contributors
            </strong>
            {!data.privacyFloorMet && " (below 5-contributor privacy floor)"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {[
              { label: "Min", value: data.min },
              { label: "p25", value: data.p25 },
              { label: "Median", value: data.median },
              { label: "p75", value: data.p75 },
              { label: "Max", value: data.max },
            ].map((b) => (
              <div
                key={b.label}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 8,
                  padding: 10,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: 2 }}>
                  {b.label}
                </div>
                <div style={{ fontSize: "1rem", color: "#fbbf24", fontWeight: 700 }}>
                  {b.value !== null ? `${b.value} mi` : "—"}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
