import type { Prisma } from "@prisma/client";

// Milesheet: which driver memberships count for an org's month.
//
// Normally only ACTIVE drivers. While a nominated manager has not signed up
// (the emailed approval link, Oct 2026) the driver who nominated them counts
// too: their membership is "invited" but already has a userId. That driver
// may since have joined another company, though, and their mileage must
// then never reach the old nominated manager. One rule, used by the month
// summary, the approval write and the monthly job.

/** The user is not active in any org other than `orgId`. */
export function notActiveElsewhere(orgId: string): Prisma.OrgMembershipWhereInput {
  return { user: { orgMemberships: { none: { status: "active", orgId: { not: orgId } } } } };
}

export function teamDriverMembershipWhere(
  orgId: string,
  includeNominatingDrivers = false
): Prisma.OrgMembershipWhereInput {
  if (!includeNominatingDrivers) {
    return { orgId, role: "driver", status: "active", userId: { not: null } };
  }
  return {
    orgId,
    role: "driver",
    userId: { not: null },
    OR: [{ status: "active" }, { status: "invited", ...notActiveElsewhere(orgId) }],
  };
}
