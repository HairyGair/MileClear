// "Ready for 31 January?" Self Assessment countdown (2 Oct 2026).
//
// The season (1 December to 31 January) is set once, in
// packages/shared/src/utils/saCountdown.ts (SA_COUNTDOWN_SEASON), and the API
// answers `inSeason` from it. The app never works the date out itself, so the
// card, the pushes and the web panel cannot disagree about it.
//
// Previewing before December:
//   - admins: the app asks the API with ?preview=1, which forces `inSeason`
//     for admin accounts only. An admin sees the card all year, marked
//     "Preview" outside the season (hide it from Customize Layout if it is
//     in the way; it reappears for drivers on 1 December regardless).
//   - anyone, in a dev build: flip SA_COUNTDOWN_FORCE_ON to true. Never ship
//     it as true.
//
// The checklist screen itself (/sa-checklist) opens at any time of year: it
// is linked from the Self Assessment walkthrough, and the reminder pushes
// land on it.

import type { SaChecklist, SaChecklistAction, User } from "@mileclear/shared";
import { downloadAndShareExport } from "../api/exports";

/** Dev-only: show the dashboard card whatever the date. Keep false. */
export const SA_COUNTDOWN_FORCE_ON = false;

/** Whether this account is someone the countdown is for at all. Personal-mode
 *  accounts, employees and company drivers do not file a self-employment
 *  return for this driving. dashboardMode and workType both have non-null
 *  defaults, so a legacy account is never hidden by a missing value. */
export function saCountdownAudience(user: User | null, isCompanyDriver: boolean): boolean {
  if (!user || isCompanyDriver) return false;
  if (user.dashboardMode === "personal") return false;
  if (user.workType === "employee") return false;
  return true;
}

/** Ask the API for an admin preview (forces inSeason; ignored for others). */
export function wantsSaPreview(user: User | null): boolean {
  return SA_COUNTDOWN_FORCE_ON || !!user?.isAdmin;
}

/** Card visibility once the checklist has loaded. */
export function showSaCountdownCard(c: SaChecklist | null): boolean {
  if (!c || !c.eligible) return false;
  return c.inSeason || SA_COUNTDOWN_FORCE_ON;
}

/** Screen each checklist button opens. "sa_pdf" is handled in place (Pro). */
export function routeForSaAction(action: SaChecklistAction): string | null {
  switch (action) {
    case "unclassified_trips":
      // The Inbox, narrowed to last tax year: the year the 31 January
      // deadline is for, whatever today's date.
      return "/(tabs)/trips?filter=unclassified&range=lastTaxYear";
    case "add_trip":
      return "/trip-form?mode=manual";
    case "earnings":
      return "/(tabs)/earnings";
    case "expenses":
      return "/expenses";
    case "vehicles":
      return "/vehicles";
    case "profile_name":
      return "/settings/account";
    case "self_assessment":
      return "/self-assessment";
    case "sa_pdf":
      return null;
  }
}

/** The Self Assessment PDF for a tax year (Pro: the API answers 403 for
 *  free accounts, which the caller turns into the paywall). */
export async function downloadSaPdf(taxYear: string): Promise<void> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await downloadAndShareExport(
    `/exports/self-assessment?taxYear=${encodeURIComponent(taxYear)}`,
    `mileclear-self-assessment-${taxYear}-${date}.pdf`,
    "application/pdf"
  );
}

export function daysLabel(days: number): string {
  if (days < 0) return "Deadline passed";
  if (days === 0) return "Deadline today";
  if (days === 1) return "1 day to go";
  return `${days} days to go`;
}
