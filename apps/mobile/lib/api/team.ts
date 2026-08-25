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

/**
 * Nominate a manager to receive a Milesheet invite on this driver's
 * behalf. Called from the "do you claim mileage from work?" prompt.
 *
 * Server validates and throws (via apiRequest -> ApiError) on:
 *   409 — already in a company, or a nomination is already outstanding
 *   400 — invalid email, or nominating your own address
 * Callers should surface `err.hint ?? err.message` (see describeError).
 */
export async function nominateManager(
  managerEmail: string,
  companyName: string
): Promise<void> {
  await apiRequest<{ data: { ok: true } }>("/team/nominate-manager", {
    method: "POST",
    body: JSON.stringify({ managerEmail, companyName }),
  });
}
