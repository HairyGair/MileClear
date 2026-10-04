import { useEffect, useState } from "react";
import { apiRequest } from "./index";
import { getDatabase } from "../db/index";

/**
 * Ask MileClear (Pro, Oct 2026): answers questions from the driver's own
 * records. The server is dormant until its Anthropic key is set; while
 * /assistant/status says unavailable, every entry point stays hidden.
 */

export interface AssistantStatus {
  available: boolean;
  dailyLimit?: number;
  monthlyLimit?: number;
}

export interface AssistantTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantAnswer {
  answer: string;
  /** The periods the figures cover, e.g. "1 Sep 2026 to 30 Sep 2026". */
  periods: string[];
  remainingToday: number;
  remainingThisMonth: number;
}

export function fetchAssistantStatus() {
  return apiRequest<AssistantStatus>("/assistant/status");
}

export function askAssistant(question: string, history: AssistantTurn[]) {
  return apiRequest<{ data: AssistantAnswer }>("/assistant/ask", {
    method: "POST",
    body: JSON.stringify({ question, history: history.slice(-6) }),
  });
}

// ── Availability (cached for the session) ─────────────────────────────────

const STATUS_TTL_MS = 10 * 60 * 1000;
let cached: { available: boolean; at: number } | null = null;
let pending: Promise<boolean> | null = null;

function loadAvailability(): Promise<boolean> {
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return Promise.resolve(cached.available);
  if (!pending) {
    pending = fetchAssistantStatus()
      .then((s) => !!s.available)
      // An older API has no /assistant route: treat that as unavailable.
      .catch(() => false)
      .then((available) => {
        cached = { available, at: Date.now() };
        pending = null;
        return available;
      });
  }
  return pending;
}

/**
 * null while unknown, then true or false. Entry points treat null as hidden,
 * so nothing flashes up and then vanishes.
 */
export function useAssistantAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(cached?.available ?? null);
  useEffect(() => {
    let alive = true;
    loadAvailability().then((a) => {
      if (alive) setAvailable(a);
    });
    return () => {
      alive = false;
    };
  }, []);
  return available;
}

// ── One-time notice, remembered on this device ────────────────────────────

const NOTICE_KEY = "assistant_notice_seen";

export async function hasSeenAssistantNotice(): Promise<boolean> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [NOTICE_KEY]);
    return row != null;
  } catch {
    return false; // show it again rather than skip it
  }
}

export async function markAssistantNoticeSeen(): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [NOTICE_KEY, String(Date.now())]);
  } catch {
    /* best effort */
  }
}
