"use client";

import { useMe } from "../../lib/dashboard/useMe";
import { greeting } from "../../lib/dashboard/format";
import { Button } from "../../components/dashboard/kit/Button";
import { PageHeader } from "../../components/dashboard/kit/PageHeader";
import {
  DataQualityBanner,
  HomeGrid,
  MoreForYou,
  NominateManagerCard,
  ProNudge,
  SetupChecklist,
} from "../../components/dashboard/home";
import { WorkHeroCard } from "../../components/dashboard/tax/WorkHeroCard";
import { TaxReadinessCard } from "../../components/dashboard/tax/TaxReadinessCard";
import { SaCountdownCard } from "../../components/dashboard/tax/SaCountdownCard";
import { JourneyMapCard } from "../../components/dashboard/trips/JourneyMapCard";
import { BusinessMileageCard } from "../../components/dashboard/trips/BusinessMileageCard";
import { OdometerPromptCard } from "../../components/dashboard/driving/OdometerPromptCard";
import { RoadAlertsCard } from "../../components/dashboard/driving/RoadAlertsCard";
import { ShiftSuggestionCard } from "../../components/dashboard/driving/ShiftSuggestionCard";
import { CommunityMonthCard } from "../../components/dashboard/insights/CommunityMonthCard";
import { WeeklyGoalCard } from "../../components/dashboard/insights/WeeklyGoalCard";
import { DailyRecapCard } from "../../components/dashboard/insights/DailyRecapCard";
import { HeatmapCard } from "../../components/dashboard/insights/HeatmapCard";
import { BenchmarkCard } from "../../components/dashboard/insights/BenchmarkCard";
import { LocalBenchmarkCard } from "../../components/dashboard/insights/LocalBenchmarkCard";
import { WorkCalendarCard } from "../../components/dashboard/insights/WorkCalendarCard";
import { CommunityInsightsCard } from "../../components/dashboard/insights/CommunityInsightsCard";
import { PersonalSummaryCard } from "../../components/dashboard/insights/PersonalSummaryCard";
import { MilestoneCard } from "../../components/dashboard/insights/MilestoneCard";
import { MonthlyHistoryCard } from "../../components/dashboard/insights/MonthlyHistoryCard";
import { DrivingPatternsCard } from "../../components/dashboard/insights/DrivingPatternsCard";

// Fixed order per mode (no layout endpoint exists). Cards load their own data
// and render nothing when they have nothing to show.
export default function HomePage() {
  const { user, mode } = useMe();
  const name = user?.displayName?.trim().split(/\s+/)[0];
  const title = name ? `${greeting()}, ${name}` : greeting();

  return (
    <div className="mc-home">
      <PageHeader title={title} docTitle="Home" primary={<Button variant="primary" href="/dashboard/trips/new">Add a trip</Button>} />
      <DataQualityBanner />
      <SetupChecklist />
      {mode === "work" && <NominateManagerCard />}
      <ProNudge />

      {mode === "work" ? (
        <>
          <HomeGrid hero={<WorkHeroCard mode="work" />}>
            <OdometerPromptCard mode="work" />
            <RoadAlertsCard mode="work" />
            <TaxReadinessCard mode="work" />
            <SaCountdownCard mode="work" />
            <JourneyMapCard mode="work" />
            <ShiftSuggestionCard mode="work" />
            <CommunityMonthCard mode="work" />
          </HomeGrid>
          <MoreForYou>
            <BusinessMileageCard mode="work" />
            <WeeklyGoalCard mode="work" />
            <DailyRecapCard mode="work" />
            <HeatmapCard mode="work" />
            <BenchmarkCard mode="work" />
            <LocalBenchmarkCard mode="work" />
            <WorkCalendarCard mode="work" />
            <CommunityInsightsCard mode="work" />
          </MoreForYou>
        </>
      ) : (
        <>
          <HomeGrid hero={<PersonalSummaryCard mode="personal" />}>
            <RoadAlertsCard mode="personal" />
            <MilestoneCard mode="personal" />
            <MonthlyHistoryCard mode="personal" />
            <JourneyMapCard mode="personal" />
            <CommunityMonthCard mode="personal" />
          </HomeGrid>
          <MoreForYou>
            <DailyRecapCard mode="personal" />
            <DrivingPatternsCard mode="personal" />
            <LocalBenchmarkCard mode="personal" />
            <CommunityInsightsCard mode="personal" />
          </MoreForYou>
        </>
      )}
    </div>
  );
}
