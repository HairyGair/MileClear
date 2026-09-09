"use client";

// Overview section of the admin area (Sep 2026 redesign).

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LoadingSkeleton } from "@/components/ui/LoadingSkeleton";
import { AdminPage } from "@/components/admin";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import { AdminUser, Analytics, FB_CATEGORY_OPTIONS, FB_STATUSES, FbItem, formatNumber, formatPence, timeAgo } from "@/components/admin/legacy";

// Overview Tab
// ---------------------------------------------------------------------------

interface RatingDiagnostics {
  totalLoveItEvents: number;
  distinctUsers: number;
  usersWithSinglePrompt: number;
  usersWithRepeat: number;
  usersAt3Plus: number;
  byBuild: Array<{ buildNumber: string; appVersion: string | null; count: number }>;
  generatedAt: string;
}

function OverviewTab() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [feedbackStats, setFeedbackStats] = useState<{ total: number; byStatus: Record<string, number> } | null>(null);
  const [ratingDiag, setRatingDiag] = useState<RatingDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ data: Analytics }>("/admin/analytics"),
      api.get<{ data: { total: number; byStatus: Record<string, number> } }>("/feedback/stats"),
      api.get<{ data: RatingDiagnostics }>("/admin/rating/diagnostics"),
    ])
      .then(([analyticsRes, fbRes, diagRes]) => {
        setAnalytics(analyticsRes.data);
        setFeedbackStats(fbRes.data);
        setRatingDiag(diagRes.data);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        <div className="stats-grid" style={{ marginBottom: "1rem" }}>
          <LoadingSkeleton variant="card" count={4} style={{ height: 90 }} />
        </div>
        <div className="stats-grid">
          <LoadingSkeleton variant="card" count={4} style={{ height: 90 }} />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="alert alert--error" role="alert">
        Failed to load analytics: {error}
      </div>
    );
  }

  if (!analytics) return null;

  return (
    <>
      {/* Row 1 */}
      <div className="stats-grid" style={{ marginBottom: "1rem" }}>
        <div className="stat-card">
          <p className="stat-card__label">Total Users</p>
          <p className="stat-card__value">{formatNumber(analytics.totalUsers)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Active (30d)</p>
          <p className="stat-card__value stat-card__value--emerald">
            {formatNumber(analytics.activeUsers30d)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Paying subscribers</p>
          <p className="stat-card__value stat-card__value--amber">
            {formatNumber(analytics.payingSubscribers ?? analytics.premiumUsers)}
          </p>
          {analytics.payingSubscribers !== undefined && (
            <p
              style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 2 }}
              title="Pro users who are not paying: admin comp grants, referral credit, and App Store sandbox (TestFlight / App Review) subscriptions"
            >
              +{(analytics.compPro ?? 0) + (analytics.referralPro ?? 0) + (analytics.sandboxPro ?? 0)} non-paying Pro
              {" "}({analytics.compPro ?? 0} comp · {analytics.referralPro ?? 0} referral · {analytics.sandboxPro ?? 0} sandbox)
            </p>
          )}
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Total Trips</p>
          <p className="stat-card__value">{formatNumber(analytics.totalTrips)}</p>
        </div>
      </div>

      {/* Row 2 */}
      <div className="stats-grid">
        <div className="stat-card">
          <p className="stat-card__label">Total Miles</p>
          <p className="stat-card__value">{formatNumber(Math.round(analytics.totalMiles))} mi</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Total Earnings</p>
          <p className="stat-card__value stat-card__value--emerald">
            {formatPence(analytics.totalEarningsPence)}
          </p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">New This Month</p>
          <p className="stat-card__value">{formatNumber(analytics.usersThisMonth)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-card__label">Trips This Month</p>
          <p className="stat-card__value">{formatNumber(analytics.tripsThisMonth)}</p>
        </div>
        {analytics.platformCounts && (
          <div className="stat-card">
            <p className="stat-card__label">Platforms</p>
            <p className="stat-card__value" style={{ fontSize: "1.1rem", lineHeight: 1.5 }}>
              Apple {formatNumber(analytics.platformCounts.ios)} · Android {formatNumber(analytics.platformCounts.android)} · Both {formatNumber(analytics.platformCounts.both)}
            </p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: 4 }}>
              Web only {formatNumber(analytics.platformCounts.web)} · unknown {formatNumber(analytics.platformCounts.unknown)}
            </p>
          </div>
        )}
      </div>

      {/* Referral program */}
      {analytics.referrals && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ color: "var(--text-2, #8494a7)", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            Referral Program
          </h3>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-card__label">Friends Signed Up</p>
              <p className="stat-card__value">{formatNumber(analytics.referrals.attached)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Free Months Granted</p>
              <p className="stat-card__value stat-card__value--emerald">{formatNumber(analytics.referrals.qualified)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">On Referral Pro Now</p>
              <p className="stat-card__value stat-card__value--amber">{formatNumber(analytics.referrals.activeCreditUsers)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Rating Funnel */}
      {analytics.ratingFunnel && analytics.ratingFunnel.promptsShown > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ color: "var(--text-2, #8494a7)", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            App Store Rating Funnel
          </h3>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-card__label">Prompts Shown</p>
              <p className="stat-card__value">{formatNumber(analytics.ratingFunnel.promptsShown)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Love it!</p>
              <p className="stat-card__value stat-card__value--emerald">{formatNumber(analytics.ratingFunnel.loveIt)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Native Dialog</p>
              <p className="stat-card__value stat-card__value--emerald">{formatNumber(analytics.ratingFunnel.nativeDialogRequested)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Could Be Better</p>
              <p className="stat-card__value stat-card__value--amber">{formatNumber(analytics.ratingFunnel.couldBeBetter)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Already Rated</p>
              <p className="stat-card__value">{formatNumber(analytics.ratingFunnel.alreadyRated)}</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Not Now</p>
              <p className="stat-card__value">{formatNumber(analytics.ratingFunnel.notNow)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Rating diagnostics - by build + per-user repeat tally. Helps
          explain the gap between "Love it!" intent and ratings actually
          showing up in App Store Connect. */}
      {ratingDiag && ratingDiag.totalLoveItEvents > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ color: "var(--text-2, #8494a7)", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            Rating Diagnostics
          </h3>

          <div className="stat-grid" style={{ marginBottom: "0.75rem" }}>
            <div className="stat-card">
              <p className="stat-card__label">Distinct users</p>
              <p className="stat-card__value">{formatNumber(ratingDiag.distinctUsers)}</p>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>fired Love it! at least once</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Single prompt</p>
              <p className="stat-card__value">{formatNumber(ratingDiag.usersWithSinglePrompt)}</p>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>1 Love it! event</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Repeats (≥2)</p>
              <p className="stat-card__value" style={{ color: ratingDiag.usersWithRepeat > 0 ? "#f59e0b" : undefined }}>
                {formatNumber(ratingDiag.usersWithRepeat)}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>likely hitting Apple&apos;s 3/yr ceiling</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__label">Heavy (≥3)</p>
              <p className="stat-card__value" style={{ color: ratingDiag.usersAt3Plus > 0 ? "#ef4444" : undefined }}>
                {formatNumber(ratingDiag.usersAt3Plus)}
              </p>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 2 }}>almost certainly silent-no-op&apos;d</p>
            </div>
          </div>

          {ratingDiag.byBuild.length > 0 && (
            <div
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 10,
                padding: "0.75rem 0.875rem",
              }}
            >
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary, #f9fafb)", marginBottom: "0.5rem" }}>
                Love it! events by build at event time
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.4rem 1rem", fontSize: "0.8125rem" }}>
                {ratingDiag.byBuild.map((b) => (
                  <div key={b.buildNumber} style={{ display: "contents" }}>
                    <span style={{ color: "#cbd5e1", fontFamily: "monospace" }}>
                      {b.appVersion ? `${b.appVersion} (` : ""}build {b.buildNumber}{b.appVersion ? ")" : ""}
                    </span>
                    <span style={{ color: "#fcd34d", fontWeight: 600, fontFamily: "monospace" }}>{b.count}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "0.5rem" }}>
                Public App Store builds carry through to App Store Connect; TestFlight builds are silently dropped by Apple.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Row 3: Feedback */}
      {feedbackStats && (
        <div className="stats-grid" style={{ marginTop: "1rem" }}>
          <div className="stat-card">
            <p className="stat-card__label">Feedback Total</p>
            <p className="stat-card__value">{feedbackStats.total}</p>
          </div>
          <div className="stat-card">
            <p className="stat-card__label">New</p>
            <p className="stat-card__value" style={{ color: "#8494a7" }}>{feedbackStats.byStatus["new"] || 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-card__label">Planned</p>
            <p className="stat-card__value" style={{ color: "#3b82f6" }}>{feedbackStats.byStatus["planned"] || 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-card__label">In Progress</p>
            <p className="stat-card__value stat-card__value--amber">{feedbackStats.byStatus["in_progress"] || 0}</p>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Activity Tab
// ---------------------------------------------------------------------------

interface TeamInterestRow {
  id: string;
  email: string;
  company: string | null;
  drivers: string;
  approval: string;
  destination: string;
  destinationDetail: string | null;
  notes: string | null;
  source: string | null;
  createdAt: string;
}
interface TeamInterestResponse {
  data: TeamInterestRow[];
  totals: {
    submissions: number;
    companies: number;
    estimatedDrivers: number;
    tenPlusCompanies: number;
    byDrivers: Record<string, number>;
    byApproval: Record<string, number>;
    byDestination: Record<string, number>;
  };
}

function ActivityTab() {
  const [recentUsers, setRecentUsers] = useState<AdminUser[]>([]);
  const [premiumUsers, setPremiumUsers] = useState<AdminUser[]>([]);
  const [recentFeedback, setRecentFeedback] = useState<FbItem[]>([]);
  const [teamInterest, setTeamInterest] = useState<TeamInterestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ data: AdminUser[] }>("/admin/users?page=1&pageSize=15"),
      api.get<{ data: FbItem[] }>("/feedback/?page=1&pageSize=10&sort=newest"),
      api.get<TeamInterestResponse>("/admin/team-interest").catch(() => null),
    ])
      .then(([usersRes, fbRes, teamRes]) => {
        const allUsers = usersRes.data;
        setRecentUsers(allUsers.slice(0, 10));
        setPremiumUsers(allUsers.filter((u) => u.isPremium).slice(0, 10));
        setRecentFeedback(fbRes.data);
        setTeamInterest(teamRes);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="card" count={3} style={{ height: 120 }} />;
  if (error) return <div className="alert alert--error">{error}</div>;

  const APPROVAL_LABEL: Record<string, string> = {
    monthly_signoff: "Monthly sign-off",
    line_by_line: "Line by line",
    view_only: "View only",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Teams interest register - the bar is 5 companies with 10+ drivers */}
      {teamInterest && (
        <Card title={`Teams interest (${teamInterest.totals.submissions})`}>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", fontSize: "0.9375rem", marginBottom: teamInterest.data.length ? "1rem" : 0 }}>
            <div><span style={{ color: "var(--text-secondary)" }}>Companies </span><strong>{teamInterest.totals.companies}</strong></div>
            <div title="Band midpoints: 3 / 13 / 35 / 75. Indicative, not a count."><span style={{ color: "var(--text-secondary)" }}>Drivers (est.) </span><strong>{teamInterest.totals.estimatedDrivers}</strong></div>
            <div title="The trigger set on 21 Aug 2026: five companies with ten or more drivers each."><span style={{ color: "var(--text-secondary)" }}>10+ driver companies </span><strong style={{ color: teamInterest.totals.tenPlusCompanies >= 5 ? "var(--emerald-400)" : undefined }}>{teamInterest.totals.tenPlusCompanies} / 5</strong></div>
          </div>
          {teamInterest.data.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>Nobody has registered yet. The form is on /teams and /employee-mileage-tracker.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Drivers</th>
                    <th>Approval</th>
                    <th>Figures go to</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {teamInterest.data.slice(0, 25).map((r) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>{new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                      <td>
                        <div>{r.company || r.email.split("@")[1]}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{r.email}{r.source ? ` · via /${r.source}` : ""}</div>
                      </td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.drivers}</td>
                      <td>{APPROVAL_LABEL[r.approval] ?? r.approval}</td>
                      <td>{r.destination.replace("_", " ")}{r.destinationDetail ? ` (${r.destinationDetail})` : ""}</td>
                      <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", maxWidth: 320 }}>{r.notes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {/* Recent Signups */}
      <Card title={`Recent Signups (${recentUsers.length})`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((u) => (
                <tr key={u.id} onClick={() => setDetailUserId(u.id)} style={{ cursor: "pointer" }}>
                  <td style={{ fontSize: "0.8125rem" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      {u.email}
                      {u.diagnosticDump && u.diagnosticDump.verdict !== "healthy" && (
                        <span
                          title={`Detection: ${u.diagnosticDump.verdict}`}
                          style={{
                            display: "inline-block",
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            flexShrink: 0,
                            background: u.diagnosticDump.verdict === "error" ? "var(--dash-red)"
                              : u.diagnosticDump.verdict === "warning" ? "var(--amber-500)"
                              : "var(--dash-blue, #3b82f6)",
                          }}
                        />
                      )}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.8125rem" }}>{u.displayName || "-"}</td>
                  <td>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {u.isPremium && <Badge variant="pro">PRO</Badge>}
                      {u.isAdmin && <Badge variant="primary">Admin</Badge>}
                      {u.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge variant="danger">Unverified</Badge>}
                    </div>
                  </td>
                  <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    {timeAgo(u.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Premium Users */}
      {premiumUsers.length > 0 && (
        <Card title={`Premium Users (${premiumUsers.length})`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Trips</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {premiumUsers.map((u) => (
                  <tr key={u.id} onClick={() => setDetailUserId(u.id)} style={{ cursor: "pointer" }}>
                    <td style={{ fontSize: "0.8125rem" }}>{u.email}</td>
                    <td style={{ fontSize: "0.8125rem" }}>{u.displayName || "-"}</td>
                    <td style={{ fontSize: "0.8125rem" }}>{u._count.trips}</td>
                    <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{timeAgo(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recent Feedback */}
      <Card title={`Recent Feedback (${recentFeedback.length})`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Votes</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {recentFeedback.map((fb) => {
                const statusMeta = FB_STATUSES.find((s) => s.value === fb.status);
                return (
                  <tr key={fb.id}>
                    <td style={{ fontSize: "0.8125rem", fontWeight: 500, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fb.title}</td>
                    <td><Badge variant="source">{FB_CATEGORY_OPTIONS.find((c) => c.value === fb.category)?.label || fb.category}</Badge></td>
                    <td>{statusMeta && <Badge variant={fb.status === "done" ? "success" : fb.status === "declined" ? "danger" : "source"}>{statusMeta.label}</Badge>}</td>
                    <td style={{ fontSize: "0.8125rem", textAlign: "center" }}>{fb.upvoteCount}</td>
                    <td style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{timeAgo(fb.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <UserDetailModal userId={detailUserId} open={!!detailUserId} onClose={() => setDetailUserId(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Ops Tab - Apple IAP webhook log + Job run log
// ---------------------------------------------------------------------------


function Overview() {
  return (
    <>
      <OverviewTab />
      <ActivityTab />
    </>
  );
}

export default function AdminOverviewPage() {
  return (
    <AdminPage title="Overview" intro="The fleet at a glance: users, trips, revenue, feedback and Teams interest.">
      <Overview />
    </AdminPage>
  );
}
