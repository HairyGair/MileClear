import { prisma } from "../lib/prisma.js";
import { sendPushToUser } from "../lib/push.js";
import { logEvent } from "./appEvents.js";
import { teamDriverMembershipWhere } from "./teamDrivers.js";
import { computeTeamMonthSummary, isMonthFinished, monthEndsLabel } from "./teamExport.js";

// Milesheet: approve or query one driver's month. Shared by the portal
// (POST /team/approvals, a signed-in org admin) and the emailed approval
// link (POST /team/approval-links/:token/approvals, no account), so both
// write TeamApproval the same way: the same unfinished-month refusal, the
// same snapshot from computeTeamMonthSummary, the same events and the same
// push to the driver on a query.

export type ApprovalActor =
  | { kind: "user"; userId: string }
  | { kind: "email_link"; email: string };

export interface RecordTeamApprovalInput {
  orgId: string;
  month: string;
  driverUserId: string;
  status: "approved" | "queried";
  note?: string | null;
  actor: ApprovalActor;
  /** See TeamMonthSummaryOptions. Email link only, while the org has no active admin. */
  includeNominatingDrivers?: boolean;
}

export type RecordTeamApprovalResult =
  | { ok: true; approval: { id: string; status: string } }
  | { ok: false; statusCode: 400 | 404; error: string };

export async function recordTeamApproval(input: RecordTeamApprovalInput): Promise<RecordTeamApprovalResult> {
  const { orgId, month, driverUserId, status, actor } = input;
  const note = input.note?.trim() ? input.note.trim() : null;
  const nominating = input.includeNominatingDrivers === true;

  if (status === "queried" && !note) {
    return { ok: false, statusCode: 400, error: "A note is required when querying a driver's month." };
  }

  // Approving snapshots the miles, so a month still running would leave
  // its remaining trips out of payroll. Querying early is still allowed.
  if (status === "approved" && !isMonthFinished(month)) {
    const { name, reopens } = monthEndsLabel(month);
    return { ok: false, statusCode: 400, error: `${name} hasn't finished yet. You can approve it from ${reopens}.` };
  }

  // Never trust a driver id from the caller - confirm it is a driver in
  // THIS org before touching anything. This is the one check standing
  // between "approve my team" and reading someone else's.
  const membership = await prisma.orgMembership.findFirst({
    where: { ...teamDriverMembershipWhere(orgId, nominating), userId: driverUserId },
    select: { id: true },
  });
  if (!membership) return { ok: false, statusCode: 404, error: "Driver not found in your team." };

  // Reuse the exact same maths GET /month uses, so what gets snapshotted
  // is what the manager was just looking at - no separate calculation
  // that could silently disagree.
  let milesAtApproval: number | null = null;
  let amountPenceAtApproval: number | null = null;
  if (status === "approved") {
    const summary = await computeTeamMonthSummary(orgId, month, nominating ? { includeNominatingDrivers: true } : {});
    const driverRow = summary.drivers.find((d) => d.userId === driverUserId);
    milesAtApproval = driverRow?.businessMiles ?? 0;
    amountPenceAtApproval = driverRow?.amountPence ?? 0;
  }

  const byUser = actor.kind === "user" ? actor.userId : null;
  const byEmail = actor.kind === "email_link" ? actor.email : null;
  const fields = {
    status,
    note,
    milesAtApproval,
    amountPenceAtApproval,
    approvedByUserId: status === "approved" ? byUser : null,
    // A query from a link records who sent it too: there is no user id to
    // fall back on, and the portal shows the note's author nowhere else.
    approvedByEmail: byEmail,
    approvedAt: status === "approved" ? new Date() : null,
  };

  const approval = await prisma.teamApproval.upsert({
    where: { orgId_userId_month: { orgId, userId: driverUserId, month } },
    create: { orgId, userId: driverUserId, month, ...fields },
    update: fields,
    select: { id: true, status: true },
  });

  // The approver's email is never put in the event: the link path has no
  // user id, and `via` is enough to tell the two apart.
  logEvent(status === "approved" ? "team.month_approved" : "team.month_queried", byUser, {
    orgId,
    driverUserId,
    month,
    note,
    ...(actor.kind === "email_link" ? { via: "email_link" } : {}),
  });

  if (status === "queried") {
    const body = note!.length > 300 ? `${note!.slice(0, 297)}...` : note!;
    // Skips silently if the driver has no push token - a user with no
    // token cannot be pinged, and that is not this endpoint's problem.
    // A person's message sent just now, and never re-sent, so it is not
    // held for quiet hours (lib/push.ts).
    await sendPushToUser(
      driverUserId,
      "Your manager queried this month's mileage",
      body,
      { type: "team_month_queried", action: "open_trips" },
      { ignoreQuietHours: true }
    );
  }

  return { ok: true, approval };
}
