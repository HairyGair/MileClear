import { apiRequest } from "./index";
import { isApiError } from "./apiError";

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
 * Is Milesheet taking new companies ("open") or keeping a waiting list
 * while it runs a small pilot ("waitlist")? Public, no sign-in needed.
 */
export async function fetchMilesheetAvailability(): Promise<"open" | "waitlist"> {
  const res = await apiRequest<{ data: { newTeams: "open" | "waitlist" } }>("/team/availability");
  return res.data.newTeams === "open" ? "open" : "waitlist";
}

/** The error code the server answers with while Milesheet is on a waiting list. */
export const MILESHEET_WAITLISTED_CODE = "MILESHEET_WAITLISTED";

export type NominateResult =
  | { waitlisted: false }
  /** No team was made: the company went on the waiting list. `message` is the server's wording. */
  | { waitlisted: true; message: string };

/**
 * Nominate a manager to receive a Milesheet invite on this driver's
 * behalf. Called from the "do you claim mileage from work?" prompt.
 *
 * While new teams are paused (Oct 2026) the server stores the nomination on
 * the waiting list, emails nobody, and answers 409 with code
 * MILESHEET_WAITLISTED. That is a result, not a failure, so it is returned
 * as { waitlisted: true } rather than thrown. (Older builds without this
 * branch show the server's message in their error box, which reads
 * correctly there too.)
 *
 * Server validates and throws (via apiRequest -> ApiError) on:
 *   409 — already in a company, or a nomination is already outstanding
 *   400 — invalid email, or nominating your own address
 * Callers should surface `err.hint ?? err.message` (see describeError).
 */
export async function nominateManager(
  managerEmail: string,
  companyName: string
): Promise<NominateResult> {
  try {
    await apiRequest<{ data: { ok: true } }>("/team/nominate-manager", {
      method: "POST",
      body: JSON.stringify({ managerEmail, companyName }),
    });
    return { waitlisted: false };
  } catch (err) {
    if (isApiError(err) && err.code === MILESHEET_WAITLISTED_CODE) {
      return { waitlisted: true, message: err.message };
    }
    throw err;
  }
}
