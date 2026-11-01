import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../components/Button";
import { apiRequest } from "../lib/api/index";
import { getDatabase } from "../lib/db/index";
import {
  getBatteryOptimisationState,
  getDeviceManufacturer,
  openBatteryOptimisationSettings,
} from "../lib/tracking/batteryOptimisation";
import {
  OEM_GUIDE_EVENTS,
  doneStateWrites,
  oemFirstScreen,
  oemGroupFor,
  oemGuideFor,
  verificationMessage,
  type VerificationMessage,
} from "../lib/tracking/oemBatteryGuide";
import { colors, fonts, radii, spacing } from "../lib/theme";

function track(type: string, metadata: Record<string, unknown>): void {
  apiRequest("/user/event", {
    method: "POST",
    body: JSON.stringify({ type, metadata }),
  }).catch(() => {});
}

/**
 * One screen of exact steps for phones that close background apps hard
 * (OPPO, realme, OnePlus, Motorola, HONOR, Huawei, vivo). Reached from the
 * battery row on Home. The button opens the closest settings screen; on
 * return we check the one setting the app can see and say so.
 *
 * Events: oem_battery_guide.shown / .opened_settings / .done / .verified.
 */
export default function OemBatteryGuideScreen() {
  // One source of truth: the row passes the maker it already resolved; the
  // Settings row and a deep link fall back to the same helper.
  const params = useLocalSearchParams<{ maker?: string }>();
  const maker = params.maker?.trim() || getDeviceManufacturer();
  const guide = oemGuideFor(maker);
  const [verdict, setVerdict] = useState<VerificationMessage | null>(null);
  const awaitingReturn = useRef(false);
  const verifying = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "android" || !guide) {
      router.back();
      return;
    }
    track(OEM_GUIDE_EVENTS.shown, { maker, step: "intro" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = useCallback(async () => {
    if (verifying.current) return;
    verifying.current = true;
    try {
      const state = await getBatteryOptimisationState();
      const ignoring = state?.ignoring ?? null;
      const group = oemGroupFor(maker);
      if (group) setVerdict(verificationMessage(ignoring, group));
      track(OEM_GUIDE_EVENTS.verified, { maker, ignoringOptimizations: ignoring });
    } finally {
      verifying.current = false;
    }
  }, [maker]);

  // Coming back from Settings: check once per trip out.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && awaitingReturn.current) {
        awaitingReturn.current = false;
        verify().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [verify]);

  const openSettings = useCallback(async () => {
    if (!guide) return;
    awaitingReturn.current = true;
    const first = oemFirstScreen(guide.group);
    let opened: "vendor" | "stock" | "app" = "app";
    if (first === "vendor" && (await openBatteryOptimisationSettings("vendor"))) {
      opened = "vendor";
    } else if (first === "vendor" && (await openBatteryOptimisationSettings("stock"))) {
      opened = "stock";
    } else {
      Linking.openSettings().catch(() => {
        awaitingReturn.current = false;
      });
    }
    track(OEM_GUIDE_EVENTS.openedSettings, { maker, step: "steps", opened });
  }, [guide, maker]);

  const done = useCallback(async () => {
    track(OEM_GUIDE_EVENTS.done, { maker, step: "steps" });
    try {
      const db = await getDatabase();
      const now = Date.now();
      // The Done time, and the Home battery row's 7-day snooze, as "later" does.
      for (const [key, value] of doneStateWrites(now)) {
        await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, ?)", [key, value]);
      }
      track("battery_opt_nudge.snoozed", {
        screen: "vendor",
        guide: "oem",
        until: now + 7 * 24 * 60 * 60 * 1000,
        manufacturer: maker,
      });
    } catch {
      // Never block leaving the screen on a local write.
    }
    router.back();
  }, [maker]);

  if (!guide) return <View style={styles.screen} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.iconWrap}>
        <Ionicons name="battery-charging-outline" size={26} color={colors.amber} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {guide.title}
      </Text>
      <Text style={styles.body}>{guide.intro}</Text>

      <View style={styles.card}>
        {guide.steps.map((step, i) => (
          <View key={i} style={[styles.stepRow, i > 0 && styles.stepGap]}>
            <View style={styles.num}>
              <Text style={styles.numText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {verdict && (
        <View
          style={[styles.verdict, verdict.result === "no" && styles.verdictWarn]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.verdictHead}>{verdict.headline}</Text>
          <Text style={styles.verdictBody}>{verdict.detail}</Text>
        </View>
      )}

      <Button title="Open settings" onPress={openSettings} icon="settings-outline" fullWidth />
      <Text style={styles.closing}>{guide.closing}</Text>
      <Button title="Done" variant="secondary" onPress={done} fullWidth />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text1, fontSize: 22, fontFamily: fonts.bold, lineHeight: 28 },
  body: { color: colors.text2, fontSize: 15, fontFamily: fonts.regular, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    padding: spacing.lg,
  },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  stepGap: { marginTop: spacing.lg },
  num: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.amberDim,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  numText: { color: colors.amber, fontSize: 13, fontFamily: fonts.bold },
  stepText: { flex: 1, color: colors.text1, fontSize: 15, fontFamily: fonts.regular, lineHeight: 22 },
  verdict: {
    backgroundColor: colors.greenDim,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  verdictWarn: { backgroundColor: colors.amberDim },
  verdictHead: { color: colors.text1, fontSize: 15, fontFamily: fonts.semibold },
  verdictBody: { color: colors.text2, fontSize: 14, fontFamily: fonts.regular, lineHeight: 20 },
  closing: { color: colors.text3, fontSize: 14, fontFamily: fonts.regular, textAlign: "center" },
});
