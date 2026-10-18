// Home's second-chance notification ask, once a trip is saved and the phone
// has still never been asked (lib/home/notifAsk.ts). A short
// explanation first; only "Allow" fires the system prompt, and the push token
// goes to the server straight away so the first nudge can reach this phone.
// Through the prompt gate, like every other pop-up on Home.

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { AppModal } from "../AppModal";
import { getDatabase } from "../../lib/db/index";
import { apiRequest } from "../../lib/api/index";
import { registerPushToken } from "../../lib/api/notifications";
import { registerForPushNotifications } from "../../lib/notifications";
import { requestPromptSlot } from "../../lib/promptGate/index";
import {
  LEGACY_NOTIF_ASKED_KEY,
  NOTIF_ASK_KEY,
  notifAskCopy,
  parseNotifAskMemory,
  shouldShowNotifAsk,
  type NotifAskMemory,
  type NotifPermission,
} from "../../lib/home/notifAsk";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

function track(type: string, metadata: Record<string, unknown>): void {
  apiRequest("/user/event", { method: "POST", body: JSON.stringify({ type, metadata }) }).catch(() => {});
}

async function readState(): Promise<{ memory: NotifAskMemory; trips: number } | null> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM tracking_state WHERE key IN (?, ?)",
      [NOTIF_ASK_KEY, LEGACY_NOTIF_ASKED_KEY]
    );
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const count = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM trips");
    return {
      memory: parseNotifAskMemory(map[NOTIF_ASK_KEY], !!map[LEGACY_NOTIF_ASKED_KEY]),
      trips: count?.n ?? 0,
    };
  } catch {
    return null;
  }
}

interface Args {
  permission: NotifPermission;
  /** Idle Home, first load done, no shift running, status line not red. */
  enabled: boolean;
  /** Permission may have changed: re-read it. */
  onChanged: () => void;
}

export function useNotificationAsk({ permission, enabled, onChanged }: Args): { sheet: ReactElement } {
  const [memory, setMemory] = useState<NotifAskMemory | null>(null);
  const [trips, setTrips] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const trying = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      readState().then((s) => {
        if (cancelled || !s) return;
        setMemory(s.memory);
        setTrips(s.trips);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const due = enabled && !visible && shouldShowNotifAsk({ permission, trips, memory });
  useEffect(() => {
    if (!due || trying.current || trips === null || !memory) return;
    trying.current = true;
    (async () => {
      // On false another pop-up has this app open: leave the memory alone so
      // the ask comes back on a later open.
      if (!(await requestPromptSlot("notifications"))) return;
      const next: NotifAskMemory = { asks: memory.asks + 1, atTrips: trips };
      try {
        const db = await getDatabase();
        await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [
          NOTIF_ASK_KEY,
          JSON.stringify(next),
        ]);
      } catch {
        return; // could not remember it: better not to show than to show it every open
      }
      setMemory(next);
      setVisible(true);
      track("notif_ask.shown", { ask: next.asks, trips });
    })()
      .catch(() => {})
      .finally(() => {
        trying.current = false;
      });
  }, [due, trips, memory]);

  const notNow = useCallback(() => {
    track("notif_ask.not_now", { ask: memory?.asks ?? null });
    setVisible(false);
  }, [memory]);

  const allow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Fires the system prompt (permission is undetermined here), then the
      // token goes to /notifications/push-token, as startup does when granted.
      const token = await registerForPushNotifications();
      if (token) await registerPushToken(token).catch(() => {});
      track("notif_ask.allow", { ask: memory?.asks ?? null, token: !!token });
    } catch {
      // the permission re-read below shows whatever happened
    } finally {
      setBusy(false);
      setVisible(false);
      onChanged();
    }
  }, [busy, memory, onChanged]);

  const copy = notifAskCopy(trips ?? 1);
  const sheet = (
    <AppModal visible={visible} onRequestClose={notNow}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={notNow} accessibilityRole="button" accessibilityLabel="Not now" />
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.handle} accessible={false} />
          <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.display}>
            {copy.title}
          </Text>
          <Text style={s.body} maxFontSizeMultiplier={fontScaleCap.body}>{copy.body}</Text>
          <Text style={s.small} maxFontSizeMultiplier={fontScaleCap.body}>{copy.small}</Text>
          <Pressable
            onPress={allow}
            disabled={busy}
            style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Allow notifications"
            accessibilityState={{ busy }}
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={s.primaryText} maxFontSizeMultiplier={fontScaleCap.heading}>Allow</Text>
            )}
          </Pressable>
          <Pressable onPress={notNow} disabled={busy} style={s.link} accessibilityRole="button" accessibilityLabel="Not now">
            <Text style={s.linkText} maxFontSizeMultiplier={fontScaleCap.heading}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
  );

  return { sheet };
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.surfaceBorder,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginBottom: spacing.xl,
  },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fonts.bold, color: colors.text1, marginBottom: spacing.sm },
  body: { fontSize: 16, lineHeight: 23, fontFamily: fonts.regular, color: colors.text1 },
  small: { marginTop: spacing.sm, fontSize: 14, lineHeight: 20, fontFamily: fonts.regular, color: colors.text2 },
  primary: {
    minHeight: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xxl,
  },
  primaryText: { fontSize: 17, fontFamily: fonts.bold, color: colors.bg },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  linkText: { fontSize: 15, fontFamily: fonts.medium, color: colors.text2 },
});
