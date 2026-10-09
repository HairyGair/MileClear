"use client";

import { useState } from "react";
import { api } from "../../../lib/api";
import { Button } from "../kit/Button";
import { useToast } from "../kit/Toast";
import { formatDay, formatTime } from "../../../lib/dashboard/dates";
import styles from "./driving.module.css";

export interface ShiftSuggestion {
  id: string;
  startedAt: string;
  endedAt: string;
  tripCount: number;
  totalMiles: number;
  platformTag: string | null;
}

export async function fetchShiftSuggestions(): Promise<ShiftSuggestion[]> {
  const res = await api.get<{ suggestions?: ShiftSuggestion[] }>("/shifts/suggestions");
  return res.suggestions ?? [];
}

export function suggestionSentence(s: ShiftSuggestion): string {
  const trips = s.tripCount === 1 ? "1 trip looks" : `${s.tripCount} trips look`;
  return `${trips} like a shift on ${formatDay(s.startedAt)}, ${formatTime(s.startedAt)} to ${formatTime(s.endedAt)}.`;
}

/** One suggestion with its two buttons. "Make it a shift" accepts, "No" dismisses (POST /shifts/suggestions/:id/resolve). */
export function SuggestionRow({ s, onDone }: { s: ShiftSuggestion; onDone: () => void }) {
  const { show } = useToast();
  const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);

  async function resolve(action: "accept" | "dismiss") {
    setBusy(action);
    try {
      await api.post(`/shifts/suggestions/${s.id}/resolve`, { action });
      show(action === "accept" ? "Shift added" : "Saved");
      onDone();
    } catch (e) {
      show(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
      onDone();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.stack}>
      <p className={styles.muted}>{suggestionSentence(s)}</p>
      <div className={styles.actionsRow}>
        <Button variant="secondary" size="sm" loading={busy === "accept"} disabled={busy !== null} onClick={() => resolve("accept")}>
          Make it a shift
        </Button>
        <Button variant="ghost" size="sm" loading={busy === "dismiss"} disabled={busy !== null} onClick={() => resolve("dismiss")}>
          No
        </Button>
      </div>
    </div>
  );
}
