import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ACQUISITION_SOURCES, type AcquisitionSource } from "@mileclear/shared";
import { getDatabase } from "../lib/db";
import { useUser } from "../lib/user/context";
import { apiRequest } from "../lib/api/index";
import { colors, fonts } from "../lib/theme";

// "How did you hear about MileClear?" (1 Oct 2026). Sign-ups were rising fast
// with no way to tell which channel was bringing them. One tap, asked once,
// only of drivers who joined in the last 30 days, so the recent influx
// answers straight away. Answered or skipped, it never comes back: a local
// flag stops it on this phone and the server remembers it across phones.

const ASKED_KEY = "acquisition_source_asked";
const ASK_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;

type CardState = "checking" | "open" | "other" | "thanks" | "closed";

export function AcquisitionSourceCard() {
  const { user } = useUser();
  const [state, setState] = useState<CardState>("checking");
  const [otherText, setOtherText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const createdMs = user?.createdAt ? new Date(user.createdAt).getTime() : NaN;
      if (!Number.isFinite(createdMs) || Date.now() - createdMs > ASK_WITHIN_MS) {
        if (!cancelled) setState("closed");
        return;
      }
      try {
        const db = await getDatabase();
        const row = await db.getFirstAsync<{ value: string }>(
          "SELECT value FROM tracking_state WHERE key = ?",
          [ASKED_KEY]
        );
        if (row) {
          if (!cancelled) setState("closed");
          return;
        }
        const res = await apiRequest<{ data: { answered: boolean } }>("/user/acquisition-source");
        if (res.data.answered) {
          await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, '1')", [ASKED_KEY]);
          if (!cancelled) setState("closed");
          return;
        }
        if (!cancelled) setState("open");
      } catch {
        // Offline or unreadable: stay quiet rather than risk asking twice.
        if (!cancelled) setState("closed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.createdAt]);

  const remember = useCallback(async () => {
    try {
      const db = await getDatabase();
      await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, '1')", [ASKED_KEY]);
    } catch {
      // best effort: the server also remembers
    }
  }, []);

  const answer = useCallback(
    async (source: AcquisitionSource, detail?: string) => {
      if (sending) return;
      setSending(true);
      try {
        await apiRequest("/user/acquisition-source", {
          method: "POST",
          body: JSON.stringify(detail ? { source, detail } : { source }),
        });
        await remember();
        setState("thanks");
        setTimeout(() => setState("closed"), 2500);
      } catch {
        // Couldn't send: leave the card so they can try again.
      } finally {
        setSending(false);
      }
    },
    [remember, sending]
  );

  const skip = useCallback(async () => {
    setState("closed");
    await remember();
    apiRequest("/user/acquisition-source/skip", { method: "POST", body: "{}" }).catch(() => {});
  }, [remember]);

  if (state === "checking" || state === "closed") return null;

  if (state === "thanks") {
    return (
      <View style={st.card}>
        <View style={st.thanksRow}>
          <Ionicons name="checkmark-circle" size={20} color={colors.green} />
          <Text style={st.thanksText}>Thanks, that really helps.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={st.card}>
      <View style={st.headerRow}>
        <Text style={st.title}>Quick question</Text>
        <TouchableOpacity onPress={skip} accessibilityRole="button" accessibilityLabel="Skip this question" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color={colors.text3} />
        </TouchableOpacity>
      </View>
      <Text style={st.question}>How did you hear about MileClear?</Text>

      {state === "other" ? (
        <View>
          <TextInput
            value={otherText}
            onChangeText={setOtherText}
            placeholder="Where did you hear about us? (optional)"
            placeholderTextColor={colors.text3}
            style={st.input}
            maxLength={120}
            autoFocus
            returnKeyType="send"
            onSubmitEditing={() => answer("other", otherText.trim() || undefined)}
          />
          <View style={st.otherActions}>
            <TouchableOpacity onPress={() => setState("open")} accessibilityRole="button" style={st.secondaryBtn}>
              <Text style={st.secondaryText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => answer("other", otherText.trim() || undefined)}
              accessibilityRole="button"
              style={st.primaryBtn}
              disabled={sending}
            >
              <Text style={st.primaryText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={st.chips}>
          {ACQUISITION_SOURCES.map((s) => (
            <TouchableOpacity
              key={s.value}
              style={st.chip}
              onPress={() => (s.value === "other" ? setState("other") : answer(s.value))}
              accessibilityRole="button"
              accessibilityLabel={s.label}
              disabled={sending}
              activeOpacity={0.7}
            >
              <Text style={st.chipText}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const AMBER = colors.amber;

const st = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(245,166,35,0.25)",
    padding: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: AMBER, fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 0.3 },
  question: { color: colors.text1, fontFamily: fonts.semibold, fontSize: 17, marginTop: 4, marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(15,23,42,0.6)",
  },
  chipText: { color: colors.text1, fontFamily: fonts.medium, fontSize: 14 },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.35)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.text1,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  otherActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 10 },
  secondaryBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  secondaryText: { color: colors.text2, fontFamily: fonts.medium, fontSize: 15 },
  primaryBtn: { backgroundColor: AMBER, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
  primaryText: { color: "#030712", fontFamily: fonts.semibold, fontSize: 15 },
  thanksRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  thanksText: { color: colors.text1, fontFamily: fonts.medium, fontSize: 15 },
});
