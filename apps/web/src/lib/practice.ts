// Practice accounts (Accountant mode phase 1, Oct 2026): the web client.
//
// The practice API answers errors as { error, code, ...extra } (for example
// a client page 403 carries clientName and endedAt). The shared api client
// keeps only the message, so practice calls go through these helpers, which
// keep the code and the whole body.

import { fetchWithAuth } from "./api";
import type { PracticePeriod, MtdQuarter, PracticeRequestType } from "@mileclear/shared";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

export class PracticeError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    const msg = typeof body.error === "string" ? body.error : "Something went wrong. Try again.";
    super(status === 429 && !body.error ? "Too many requests at once. Wait a minute and try again." : msg);
    this.status = status;
    this.code = typeof body.code === "string" ? body.code : null;
    this.body = body;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body && typeof init.body === "string") headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetchWithAuth(path, { ...init, headers });
  } catch (e) {
    if (e instanceof Error && e.message === "Session expired") throw e;
    throw new PracticeError(0, { error: "Couldn't connect. Check your connection and try again." });
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new PracticeError(res.status, body);
  }
  return (await res.json()) as T;
}

export const papi = {
  get: <T>(path: string) => call<{ data: T }>(path).then((r) => r.data),
  post: <T>(path: string, body?: unknown) =>
    call<{ data: T }>(path, { method: "POST", body: JSON.stringify(body ?? {}) }).then((r) => r.data),
  patch: <T>(path: string, body?: unknown) =>
    call<{ data: T }>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }).then((r) => r.data),
  del: <T>(path: string) => call<{ data: T }>(path, { method: "DELETE" }).then((r) => r.data),
};

/** Public lookups (no sign-in). */
export async function publicGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new PracticeError(0, { error: "Couldn't connect. Check your connection and try again." });
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new PracticeError(res.status, body);
  return (body as { data: T }).data;
}

export function errorText(e: unknown, fallback = "Something went wrong. Try again."): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Fetch a file with auth and save it, named by Content-Disposition. */
export async function downloadAuthed(path: string, init: RequestInit = {}, fallbackName = "mileclear-export"): Promise<{ skipped: number }> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body && typeof init.body === "string") headers["Content-Type"] = "application/json";
  const res = await fetchWithAuth(path, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new PracticeError(res.status, body);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = cd.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { skipped: parseInt(res.headers.get("X-Skipped-Clients") ?? "0", 10) || 0 };
}

