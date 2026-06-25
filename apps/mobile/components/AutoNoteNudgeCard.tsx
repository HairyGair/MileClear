import { useState, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { getDatabase } from "../lib/db";
import { getRecentAutoClassifiedWithoutNote } from "../lib/db/queries";
import { syncUpdateTrip } from "../lib/sync/actions";
import { TripNoteEditor } from "./TripNoteEditor";
import { colors, fonts } from "../lib/theme";

const DISMISS_KEY = "auto_note_nudge_dismissed_at";
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

type Candidate = {
  id: string;
  startAddress: string | null;
  endAddress: string | null;
  classification: string;
};

/**
 * Dashboard nudge: auto-classified trips skip the Inbox, so they never see the
 * prominent "Add a note" row on the Trips list. This surfaces the most recent
 * such trip and lets the user add a note inline, right on the home screen.
 *
 * Deliberately gentle (notes are optional): one trip at a time, dismissible
 * with a 24h cooldown, and it disappears the moment a note is added.
 */
export function AutoNoteNudgeCard() {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM tracking_state WHERE key = ?",
        [DISMISS_KEY]
      );
      if (row) {
        const dismissedAt = parseInt(row.value, 10);
        if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) {
          setCandidate(null);
          return;
        }
      }
      const c = await getRecentAutoClassifiedWithoutNote();
      setEditing(false);
      setCandidate(c);
    } catch {
      setCandidate(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (!candidate) return null;

  const route =
    [candidate.startAddress, candidate.endAddress].filter(Boolean).join(" → ") || "Recent trip";
  const label = candidate.classification === "business" ? "Business" : "Personal";

  const saveNote = async (text: string) => {
    const trimmed = text.trim();
    const tripId = candidate.id;
    setCandidate(null);
    if (!trimmed) return;
    try {
      await syncUpdateTrip(tripId, { notes: trimmed });
    } catch {
      // The sync queue retries.
    }
    refresh(); // surface the next candidate, if any
  };

  const dismiss = async () => {
    setCandidate(null);
    try {
      const db = await getDatabase();
      await db.runAsync(
        "INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)",
        [DISMISS_KEY, String(Date.now())]
      );
    } catch {
      // ignore
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name="create-outline" size={18} color={colors.amber} accessible={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Add a note to your last trip?</Text>
          <Text style={styles.body} numberOfLines={2}>
            Auto-tracked {route} · {label}. Jot down what it was for.
          </Text>
        </View>
        {!editing && (
          <TouchableOpacity
            onPress={dismiss}
            hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss for now"
          >
            <Ionicons name="close" size={16} color="#6b7280" accessible={false} />
          </TouchableOpacity>
        )}
      </View>
      {editing ? (
        <View style={styles.editorWrap}>
          <TripNoteEditor initial="" onSave={saveNote} />
        </View>
      ) : (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setEditing(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add a note"
        >
          <Ionicons name="add" size={14} color={colors.amber} accessible={false} />
          <Text style={styles.addBtnText}>Add note</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text1, fontSize: 14, fontFamily: fonts.semibold, marginBottom: 2 },
  body: { color: colors.text2, fontSize: 12.5, fontFamily: fonts.regular, lineHeight: 17 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.amber,
  },
  addBtnText: { color: colors.amber, fontSize: 13, fontFamily: fonts.medium },
  editorWrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
});
