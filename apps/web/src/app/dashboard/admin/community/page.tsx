"use client";

// Community numbers: what the whole fleet did in one finished UK month, the
// same figures as the public mileclear.com/community page, plus two or three
// ready-to-paste social posts. One endpoint, GET /admin/community/monthly.
// Privacy floor: no figure unless 10 drivers stand behind it (the API blanks
// anything under that, so this page can never show more than the public one).

import { useState } from "react";
import type { AdminCommunityMonthly, CommunityPostVariant } from "@mileclear/shared";
import {
  BarList,
  EmptyState,
  Grid,
  KpiCard,
  LoadState,
  LoadingSkeleton,
  PageHeader,
  Panel,
  SelectField,
  formatNumber,
  useAdminData,
} from "@/components/admin/ui";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** "Wed 30 Sept": short enough for a KPI card. */
function dayLabel(day: { date: string; weekday: string }): string {
  return `${day.weekday.slice(0, 3)} ${Number(day.date.slice(8, 10))} ${MONTHS[Number(day.date.slice(5, 7)) - 1].slice(0, 3)}`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button type="button" className="adm-btn adm-btn--sm" onClick={copy} aria-label={`Copy the ${label} post`}>
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>
    </button>
  );
}

function Post({ post }: { post: CommunityPostVariant }) {
  return (
    <div>
      <div className="adm-post__head">
        <p className="adm-post__label">{post.label}</p>
        <CopyButton text={post.text} label={post.label} />
      </div>
      <pre className="adm-post">{post.text}</pre>
    </div>
  );
}

export default function AdminCommunityPage() {
  const [month, setMonth] = useState<string | null>(null);
  const { data, error, loading, reload } = useAdminData<AdminCommunityMonthly>(
    `/admin/community/monthly${month ? `?month=${month}` : ""}`,
  );
  const first = loading && !data;
  const show = data?.published ? data : null;
  const dash = "-";

  return (
    <>
      <PageHeader
        title="Community numbers"
        subtitle="What every MileClear driver did together in one finished month, and posts to share it."
        updatedAt={data?.generatedAt}
        actions={
          <>
            {data && data.months.length > 0 ? (
              <SelectField
                id="community-month"
                label="Month"
                value={data.month}
                onChange={setMonth}
                options={data.months.map((m) => ({ value: m, label: monthLabel(m) }))}
                minWidth={170}
              />
            ) : null}
            <a
              className="adm-btn"
              href={data && data.months[0] !== data.month ? `/community/${data.month}` : "/community"}
              target="_blank"
              rel="noopener noreferrer"
            >
              Public page
            </a>
          </>
        }
      />

      {data && !data.published ? (
        <Panel>
          <EmptyState title={`${monthLabel(data.month)} is not published`}>
            Fewer than {data.privacyFloor} drivers recorded a trip that month, so nothing is shown here or on the public page.
          </EmptyState>
        </Panel>
      ) : null}

      <Grid min={180}>
        <KpiCard label="Active drivers" value={show?.activeDrivers ?? dash} hint="At least one real trip" loading={first} error={error} />
        <KpiCard label="Miles" value={show?.totalMiles ?? dash} loading={first} error={error} />
        <KpiCard label="Trips" value={show?.trips ?? dash} loading={first} error={error} />
        <KpiCard label="Business miles" value={show?.businessMiles ?? dash} loading={first} error={error} />
        <KpiCard
          label="Claim value (estimate)"
          value={show?.claimValuePence != null ? `£${Math.round(show.claimValuePence / 100).toLocaleString("en-GB")}` : dash}
          hint="At the HMRC mileage rates"
          tone="accent"
          loading={first}
          error={error}
        />
        <KpiCard label="New drivers" value={show?.newDrivers ?? dash} hint="Accounts created that month" loading={first} error={error} />
        <KpiCard
          label="Recorded automatically"
          value={show?.autoRecordedPct != null ? `${show.autoRecordedPct}%` : dash}
          loading={first}
          error={error}
        />
        <KpiCard
          label="Busiest day"
          value={show?.busiestDay ? dayLabel(show.busiestDay) : dash}
          hint={show?.busiestDay ? `${formatNumber(show.busiestDay.trips)} trips` : undefined}
          loading={first}
          error={error}
        />
      </Grid>

      <div className="adm-split">
        <Panel
          title="Ready-made posts"
          subtitle="Plain text for the Facebook group and socials. Check the numbers read right before posting."
          highlight
        >
          <LoadState
            data={data}
            loading={loading}
            error={error}
            onRetry={reload}
            errorTitle="Couldn't load the community numbers."
            skeleton={<LoadingSkeleton variant="lines" rows={8} />}
          >
            {(d) =>
              d.posts.length === 0 ? (
                <EmptyState compact title="No posts for this month">
                  Posts are only written for a published month.
                </EmptyState>
              ) : (
                <div className="adm-posts">
                  {d.posts.map((p) => (
                    <Post key={p.key} post={p} />
                  ))}
                </div>
              )
            }
          </LoadState>
        </Panel>

        <Panel
          title="Where drivers were"
          subtitle="Regions with 10 or more active drivers"
          footer={
            <p className="adm-note">
              Home region from where each driver usually starts trips (today&apos;s reading). Top platform:{" "}
              {show?.topPlatform ? `${show.topPlatform.label} (${formatNumber(show.topPlatform.drivers)} drivers)` : "not enough drivers"}.
            </p>
          }
        >
          <LoadState
            data={data}
            loading={loading}
            error={error}
            onRetry={reload}
            errorTitle="Couldn't load the regions."
            skeleton={<LoadingSkeleton variant="lines" rows={5} />}
          >
            {(d) =>
              d.topRegions.length === 0 ? (
                <EmptyState compact title="No region reaches 10 drivers" />
              ) : (
                <BarList
                  label="Active drivers by region"
                  items={d.topRegions.map((r) => ({ key: r.region, label: r.region, value: r.drivers }))}
                />
              )
            }
          </LoadState>
        </Panel>
      </div>

      <p className="adm-note">
        Counts exclude phantom trips and the newer copy of a flagged double-count. The claim value prices each
        driver&apos;s business miles at the HMRC mileage rates for the trip&apos;s tax year, with the 10,000-mile step
        per driver and vehicle type; a trip with no vehicle is priced as a car, and employer rates are ignored.
        Numbers are cached for a day.
      </p>
    </>
  );
}
