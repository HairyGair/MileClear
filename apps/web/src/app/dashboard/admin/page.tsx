"use client";

// Overview of the admin area (Oct 2026 rebuild). Every panel loads its own
// data, so one slow or failing endpoint never blanks the page.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Ago } from "@/components/admin/Ago";
import { UserDetailModal } from "@/components/admin/UserDetailModal";
import type { AdminUser, Analytics, FbItem } from "@/components/admin/legacy";
import { FB_CATEGORY_OPTIONS, FB_STATUSES } from "@/components/admin/legacy";
import { AcquisitionPanel } from "@/components/admin/panels/AcquisitionPanel";
import { QrScansPanel } from "@/components/admin/panels/QrScansPanel";
import type { EngagementData, RatingDiagnostics, RevenueData, SupportQueueData, TripQualityData } from "@/components/admin/panels/types";
import { useRecentSignups, type RecentSignups } from "@/components/admin/panels/useRecentSignups";
import {
  AdminIcon,
  Badge,
  BarChart,
  DataTable,
  EmptyState,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  ProgressBar,
  StatLine,
  TabBar,
  Tabs,
  formatDay,
  formatMonth,
  formatNumber,
  formatPence,
  formatShare,
  useAdminData,
  type AdminData,
  type TableColumn,
  type Tone,
} from "@/components/admin/ui";

const A = "/dashboard/admin";

// ---------------------------------------------------------------------------
// KPI row
// ---------------------------------------------------------------------------

type SignupsState = AdminData<RecentSignups>;

function KpiRow({ analytics, signups }: { analytics: AdminData<Analytics>; signups: SignupsState }) {
  const revenue = useAdminData<RevenueData>("/admin/revenue");
  const a = analytics.data;
  const s = signups.data;

  const last7 = s ? s.days.slice(-7).reduce((n, d) => n + d.count, 0) : 0;
  const prev7 = s ? s.days.slice(-14, -7).reduce((n, d) => n + d.count, 0) : 0;
  const nonPaying = a ? (a.compPro ?? 0) + (a.referralPro ?? 0) + (a.sandboxPro ?? 0) : 0;

  return (
    <Grid min={150}>
      <KpiCard
        label="Total users"
        value={a?.totalUsers ?? 0}
        loading={analytics.loading && !a}
        error={analytics.error}
        hint={a ? `${formatNumber(a.usersThisMonth)} joined this month` : undefined}
        href={`${A}/users`}
      />
      <KpiCard
        label="New sign-ups today"
        value={s?.todaySoFar ?? 0}
        tone="accent"
        loading={signups.loading && !s}
        error={signups.error}
        delta={s ? { current: s.todaySoFar, previous: s.yesterdaySameTime, label: "vs this time yesterday" } : undefined}
        href={`${A}/geography`}
        title="Where are they? Open Sign-ups & geography"
      />
      <KpiCard
        label="New sign-ups, last 7 days"
        value={last7}
        loading={signups.loading && !s}
        error={signups.error}
        delta={s ? { current: last7, previous: prev7, label: "vs the 7 days before" } : undefined}
        sparkline={s ? s.days.slice(-14).map((d) => d.count) : undefined}
        sparklineLabel="Sign-ups per day, last 14 days"
        href={`${A}/geography`}
      />
      <KpiCard
        label="Active drivers, 30 days"
        value={a?.activeUsers30d ?? 0}
        tone="good"
        loading={analytics.loading && !a}
        error={analytics.error}
        hint={a ? `${formatShare(a.activeUsers30d, a.totalUsers)} of all users logged a trip` : undefined}
        href={`${A}/growth`}
      />
      <KpiCard
        label="Paying subscribers"
        value={a ? (a.payingSubscribers ?? a.premiumUsers) : 0}
        tone="accent"
        loading={analytics.loading && !a}
        error={analytics.error}
        hint={
          a && a.payingSubscribers !== undefined
            ? `+${formatNumber(nonPaying)} on Pro without paying (${a.compPro ?? 0} comp, ${a.referralPro ?? 0} referral, ${a.sandboxPro ?? 0} test)`
            : undefined
        }
        title="Pro users who are not paying: admin comp grants, referral credit, and App Store sandbox (TestFlight / App Review) subscriptions"
        href={`${A}/revenue`}
      />
      <KpiCard
        label="Monthly recurring revenue"
        value={revenue.data ? formatPence(revenue.data.mrrPence) : ""}
        loading={revenue.loading && !revenue.data}
        error={revenue.error}
        hint={revenue.data ? `${revenue.data.churnedLast30d} cancelled in 30 days (${revenue.data.churnRatePercent}%)` : undefined}
        title="Monthly at £4.99, annual at £44.99 / 12. Comp, referral and sandbox Pro are never priced."
        href={`${A}/revenue`}
      />
    </Grid>
  );
}

