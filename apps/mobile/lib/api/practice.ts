// Practice accounts, the driver's side (Accountant mode phase 1, Oct 2026).
// Mirrors apps/api/src/routes/practice/driver.ts. Sharing is free for every
// driver; nothing is shared until the driver says yes on the consent sheet.

import { apiRequest } from "./index";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.mileclear.com";

export type DriverLinkState =
  | "asking"
  | "asking_expired"
  | "waiting_for_practice"
  | "sharing"
  | "paused"
  | "ended"
  | "stopped"
  | "declined";

export interface PracticeForDriver {
  id: string | null;
  name: string;
  contactName: string | null;
  professionalBody: string | null;
  checked: boolean;
  paused: boolean;
  initials: string;
  /** Relative to the API base; only set for a checked logo. */
  logoPath: string | null;
}

export interface DriverPracticeLink {
  id: string;
  state: DriverLinkState;
  startedBy: string;
  practice: PracticeForDriver;
  awaitingSignup: boolean;
  shareEarnings: boolean;
  shareExpenses: boolean;
  sharePersonalTrips: boolean;
  invitedAt: string | null;
  consentedAt: string | null;
  startedAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  endedBy: string | null;
  renewalAskedAt: string | null;
  renewalDue: boolean;
}

export type PracticeRequestType = "sort_trips" | "add_earnings" | "add_expenses" | "check_details" | "other";

export interface DriverPracticeRequest {
  id: string;
  type: PracticeRequestType;
  title: string;
  note: string | null;
  dueDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  countAtSend: number | null;
  status: "open" | "done" | "cancelled";
  doneHow: "auto" | "driver" | null;
  doneAt: string | null;
  driverReply: string | null;
  repliedAt: string | null;
  lastRemindedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  practiceName: string;
}

export interface AccessLogItem {
  id: string;
  action: string;
  sentence: string;
  at: string;
}

export interface PracticeLinksOverview {
  isEmployee: boolean;
  links: DriverPracticeLink[];
  requests: DriverPracticeRequest[];
  log: AccessLogItem[];
  fee: {
    accountantName: string | null;
    accountantContact: string | null;
    accountantAnnualFeePence: number | null;
  };
}

export interface ShareScopes {
  shareEarnings: boolean;
  shareExpenses: boolean;
  sharePersonalTrips: boolean;
}

export type PracticeLookup =
  | { isEmployee: boolean; link: DriverPracticeLink }
  | { isEmployee: boolean; link: null; practice: PracticeForDriver; endsAt: string };

export type DriverInviteOutcome =
  | { outcome: "emailed_accountant" }
  | { outcome: "asked_practice"; practiceName: string }
  | { outcome: "already_sharing"; practiceName: string }
  | { outcome: "practice_asked_you"; practiceName: string; linkId: string };

export function practiceLogoUri(path: string | null | undefined): string | null {
  return path ? `${API_URL}${path}` : null;
}

export async function fetchPracticeLinks(): Promise<PracticeLinksOverview> {
  const res = await apiRequest<{ data: PracticeLinksOverview }>("/practice-links");
  return res.data;
}

export async function fetchPracticeLog(before?: string): Promise<AccessLogItem[]> {
  const q = before ? `?before=${encodeURIComponent(before)}` : "";
  const res = await apiRequest<{ data: AccessLogItem[] }>(`/practice-links/log${q}`);
  return res.data;
}

export async function lookupPractice(params: { invite?: string; code?: string; linkId?: string }): Promise<PracticeLookup> {
  const qs = Object.entries(params)
    .filter(([, v]) => !!v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join("&");
  const res = await apiRequest<{ data: PracticeLookup }>(`/practice-links/lookup?${qs}`);
  return res.data;
}

export async function consentToPractice(
  body: ShareScopes & ({ linkId: string } | { code: string })
): Promise<{ state: "sharing" | "waiting_for_practice"; practiceName: string }> {
  const res = await apiRequest<{ data: { state: "sharing" | "waiting_for_practice"; practiceName: string } }>(
    "/practice-links/consent",
    { method: "POST", body: JSON.stringify(body) }
  );
  return res.data;
}

export async function inviteAccountant(value: string): Promise<DriverInviteOutcome> {
  const res = await apiRequest<{ data: DriverInviteOutcome }>("/practice-links/invite", {
    method: "POST",
    body: JSON.stringify({ value }),
  });
  return res.data;
}

export async function updatePracticeScopes(linkId: string, scopes: ShareScopes): Promise<void> {
  await apiRequest(`/practice-links/${linkId}/scopes`, { method: "PATCH", body: JSON.stringify(scopes) });
}

export async function stopSharing(linkId: string): Promise<void> {
  await apiRequest(`/practice-links/${linkId}/stop`, { method: "POST" });
}

export async function keepSharing(linkId: string): Promise<{ endsAt: string }> {
  const res = await apiRequest<{ data: { endsAt: string } }>(`/practice-links/${linkId}/keep-sharing`, { method: "POST" });
  return res.data;
}

export async function reportPractice(linkId: string, note?: string): Promise<void> {
  await apiRequest(`/practice-links/${linkId}/report`, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

export async function markPracticeRequestDone(requestId: string): Promise<void> {
  await apiRequest(`/practice-links/requests/${requestId}/done`, { method: "POST" });
}

export async function replyToPracticeRequest(requestId: string, text: string): Promise<void> {
  await apiRequest(`/practice-links/requests/${requestId}/reply`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