/** An object URL for an authed image (logo, QR). Caller revokes it. */
export async function authedObjectUrl(path: string): Promise<string | null> {
  const res = await fetchWithAuth(path);
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

// ── Shapes the API sends ────────────────────────────────────────────────

export interface PracticeMe {
  practice: {
    id: string;
    name: string;
    contactName: string;
    email: string;
    phone: string | null;
    professionalBody: string | null;
    arn: string | null;
    checked: boolean;
    checkedAt: string | null;
    paused: boolean;
    joinCode: string;
    joinUrl: string;
    createdAt: string;
    logo: { updatedAt: string; checked: boolean; mime: string; bytes: number } | null;
  };
  member: { id: string; role: "owner" | "staff"; name: string };
  counts: { openRequests: number; wantsToJoin: number; claimable: number };
}

export type UpdateState =
  | { state: "sent"; sentAt: string; due: string }
  | { state: "not_due"; due: string }
  | { state: "due"; due: string; daysLeft: number }
  | { state: "overdue"; due: string }
  | { state: "not_using_mtd" };

export interface ClientRow {
  clientId: string;
  linkId: string;
  name: string;
  email: string;
  vehicleType: string | null;
  workType: string;
  businessMiles: number;
  toSort: number;
  earningsShared: boolean;
  earningsCount: number | null;
  expensesShared: boolean;
  expensesCount: number | null;
  sharePersonalTrips: boolean;
  update: UpdateState;
  lastTripAt: string | null;
  openRequests: number;
  startedAt: string | null;
  endsAt: string | null;
  renewalAskedAt: string | null;
}

export type WaitingState = "invited" | "wants_to_join" | "said_no" | "invite_expired";

export interface WaitingRow {
  linkId: string;
  clientId: string | null;
  name: string | null;
  email: string | null;
  state: WaitingState;
  invitedAt: string | null;
  lastResentAt: string | null;
  startedBy: string;
}

export interface EndedRow {
  linkId: string;
  clientId: string | null;
  name: string;
  endedAt: string | null;
  endedBy: string | null;
  canAskAgain: boolean;
}

export interface ClientList {
  period: PracticePeriod;
  quarter: MtdQuarter;
  clients: ClientRow[];
  waiting: WaitingRow[];
  ended: EndedRow[];
}

export interface PracticeRequestRow {
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
  client?: { id: string; name: string };
  practiceName?: string;
}

export interface TripRow {
  id: string;
  startedAt: string;
  endedAt: string | null;
  miles: number;
  classification: string;
  platform: string | null;
  from: string | null;
  to: string | null;
  vehicle: string | null;
  recorded: "added_by_hand" | "tracked";
}

export interface LinkInfo {
  id: string;
  startedBy: string;
  startedAt: string | null;
  endsAt: string | null;
  renewalAskedAt: string | null;
  shareEarnings: boolean;
  shareExpenses: boolean;
  sharePersonalTrips: boolean;
}

export interface ClientOverview {
  client: { id: string; name: string; workType: string; vehicleType: string | null; lastTripAt: string | null };
  link: LinkInfo;
  period: PracticePeriod;
  figures: {
    businessMiles: number;
    businessTrips: number;
    claimPence: number;
    earningsShared: boolean;
    earningsPence: number | null;
    earningsCount: number | null;
    expensesShared: boolean;
    expensesPence: number | null;
    expensesCount: number | null;
    toSort: number;
    toSortFrom: string | null;
    toSortTo: string | null;
    rateVehicleTypes: string[];
    rateNote: string;
  };
  quarters: (MtdQuarter & { update: UpdateState })[];
  recentTrips: TripRow[];
  chase: Array<{ kind: "sort_trips"; count: number; from: string | null; to: string | null } | { kind: "no_earnings" } | { kind: "quiet"; days: number }>;
  requests: PracticeRequestRow[];
  accessLoggedAt: string;
}

/** What a driver sees about a practice. */
export interface PracticeForDriver {
  id: string | null;
  name: string;
  contactName: string | null;
  professionalBody: string | null;
  checked: boolean;
  paused: boolean;
  initials: string;
  logoPath: string | null;
}

export type DriverLinkState =
  | "asking"
  | "asking_expired"
  | "waiting_for_practice"
  | "sharing"
  | "paused"
  | "ended"
  | "stopped"
  | "declined";

export interface DriverLink {
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

export interface DriverPractice {
  isEmployee: boolean;
  links: DriverLink[];
  requests: (PracticeRequestRow & { practiceName: string })[];
  log: { id: string; action: string; sentence: string; at: string }[];
  fee: { accountantName: string | null; accountantContact: string | null; accountantAnnualFeePence: number | null };
}

// ── Formatting ──────────────────────────────────────────────────────────

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "7 Nov" from an ISO instant or a date key, UK time. */
export function dayMonth(iso: string | null | undefined, withYear = false): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
    return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
  }
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "Europe/London",
  });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** "Today", "Yesterday", "4 days ago", "Never". */
export function lastTripText(iso: string | null): string {
  const d = daysSince(iso);
  if (d === null) return "No trips yet";
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

export function vehicleWord(v: string | null): string {
  if (v === "van") return "Van";
  if (v === "motorbike") return "Motorbike";
  if (v === "car") return "Car";
  return "No vehicle";
}

export function workWord(w: string): string {
  if (w === "employee") return "Employee";
  if (w === "both") return "Employed and self-employed";
  return "Self-employed";
}

export function milesText(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function poundsText(pence: number): string {
  return (pence / 100).toLocaleString("en-GB", { style: "currency", currency: "GBP" });
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
