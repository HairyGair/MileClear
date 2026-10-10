// Where the Work-mode cards sit on Insights (SPEC-UX section 2). The cards
// themselves are Developer B2's; this file only places them, so the order
// lives in one spot and merges cleanly.
//
// Work mode, gig or both:   1 Summary (frame) / 2 Tax year so far / 3 Your
//   platforms / 4 Coming up (frame) / 5 When you drive / 6 Drivers near you /
//   6 Last shift / 7 Records + Badges (frame) / 8 Go deeper. Moved from Home
//   (Oct 2026): weekly earnings goal after Coming up, How you compare after
//   Drivers near you, Community insights inside Go deeper, Most visited
//   places (Personal) after When you drive; This month in MileClear is at
//   the very bottom, placed by the frame.
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
import { BenchmarkCard } from "../business/BenchmarkCard";
import { WeeklyGoalCard } from "../work/WeeklyGoalCard";
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
  /** "How you compare" (moved from Home): see lib/insights/movedCards. */
  showHowYouCompare?: boolean;
  /** Weekly earnings goal (moved from Home): this week, gig drivers. */
  showEarningsGoal?: boolean;
}

/** Cards between the summary and the end of the screen, in Work order. */
export function WorkSection(p: WorkSectionProps) {
  const card: WorkCardProps = { period: p.period, offset: p.offset, mode: p.mode, isPro: p.isPro, refreshToken: p.refreshToken };
  return (
    <>
      <TaxYearProgressCard {...card} />
      {!p.isCompanyDriver && <PlatformLeagueCard {...card} />}
      {p.comingUp}
      {p.showEarningsGoal && <WeeklyGoalCard />}
      <WhenYouDriveCard {...card} />
      {!p.isCompanyDriver && <LastShiftCard {...card} />}
      {p.showDriversNearYou && <DriversNearYouCard {...card} />}
      {/* Its weekly miles row is left out: Drivers near you has that figure. */}
      {p.showHowYouCompare && <BenchmarkCard hideMilesRow />}
      {p.recordsAndBadges}
      {p.showGoDeeper && <GoDeeper {...card} />}
    </>
  );
}

/** Personal order: Coming up, Running costs, When you drive, Drivers near you, Records, Badges, Go deeper. */
export function PersonalSection(
  p: Omit<WorkSectionProps, "isCompanyDriver"> & { runningCosts: ReactNode; mostVisited?: ReactNode }
) {
  const card: WorkCardProps = { period: p.period, offset: p.offset, mode: p.mode, isPro: p.isPro, refreshToken: p.refreshToken };
  return (
    <>
      {p.comingUp}
      {p.runningCosts}
      <WhenYouDriveCard {...card} />
      {p.mostVisited}
      {p.showDriversNearYou && <DriversNearYouCard {...card} />}
      {p.recordsAndBadges}
      {p.showGoDeeper && <GoDeeper {...card} />}
    </>
  );
}
