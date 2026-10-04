// Milesheet: may a NEW team be started right now, and if not, what do we say?
// (4 Oct 2026.) Pure rules only, tested in __tests__/services/
// milesheetNewTeams.test.ts.
//
// The owner paused new teams to run a pilot with the existing ones, then
// reopen as a paid product with a free trial. The switch is the env var
// MILESHEET_NEW_TEAMS:
//
//   "open"      new teams are created as before, with a free trial
//               (services/teamTrial.ts);
//   "waitlist"  (the default, including when unset or misspelt) every path
//               that would CREATE an organisation records a waiting-list row
//               in team_interest instead and answers { waitlisted: true }.
//
// Only creating a team is paused. Existing teams keep working fully:
// inviting drivers, accepting invites, approvals, exports and billing are
// untouched. MileClear admins can always create a team (POST /team/orgs, and
// "Create team from this request" in the admin), which is the override.

export type NewTeamsMode = "open" | "waitlist";

/** Where a parked request to start a team came from. */
export const WAITLIST_SOURCES = ["self_serve", "driver_nomination", "admin_form"] as const;
export type WaitlistSource = (typeof WAITLIST_SOURCES)[number];

/** Fails closed: only the exact word "open" (any case) opens new teams. */
export function newTeamsMode(env: NodeJS.ProcessEnv = process.env): NewTeamsMode {
  return (env.MILESHEET_NEW_TEAMS ?? "").trim().toLowerCase() === "open" ? "open" : "waitlist";
}

/**
 * The error code the nominate route answers with in waitlist mode. Current
 * app builds read it and show the waiting-list screen; older builds show the
 * message (see nominationWaitlistMessage) in their red error box, because
 * describeError falls through to `err.message` for an unknown code.
 */
export const WAITLISTED_CODE = "MILESHEET_WAITLISTED";

/** What a driver who named their manager is told. No dates, no prices. */
export function nominationWaitlistMessage(managerEmail: string): string {
  return `Milesheet is in a small pilot at the moment. We've added your company to the waiting list and will contact ${managerEmail} when places open.`;
}

/** What a manager joining from the website is told. No dates, no prices. */
export const SELF_SERVE_WAITLIST_MESSAGE =
  "Milesheet is in a small pilot. You're on the waiting list and we'll be in touch.";

/** How long a repeat of the same request is folded into the first one. */
export const WAITLIST_DEDUPE_DAYS = 30;

export interface WaitlistRowLike {
  email: string;
  waitlistSource: string | null;
  nominatedByUserId: string | null;
  admittedAt: Date | null;
  createdAt: Date;
}

/**
 * True when `existing` already records this request, so a second tap (or an
 * older app build retrying after seeing the message) does not add a row or
 * send a second email. Same contact email, same source, same nominating
 * driver, not yet let in, and recent.
 */
export function isDuplicateWaitlistRequest(
  existing: WaitlistRowLike,
  request: { email: string; source: WaitlistSource; nominatedByUserId: string | null },
  now: Date
): boolean {
  if (existing.admittedAt) return false;
  if (existing.waitlistSource !== request.source) return false;
  if (existing.email.trim().toLowerCase() !== request.email.trim().toLowerCase()) return false;
  if ((existing.nominatedByUserId ?? null) !== (request.nominatedByUserId ?? null)) return false;
  return now.getTime() - existing.createdAt.getTime() < WAITLIST_DEDUPE_DAYS * 24 * 60 * 60 * 1000;
}
