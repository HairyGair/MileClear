"use client";

import { useState } from "react";
import type { CommunityInsights } from "@mileclear/shared";
import { GIG_PLATFORMS } from "@mileclear/shared";
import { BarList } from "../charts";
import { Button, Card, ProGate, useData } from "../kit";
import { getData } from "./data";
import { CardFailed, CardLoading, Row, pounds, withBoundary } from "./ui";
import s from "./insights.module.css";

const platformLabel = (v: string) => GIG_PLATFORMS.find((p) => p.value === v)?.label ?? v;

function Loaded({ lat, lng }: { lat: number; lng: number }) {
  const { data, error, loading, reload } = useData<CommunityInsights>(`community-insights-${lat.toFixed(2)}-${lng.toFixed(2)}`, () =>
    getData(`/community-insights?lat=${lat}&lng=${lng}`)
  );
  if (loading && !data) return <CardLoading title="Community insights" />;
  if (error) return <CardFailed title="Community insights" onRetry={reload} />;
  if (!data) return null;
  const earn = data.areaEarnings.slice(0, 5);
  return (
    <Card title="Community insights">
      <Row main="MileClear drivers nearby" figure={data.stats.driversNearby.toLocaleString("en-GB")} />
      {data.bestPlatformNearby && <Row main="Best platform nearby" figure={platformLabel(data.bestPlatformNearby)} />}
      {data.bestTimeNearby && <Row main="Best time nearby" figure={data.bestTimeNearby} />}
      {earn.length > 0 && (
        <>
          <p className={s.note}>Earnings a mile by platform, near you.</p>
          <BarList label="Earnings a mile by platform" items={earn.map((e) => ({ name: platformLabel(e.platform), value: e.earningsPerMilePence, display: pounds(e.earningsPerMilePence) }))} />
        </>
      )}
    </Card>
  );
}

/** What nearby drivers see (Pro). Asks the browser for your location once, when you press the button. */
function CommunityInsightsCardImpl(_props: { mode?: "work" | "personal" }): React.ReactElement {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const ask = () => {
    if (!navigator.geolocation) {
      setProblem("Your browser can't share a location.");
      return;
    }
    setAsking(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setAsking(false);
      },
      () => {
        setProblem("We couldn't get your location. Allow it in your browser and try again.");
        setAsking(false);
      },
      { timeout: 10000 }
    );
  };

  return (
    <ProGate reason="community" teaser={<p>See which platforms and times pay best near you.</p>}>
      {pos ? (
        <Loaded lat={pos.lat} lng={pos.lng} />
      ) : (
        <Card title="Community insights">
          <p className={s.note}>See which platforms and times pay best near you. Your location is used once and not stored.</p>
          {problem && (
            <p className={s.note} role="alert">
              {problem}
            </p>
          )}
          <Button variant="secondary" size="sm" loading={asking} onClick={ask}>
            Use my location
          </Button>
        </Card>
      )}
    </ProGate>
  );
}

export const CommunityInsightsCard = withBoundary(CommunityInsightsCardImpl);