// ---------------------------------------------------------------------------
// Sign-ups trend
// ---------------------------------------------------------------------------

function SignupsPanel({ daily }: { daily: SignupsState }) {
  const [view, setView] = useState<"daily" | "monthly">("daily");
  const engagement = useAdminData<EngagementData>(view === "monthly" ? "/admin/engagement" : null);

  return (
    <Panel
      highlight
      title="New sign-ups"
      subtitle={view === "daily" ? "Accounts opened each day, last 30 days. Today is still filling in." : "Accounts opened each month, last 6 months."}
      actions={
        <TabBar
          label="Sign-ups view"
          size="sm"
          value={view}
          onChange={(v) => setView(v as "daily" | "monthly")}
          tabs={[
            { id: "daily", label: "Daily" },
            { id: "monthly", label: "Monthly" },
          ]}
        />
      }
      footer={
        <>
          {view === "daily"
            ? "Counted from the users list, so deleted accounts are not included. "
            : "From the retention report. "}
          <Link href={`${A}/geography`} className="adm-link-arrow">
            See where they are <AdminIcon name="arrowRight" size={14} />
          </Link>
        </>
      }
    >
      {view === "daily" ? (
        <LoadState
          data={daily.data}
          loading={daily.loading}
          error={daily.error}
          onRetry={daily.reload}
          errorTitle="Couldn't count the sign-ups."
          skeleton={<LoadingSkeleton variant="chart" height={240} />}
        >
          {(d) => (
            <>
              <BarChart
                label="New sign-ups per day, last 30 days"
                unit="sign-ups"
                height={240}
                partialIndex={d.days.length - 1}
                data={d.days.map((x) => ({
                  label: formatDay(x.date, { day: "numeric", month: "short" }),
                  fullLabel: formatDay(x.date),
                  value: x.count,
                }))}
              />
              {!d.complete && <p className="adm-note" style={{ marginTop: "var(--adm-s2)" }}>The earliest days may be short: the list ran out of pages before reaching them.</p>}
            </>
          )}
        </LoadState>
      ) : (
        <LoadState
          data={engagement.data}
          loading={engagement.loading}
          error={engagement.error}
          onRetry={engagement.reload}
          errorTitle="Couldn't load monthly sign-ups."
          skeleton={<LoadingSkeleton variant="chart" height={240} />}
        >
          {(d) => (
            <BarChart
              label="New sign-ups per month, last 6 months"
              unit="sign-ups"
              height={240}
              partialIndex={d.retentionCurve.length - 1}
              data={d.retentionCurve.map((r) => ({ label: formatMonth(r.month, { month: "short" }), fullLabel: formatMonth(r.month, { month: "long", year: "numeric" }), value: r.signups }))}
            />
          )}
        </LoadState>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Section hubs
// ---------------------------------------------------------------------------

function ageTone(hours: number): Tone {
  if (hours < 24) return "good";
  if (hours < 72) return "warn";
  return "bad";
}

function ageText(hours: number): string {
  if (hours < 1) return "under an hour";
  if (hours < 48) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}

function SupportHub() {
  const { data, error, loading, reload } = useAdminData<SupportQueueData>("/admin/support-queue");
  return (
    <Panel title="Waiting on a reply" href={`${A}/support`} hrefLabel="Open support">
      <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the support queue.">
        {(d) => {
          const oldest = d.items[0];
          if (d.counts.total === 0) {
            return <EmptyState compact title="Nobody is waiting">Every feedback thread and missing-trip report has an answer.</EmptyState>;
          }
          return (
            <div className="adm-hub">
              <div className="adm-hub__row">
                <div className="adm-figure">
                  <span className="adm-figure__value">{formatNumber(d.counts.total)}</span>
                  <span className="adm-figure__label">{d.counts.total === 1 ? "person" : "people"} waiting</span>
                </div>
                {oldest && (
                  <Badge tone={ageTone(oldest.ageHours)} dot size="md">
                    Oldest: {ageText(oldest.ageHours)}
                  </Badge>
                )}
              </div>
              <div>
                <StatLine label="Feedback threads" value={formatNumber(d.counts.feedbackOpen)} />
                <StatLine label="Missing-trip reports" value={<Link href={`${A}/missing-trips`} className="adm-link-arrow">{formatNumber(d.counts.missingTripsOpen)}</Link>} />
              </div>
              {oldest && (
                <p className="adm-note">
                  Oldest: {oldest.displayName || oldest.email || "(anonymous)"}, {oldest.kind === "missing_trip" ? "missing trip" : "feedback"}, <Ago iso={oldest.at} />.
                </p>
              )}
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}

function CaptureHub() {
  const { data, error, loading, reload } = useAdminData<TripQualityData>("/admin/trip-quality");
  return (
    <Panel title="Capture health" href={`${A}/capture`} hrefLabel="Details">
      <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load capture health.">
        {(d) => {
          const stubTone: Tone = d.stubRate === null ? "neutral" : d.stubRate < 5 ? "good" : d.stubRate < 15 ? "warn" : "bad";
          return (
            <div className="adm-hub">
              <div className="adm-hub__row">
                <div className="adm-figure">
                  <span className="adm-figure__value">{formatNumber(d.autoTrips)}</span>
                  <span className="adm-figure__label">trips captured in {d.days} days</span>
                </div>
              </div>
              {d.stubRate !== null && (
                <ProgressBar
                  label="Stub trips (3 points or fewer)"
                  value={d.stubRate}
                  max={Math.max(20, d.stubRate)}
                  valueLabel={`${d.stubRate}%`}
                  tone={stubTone}
                  size="sm"
                />
              )}
              <div>
                <StatLine label="Added by hand" value={formatNumber(d.manualTrips)} />
                <StatLine label="Flagged as phantom" value={formatNumber(d.phantomFlagged)} />
                <StatLine label="Missing-trip reports" value={formatNumber(d.events.missingReports)} />
              </div>
            </div>
          );
        }}
      </LoadState>
    </Panel>
  );
}

function GeographyHub() {
  return (
    <Panel title="Where new drivers are" href={`${A}/geography`} hrefLabel="Open map">
      <div className="adm-hub">
        <p className="adm-text">Sign-ups by town and region, and which areas are growing. The full view lives under Growth.</p>
        <div style={{ display: "flex", gap: "var(--adm-s2)", flexWrap: "wrap", marginTop: "auto" }}>
          <Link href={`${A}/geography`} className="adm-btn adm-btn--primary">
            <AdminIcon name="geography" size={16} /> Sign-ups & geography
          </Link>
          <Link href={`${A}/geographic-density`} className="adm-btn">Density map</Link>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Fleet numbers (tabs)
// ---------------------------------------------------------------------------

function TotalsTab({ a }: { a: Analytics }) {
  return (
    <Grid min={170} gap="sm">
      <KpiCard label="Total trips" value={a.totalTrips} />
      <KpiCard label="Total miles" value={`${formatNumber(Math.round(a.totalMiles))} mi`} />
      <KpiCard label="Total earnings logged" value={formatPence(a.totalEarningsPence)} tone="good" />
      <KpiCard label="New users this month" value={a.usersThisMonth} />
      <KpiCard label="Trips this month" value={a.tripsThisMonth} />
      {a.platformCounts && (
        <KpiCard
          label="Platforms"
          value={`${formatNumber(a.platformCounts.ios)} / ${formatNumber(a.platformCounts.android)}`}
          hint={`Apple / Android. Both ${formatNumber(a.platformCounts.both)}, web only ${formatNumber(a.platformCounts.web)}, unknown ${formatNumber(a.platformCounts.unknown)}`}
        />
      )}
    </Grid>
  );
}

function ReferralsTab({ a }: { a: Analytics }) {
  if (!a.referrals) return <EmptyState compact title="No referral figures">The analytics response has no referral block.</EmptyState>;
  return (
    <Grid min={170} gap="sm">
      <KpiCard label="Friends signed up" value={a.referrals.attached} hint="Joined with a referral code" />
      <KpiCard label="Free months granted" value={a.referrals.qualified} tone="good" hint="The friend recorded a first trip" />
      <KpiCard label="On referral Pro now" value={a.referrals.activeCreditUsers} tone="accent" />
    </Grid>
  );
}

function RatingTab({ a }: { a: Analytics }) {
  const diag = useAdminData<RatingDiagnostics>("/admin/rating/diagnostics");
  const f = a.ratingFunnel;
  const buildCols: TableColumn<RatingDiagnostics["byBuild"][number]>[] = [
    {
      key: "build",
      header: "Build at the time",
      render: (b) => `${b.appVersion ? `${b.appVersion} ` : ""}(build ${b.buildNumber})`,
      sortValue: (b) => Number(b.buildNumber) || 0,
    },
    { key: "count", header: "Love it! taps", numeric: true, sortValue: (b) => b.count },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s5)" }}>
      {f && f.promptsShown > 0 ? (
        <div>
          <p className="adm-note" style={{ marginBottom: "var(--adm-s3)" }}>App Store rating prompt</p>
          <Grid min={140} gap="sm">
            <KpiCard label="Prompts shown" value={f.promptsShown} />
            <KpiCard label="Love it!" value={f.loveIt} tone="good" hint={formatShare(f.loveIt, f.promptsShown)} />
            <KpiCard label="Apple dialog asked for" value={f.nativeDialogRequested} tone="good" />
            <KpiCard label="Could be better" value={f.couldBeBetter} tone="warn" hint={formatShare(f.couldBeBetter, f.promptsShown)} />
            <KpiCard label="Already rated" value={f.alreadyRated} />
            <KpiCard label="Not now" value={f.notNow} />
          </Grid>
        </div>
      ) : (
        <EmptyState compact title="No rating prompts shown yet" />
      )}
      <LoadState data={diag.data} loading={diag.loading} error={diag.error} onRetry={diag.reload} errorTitle="Couldn't load the rating diagnostics.">
        {(d) =>
          d.totalLoveItEvents === 0 ? null : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s3)" }}>
              <p className="adm-note">Why Love it! taps don&apos;t all turn into ratings</p>
              <Grid min={150} gap="sm">
                <KpiCard label="Distinct users" value={d.distinctUsers} hint="Tapped Love it! at least once" />
                <KpiCard label="Asked once" value={d.usersWithSinglePrompt} hint="One Love it! tap" />
                <KpiCard label="Asked twice or more" value={d.usersWithRepeat} tone={d.usersWithRepeat > 0 ? "warn" : "neutral"} hint="Likely hitting Apple's 3 a year limit" />
                <KpiCard label="Asked 3 times or more" value={d.usersAt3Plus} tone={d.usersAt3Plus > 0 ? "bad" : "neutral"} hint="Apple almost certainly showed nothing" />
              </Grid>
              {d.byBuild.length > 0 && (
                <DataTable
                  caption="Love it! taps by app build"
                  columns={buildCols}
                  rows={d.byBuild}
                  rowKey={(b) => b.buildNumber}
                  dense
                  maxHeight={260}
                />
              )}
              <p className="adm-note">Public App Store builds carry through to App Store Connect; Apple silently drops TestFlight ones.</p>
            </div>
          )
        }
      </LoadState>
    </div>
  );
}

function FeedbackTab() {
  const { data, error, loading, reload } = useAdminData<{ total: number; byStatus: Record<string, number> }>("/feedback/stats");
  return (
    <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load the feedback counts.">
      {(d) => (
        <Grid min={150} gap="sm">
          <KpiCard label="All feedback" value={d.total} href={`${A}/support`} />
          <KpiCard label="New" value={d.byStatus["new"] || 0} tone="info" />
          <KpiCard label="Planned" value={d.byStatus["planned"] || 0} />
          <KpiCard label="In progress" value={d.byStatus["in_progress"] || 0} tone="accent" />
        </Grid>
      )}
    </LoadState>
  );
}

function FleetPanel({ analytics }: { analytics: AdminData<Analytics> }) {
  const a = analytics.data;
  const body = (render: (a: Analytics) => ReactNode) => (
    <LoadState data={a} loading={analytics.loading} error={analytics.error} onRetry={analytics.reload} errorTitle="Couldn't load the fleet figures.">
      {render}
    </LoadState>
  );
  return (
    <Panel title="The fleet in numbers" subtitle="All-time totals, referrals, the App Store rating prompt and feedback.">
      <Tabs
        label="Fleet figures"
        tabs={[
          { id: "totals", label: "Totals", content: body((x) => <TotalsTab a={x} />) },
          { id: "referrals", label: "Referrals", content: body((x) => <ReferralsTab a={x} />) },
          { id: "rating", label: "App Store rating", content: body((x) => <RatingTab a={x} />) },
          { id: "feedback", label: "Feedback", content: <FeedbackTab /> },
        ]}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Latest activity (tabs)
// ---------------------------------------------------------------------------

function DetectionDot({ u }: { u: AdminUser }) {
  if (!u.diagnosticDump || u.diagnosticDump.verdict === "healthy") return null;
  const v = u.diagnosticDump.verdict;
  return <Badge tone={v === "error" ? "bad" : v === "warning" ? "warn" : "info"} dot title={`Detection: ${v}`}>{v}</Badge>;
}

const PRO_SOURCE_LABEL: Record<string, string> = { paying: "Paying", comp: "Comp", referral: "Referral", sandbox: "Test" };

function userColumns(extra: "status" | "pro"): TableColumn<AdminUser>[] {
  const cols: TableColumn<AdminUser>[] = [
    {
      key: "email",
      header: "User",
      render: (u) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <span>
            {u.displayName || u.email}
            {u.displayName && <span className="adm-cell-sub">{u.email}</span>}
          </span>
          <DetectionDot u={u} />
        </span>
      ),
      sortValue: (u) => u.email,
    },
  ];
  if (extra === "status") {
    cols.push({
      key: "status",
      header: "Status",
      render: (u) => (
        <span style={{ display: "inline-flex", gap: "0.25rem", flexWrap: "wrap" }}>
          {u.isPremium && <Badge tone="accent">Pro</Badge>}
          {u.isAdmin && <Badge tone="info">Admin</Badge>}
          {u.emailVerified ? <Badge tone="good">Verified</Badge> : <Badge tone="bad">Unverified</Badge>}
        </span>
      ),
    });
    cols.push({ key: "signupLocation", header: "Where", render: (u) => u.signupLocation || "-", hideOnMobile: true, sortValue: (u) => u.signupLocation ?? null });
  } else {
    cols.push({ key: "pro", header: "Pro from", render: (u) => <Badge tone={u.proSource === "paying" ? "good" : "neutral"}>{(u.proSource && PRO_SOURCE_LABEL[u.proSource]) || "Pro"}</Badge> });
    cols.push({ key: "trips", header: "Trips", numeric: true, render: (u) => formatNumber(u._count.trips), sortValue: (u) => u._count.trips });
  }
  cols.push({ key: "createdAt", header: "Joined", render: (u) => <Ago iso={u.createdAt} />, sortValue: (u) => u.createdAt, align: "right" });
  return cols;
}

function UsersListTab({ path, kind, onOpen }: { path: string; kind: "status" | "pro"; onOpen: (id: string) => void }) {
  const { data, error, loading, reload } = useAdminData<AdminUser[]>(path);
  return (
    <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load users." skeleton={<LoadingSkeleton variant="table" rows={6} />}>
      {(rows) => (
        <DataTable
          caption={kind === "pro" ? "Pro users, newest first" : "Newest sign-ups"}
          columns={userColumns(kind)}
          rows={rows}
          rowKey={(u) => u.id}
          onRowClick={(u) => onOpen(u.id)}
          maxHeight={460}
          emptyTitle="No users"
        />
      )}
    </LoadState>
  );
}

function RecentFeedbackTab() {
  const { data, error, loading, reload } = useAdminData<FbItem[]>("/feedback/?page=1&pageSize=10&sort=newest");
  const cols: TableColumn<FbItem>[] = [
    { key: "title", header: "Title", render: (f) => <span style={{ fontWeight: 500 }}>{f.title}</span>, sortValue: (f) => f.title },
    { key: "category", header: "Type", render: (f) => <Badge>{FB_CATEGORY_OPTIONS.find((c) => c.value === f.category)?.label || f.category}</Badge>, hideOnMobile: true },
    {
      key: "status",
      header: "Status",
      render: (f) => {
        const meta = FB_STATUSES.find((s) => s.value === f.status);
        return meta ? <Badge tone={f.status === "done" ? "good" : f.status === "declined" ? "bad" : "neutral"}>{meta.label}</Badge> : f.status;
      },
    },
    { key: "votes", header: "Votes", numeric: true, render: (f) => f.upvoteCount, sortValue: (f) => f.upvoteCount, hideOnMobile: true },
    { key: "createdAt", header: "Sent", render: (f) => <Ago iso={f.createdAt} />, sortValue: (f) => f.createdAt, align: "right" },
  ];
  return (
    <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load feedback." skeleton={<LoadingSkeleton variant="table" rows={6} />}>
      {(rows) => <DataTable caption="Newest feedback" columns={cols} rows={rows} rowKey={(f) => f.id} maxHeight={460} emptyTitle="No feedback yet" />}
    </LoadState>
  );
}

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
  totals: { submissions: number; companies: number; estimatedDrivers: number; tenPlusCompanies: number };
}

const APPROVAL_LABEL: Record<string, string> = {
  monthly_signoff: "Monthly sign-off",
  line_by_line: "Line by line",
  view_only: "View only",
};

function TeamsTab() {
  const { data, error, loading, reload } = useAdminData<TeamInterestResponse>("/admin/team-interest", { unwrap: false });
  const cols: TableColumn<TeamInterestRow>[] = [
    {
      key: "who",
      header: "Who",
      render: (r) => (
        <>
          {r.company || r.email.split("@")[1]}
          <span className="adm-cell-sub">{r.email}{r.source ? `, via /${r.source}` : ""}</span>
        </>
      ),
      sortValue: (r) => r.company ?? r.email,
    },
    { key: "drivers", header: "Drivers", render: (r) => r.drivers, numeric: true },
    { key: "approval", header: "Approval", render: (r) => APPROVAL_LABEL[r.approval] ?? r.approval, hideOnMobile: true },
    { key: "destination", header: "Figures go to", render: (r) => `${r.destination.replace("_", " ")}${r.destinationDetail ? ` (${r.destinationDetail})` : ""}`, hideOnMobile: true },
    { key: "notes", header: "Notes", render: (r) => <span style={{ color: "var(--adm-text-2)" }}>{r.notes || "-"}</span>, hideOnMobile: true },
    { key: "createdAt", header: "When", render: (r) => new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), sortValue: (r) => r.createdAt, align: "right" },
  ];
  return (
    <LoadState data={data} loading={loading} error={error} onRetry={reload} errorTitle="Couldn't load Teams interest.">
      {(d) => (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)" }}>
          <Grid min={200} gap="sm">
            <KpiCard label="Companies" value={d.totals.companies} hint={`${formatNumber(d.totals.submissions)} submissions`} />
            <KpiCard label="Drivers (estimate)" value={d.totals.estimatedDrivers} hint="Band midpoints 3 / 13 / 35 / 75. Indicative, not a count." />
            <div className="adm-kpi">
              <p className="adm-kpi__label">Companies with 10+ drivers</p>
              <div style={{ marginTop: "var(--adm-s3)" }}>
                <ProgressBar
                  value={d.totals.tenPlusCompanies}
                  max={5}
                  valueLabel={`${d.totals.tenPlusCompanies} of 5`}
                  tone={d.totals.tenPlusCompanies >= 5 ? "good" : "accent"}
                  label="Target set 21 Aug 2026"
                />
              </div>
            </div>
          </Grid>
          <DataTable
            caption="Teams interest register"
            columns={cols}
            rows={d.data.slice(0, 25)}
            rowKey={(r) => r.id}
            maxHeight={420}
            emptyTitle="Nobody has registered yet"
            empty="The form is on /teams and /employee-mileage-tracker."
          />
        </div>
      )}
    </LoadState>
  );
}

function ActivityPanel() {
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  return (
    <Panel title="Latest activity" subtitle="Click a user to open their full record.">
      <Tabs
        label="Latest activity"
        tabs={[
          { id: "signups", label: "New sign-ups", content: <UsersListTab kind="status" path="/admin/users?page=1&pageSize=15&sortBy=createdAt" onOpen={setDetailUserId} /> },
          { id: "pro", label: "Pro users", content: <UsersListTab kind="pro" path="/admin/users?page=1&pageSize=15&sortBy=createdAt&plan=premium" onOpen={setDetailUserId} /> },
          { id: "feedback", label: "Feedback", content: <RecentFeedbackTab /> },
          { id: "teams", label: "Teams interest", content: <TeamsTab /> },
        ]}
      />
      <UserDetailModal userId={detailUserId} open={!!detailUserId} onClose={() => setDetailUserId(null)} />
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminOverviewPage() {
  const analytics = useAdminData<Analytics>("/admin/analytics");
  // One fetch of the daily sign-ups, shared by the KPI row and the chart.
  const signups = useRecentSignups(30);
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Who is joining, who is driving, who is paying, and who is waiting on a reply."
        actions={
          <>
            <Link href={`${A}/geography`} className="adm-btn adm-btn--primary">
              <AdminIcon name="geography" size={16} /> Sign-ups & geography
            </Link>
            <Link href={`${A}/users`} className="adm-btn">
              <AdminIcon name="users" size={16} /> All users
            </Link>
          </>
        }
      />

      <KpiRow analytics={analytics} signups={signups} />

      <div className="adm-split">
        <SignupsPanel daily={signups} />
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--adm-s4)", minWidth: 0 }}>
          <SupportHub />
          <GeographyHub />
        </div>
      </div>

      <Grid min={300}>
        <AcquisitionPanel />
        <QrScansPanel />
        <CaptureHub />
      </Grid>

      <FleetPanel analytics={analytics} />
      <ActivityPanel />
    </>
  );
}
