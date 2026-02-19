// Client-side gamification: streaks, milestones, scoring

export function calculateStreak(_tripDates: string[]): number {
  // TODO: calculate consecutive days with trips logged
  return 0;
}

export function checkMilestones(_totalMiles: number): string[] {
  const thresholds = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000];
  return thresholds
    .filter((t) => _totalMiles >= t)
    .map((t) => `milestone_${t}_miles`);
}
