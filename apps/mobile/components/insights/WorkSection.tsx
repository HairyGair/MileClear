// Where the Work-mode cards sit on Insights (SPEC-UX section 2). The cards
// themselves are Developer B2's; this file only places them, so the order
// lives in one spot and merges cleanly.
//
// Work mode, gig or both:   1 Summary (frame) / 2 Tax year so far / 3 Your
//   platforms / 4 Coming up (frame) / 5 When you drive / 6 Drivers near you /
//   6 Last shift / 7 Records + Badges (frame) / 8 Go deeper.
// Employee or company driver: no platforms.
//
// Each card renders nothing when it has nothing to show.

import type { ReactNode } from "react";
import TaxYearProgressCard from "./TaxYearProgressCard";
import PlatformLeagueCard from "./PlatformLeagueCard";
import WhenYouDriveCard from "./WhenYouDriveCard";
import DriversNearYouCard from "./DriversNearYouCard";
import GoDeeper from "./GoDeeper";
import LastShiftCard from "./LastShiftCard";
import type { InsightsPeriod } from "../../lib/insights/period";

export interface WorkCardProps {
  period: InsightsPeriod;
  offset: number;
  mode: "work" | "personal";
  isPro: boolean;
  /** Bumped on focus and pull to refresh so every card reloads with the frame. */
  refreshToken?: number;
}

interface WorkSectionProps extends WorkCardProps {
  /** Employee or company driver: no earnings or platform cards. */
  isCompanyDriver: boolean;
  /** Under 10 trips: Drivers near you and Go deeper wait (SPEC-UX section 12). */
  showDriversNearYou: boolean;
  showGoDeeper: boolean;
  /** The frame's own cards, slotted between B2's groups. */
  comingUp: ReactNode;
  recordsAndBadges: ReactNode;
}

/** Cards between the summary and the end of the screen, in Work order. */
export function WorkSection(p: WorkSectionProps) {
  const card: WorkCardProps = { period: p.period, offset: p.offset, mode: p.mode, isPro: p.isPro, refreshToken: p.refreshToken };
  return (
    <>
      <TaxYearProgressCard {...card} />
      {!p.isCompanyDriver && <PlatformLeagueCard {...card} />}
      {p.comingUp}
      <WhenYouDriveCard {...card} />
      {!p.isCompanyDriver && <LastShiftCard {...card} />}
      {p.showDriversNearYou && <DriversNearYouCard {...card} />}
      {p.recordsAndBadges}
      {p.showGoDeeper && <GoDeeper {...card} />}
    </>
  );
}

/** Personal order: Coming up, Running costs, When you drive, Drivers near you, Records, Badges, Go deeper. */
export function PersonalSection(p: Omit<WorkSectionProps, "isCompanyDriver"> & { runningCosts: ReactNode }) {
  const card: WorkCardProps = { period: p.period, offset: p.offset, mode: p.mode, isPro: p.isPro, refreshToken: p.refreshToken };
  return (
    <>
      {p.comingUp}
      {p.runningCosts}
      <WhenYouDriveCard {...card} />
      {p.showDriversNearYou && <DriversNearYouCard {...card} />}
      {p.recordsAndBadges}
      {p.showGoDeeper && <GoDeeper {...card} />}
    </>
  );
}
