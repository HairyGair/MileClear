"use client";

import type { BusinessInsights, WeeklyPnL } from "@mileclear/shared";
import { GIG_PLATFORMS } from "@mileclear/shared";
import { BarList } from "../charts";
import { Card, EmptyState, Figure, ProGate, Skeleton, useData } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Row, Takeaway, pounds, withBoundary } from "./ui";
import s from "./insights.module.css";

const platformLabel = (v: string) => GIG_PLATFORMS.find((p) => p.value === v)?.label ?? v;

interface PnlRow {
  grossEarningsPence: number;
  expensesPence: number;
  fuelPence: number;
  netPence: number;
  trips: number;
  businessMiles: number;
}
interface PlatformPnl extends PnlRow { platform: string }
interface ProjectPnl extends PnlRow { projectLabel: string }

function perMile(pence: number) {
  return `${pounds(pence)}`;
}

function PnlList({ title, rows, name }: { title: string; rows: { key: string; name: string; net: number; gross: number }[]; name: string }) {
  return (
    <Card title={title}>
      <BarList
        label={`${name}, profit`}
        items={rows.map((r) => ({ name: r.name, value: Math.max(0, r.net), display: pounds(r.net) }))}
      />
    </Card>
  );
}

function Loaded() {
  const insights = useData<BusinessInsights>("business-insights", () => getData("/business-insights"));
  const platform = useData<PlatformPnl[]>("platform-pnl-30", () => getData("/business-insights/platform-pnl?days=30"));
  const weekly = useData<WeeklyPnL>("weekly-pnl", () => getData("/business-insights/pnl"));
  const project = useData<ProjectPnl[]>("project-pnl-90", () => getData("/business-insights/project-pnl?days=90"));

  if (insights.loading && !insights.data) return <CardLoading title="Business insights" />;
  if (insights.error) return <CardFailed title="Business insights" onRetry={insights.reload} />;
  const d = insights.data;
  if (!d) return null;

  if (d.totalEarningsPence <= 0) {
    return (
      <EmptyState
        icon="cash-outline"
        title="Add your earnings to see this"
        body="Your profit per mile, per hour and per platform show up once you've added what you were paid."
        action={{ label: "Add earnings", href: "/dashboard/earnings" }}
      />
    );
  }

  const platforms = d.platformPerformance.slice(0, 5);
  return (
    <div className={s.grid}>
      <Card title="Business insights">
        <div className={`${s.figures} ${s.three}`}>
          <Figure label="Per mile" value={perMile(d.earningsPerMilePence)} />
          <Figure label="Per hour" value={perMile(d.earningsPerHourPence)} />
          <Figure label="Earned this tax year" value={pounds(d.totalEarningsPence)} />
        </div>
        {d.goldenHours.length > 0 && (
          <>
            <p className={s.note}>Your best times to work</p>
            {d.goldenHours.map((g) => (
              <Row key={g.label} main={g.label} sub={`${g.tripCount} trips`} figure={pounds(g.avgEarningsPence)} />
            ))}
          </>
        )}
      </Card>

      {platforms.length > 0 && (
        <Card title="Platforms">
          <Takeaway>{d.bestPlatform ? `${platformLabel(d.bestPlatform)} pays you most for each mile.` : "Earnings a mile by platform."}</Takeaway>
          <BarList
            label="Earnings a mile by platform"
            items={platforms.map((p) => ({ name: platformLabel(p.platform), value: p.earningsPerMilePence, display: `${pounds(p.earningsPerMilePence)} a mile` }))}
          />
        </Card>
      )}

      {platform.loading && !platform.data ? (
        <Card title="Profit by platform, last 30 days">
          <Skeleton variant="text" count={3} />
        </Card>
      ) : platform.error ? (
        <CardFailed title="Profit by platform, last 30 days" onRetry={platform.reload} />
      ) : platform.data && platform.data.length > 0 ? (
        <PnlList title="Profit by platform, last 30 days" name="Platforms" rows={platform.data.map((p) => ({ key: p.platform, name: platformLabel(p.platform), net: p.netPence, gross: p.grossEarningsPence }))} />
      ) : null}

      {weekly.loading && !weekly.data ? (
        <Card title="Weekly profit and loss">
          <Skeleton variant="text" count={3} />
        </Card>
      ) : weekly.error ? (
        <CardFailed title="Weekly profit and loss" onRetry={weekly.reload} />
      ) : weekly.data ? (
        <Card title="Weekly profit and loss">
          <Takeaway>{weekly.data.periodLabel}</Takeaway>
          <Row main="Earned" figure={pounds(weekly.data.grossEarningsPence)} />
          <Row main="Fuel (estimate)" figure={`-${pounds(weekly.data.estimatedFuelCostPence)}`} />
          <Row main="Wear and tear (estimate)" figure={`-${pounds(weekly.data.estimatedWearCostPence)}`} />
          <Row main="Left over" figure={pounds(weekly.data.netProfitPence)} />
        </Card>
      ) : null}

      {project.data && project.data.length > 0 && (
        <PnlList title="Profit by project" name="Projects" rows={project.data.map((p) => ({ key: p.projectLabel, name: p.projectLabel, net: p.netPence, gross: p.grossEarningsPence }))} />
      )}

      {(d.fuelCostPerMilePence !== null || d.actualMpg !== null) && (
        <Card title="Fuel economy">
          <div className={s.figures}>
            {d.fuelCostPerMilePence !== null && <Figure label="Fuel a mile" value={`${(d.fuelCostPerMilePence).toFixed(1)}p`} />}
            {d.actualMpg !== null && <Figure label="Miles per gallon" value={d.actualMpg.toFixed(1)} />}
          </div>
        </Card>
      )}
    </div>
  );
}

/** The Work block on Insights: gig drivers only, Pro. */
function WorkInsightsImpl(): React.ReactElement {
  return (
    <ProGate reason="insights" teaser={<p>Your profit per mile, per hour and per platform.</p>}>
      <Loaded />
    </ProGate>
  );
}

export const WorkInsights = withBoundary(WorkInsightsImpl);
