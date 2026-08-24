import { apiRequest } from "./index";

export interface TeamMembership {
  orgId: string;
  orgName: string;
  role: string;
}

/**
 * Whether this person is driving for a company on Milesheet.
 *
 * Drives "company mode" in the app: an employee claiming mileage from their
 * employer has no use for gig platform tags, an earnings tab or streaks, and
 * showing them makes the app look like it was built for somebody else.
 */
export async function fetchTeamMe(): Promise<TeamMembership | null> {
  const res = await apiRequest<{ data: TeamMembership | null }>("/team/me");
  return res.data ?? null;
}
