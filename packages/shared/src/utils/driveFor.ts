// "You drive for": the one plain question that replaced Dashboard mode
// (Oct 2026 Settings redesign). Five answers, stored in fields that already
// exist, so no database change:
//
//   gig       Deliveries or gig work         workType "gig"
//   employee  An employer, in my own car     workType "employee"
//   both      Gig work and an employer       workType "both"
//   company   A company car                  workType "company"
//   personal  Just me, not for work          dashboardMode "personal"
//
// "personal" sits on dashboardMode because the server already stops tax and
// work reminders for it (and Personal drivers keep exactly the notifications
// they get today). A driver who answers "personal" keeps their workType, so
// switching back restores what they had.

import type { WorkType } from "../types/index.js";

export type DriveFor = "gig" | "employee" | "both" | "company" | "personal";

export const DRIVE_FOR_OPTIONS: { value: DriveFor; label: string; hint: string }[] = [
  { value: "gig", label: "Deliveries or gig work", hint: "Uber, Deliveroo, Just Eat, Amazon Flex and the like" },
  { value: "employee", label: "An employer, in my own car", hint: "Your employer pays you for work miles" },
  { value: "both", label: "Gig work and an employer", hint: "Both of the above" },
  { value: "company", label: "A company car", hint: "Your employer provides the car" },
  { value: "personal", label: "Just me, not for work", hint: "Everyday driving, no tax or work reminders" },
];

export interface DriveForSource {
  workType?: string | null;
  dashboardMode?: string | null;
}

export function driveForOf(user: DriveForSource | null | undefined): DriveFor {
  if (!user) return "gig";
  if (user.dashboardMode === "personal") return "personal";
  if (user.workType === "company") return "company";
  if (user.workType === "employee" || user.workType === "both") return user.workType;
  return "gig";
}

export interface DriveForPatch {
  workType?: WorkType;
  dashboardMode: "both" | "personal" | "work";
}

/**
 * The profile fields to save for an answer. Leaves an existing "work" or
 * "both" dashboard mode alone; only moves a driver out of "personal".
 */
export function driveForPatch(answer: DriveFor, currentDashboardMode?: string | null): DriveForPatch {
  if (answer === "personal") return { dashboardMode: "personal" };
  const leavingPersonal = currentDashboardMode === "personal" || !currentDashboardMode;
  return {
    workType: answer,
    dashboardMode: leavingPersonal ? "both" : (currentDashboardMode as "both" | "work"),
  };
}

/** True for answers that mean an employer is involved, so work reminders and
 *  the Self Assessment countdown do not apply (company car and employee). */
export function isEmployedOnly(answer: DriveFor): boolean {
  return answer === "employee" || answer === "company";
}

/** The sentence under the row on Settings. */
export function driveForSummary(
  answer: DriveFor,
  opts: { employerRatePence?: number | null; teamName?: string | null } = {}
): string {
  const rate = opts.employerRatePence ? ` · employer pays ${opts.employerRatePence}p` : "";
  switch (answer) {
    case "gig":
      return "Deliveries or gig work";
    case "employee":
      return `An employer${rate}`;
    case "both":
      return `Deliveries and an employer${rate}`;
    case "company":
      return opts.teamName ? `A company car · ${opts.teamName}` : "A company car";
    case "personal":
      return "Just me, not for work";
  }
}
