// Existing drivers' one "What's new" sheet (tutorial decision E,
// mockups/a-8-whats-new-existing): shown once, on Home, through the prompt
// gate, never the full tour. Skipped for a driver whose location isn't
// Always; the location pop-up and the status line speak to them instead.
// Rules in lib/tutorial/rule.ts (whatsNewDecision).

import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppModal } from "../AppModal";
import { TickLine } from "../tutorial/TutorialParts";
import { useUser } from "../../lib/user/context";
import { promptHoldSettled, requestPromptSlot } from "../../lib/promptGate/index";
import { getLocationPermissionStatus } from "../../lib/permissions/location";
import { trackTutorial } from "../../lib/events/tutorial";
import { WHATS_NEW_VERSION, whatsNewDecision } from "../../lib/tutorial/rule";
import { readFirstRunStored, readWhatsNewSeen, writeWhatsNewSeen } from "../../lib/tutorial/state";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

export function WhatsNewSheet() {
  const router = useRouter();
  const { user } = useUser();
  const [visible, setVisible] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      // The root layout stores whether this account is new or existing while
      // Home is already mounted underneath; read it only once that's done.
      if (await promptHoldSettled()) return;
      const [stored, seen, perm] = await Promise.all([
        readFirstRunStored(userId),
        readWhatsNewSeen(userId),
        getLocationPermissionStatus().catch(() => null),
      ]);
      if (cancelled || !perm) return;
      const decision = whatsNewDecision({ stored, seenVersion: seen, tier: perm.tier });
      if (decision === "none") return;
      if (decision === "skip_not_always") {
        await writeWhatsNewSeen(userId, WHATS_NEW_VERSION);
        trackTutorial("whats_new.skipped", { version: WHATS_NEW_VERSION, reason: "not_always", tier: perm.tier });
        return;
      }
      if (!(await requestPromptSlot("whats_new")) || cancelled) return;
      await writeWhatsNewSeen(userId, WHATS_NEW_VERSION);
      trackTutorial("whats_new.shown", { version: WHATS_NEW_VERSION });
      setVisible(true);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const close = useCallback(() => {
    trackTutorial("whats_new.dismissed", { version: WHATS_NEW_VERSION });
    setVisible(false);
  }, []);

  const tour = useCallback(() => {
    trackTutorial("whats_new.tour", { version: WHATS_NEW_VERSION });
    setVisible(false);
    router.push("/tour?source=whats_new" as never);
  }, [router]);

  return (
    <AppModal visible={visible} onRequestClose={close}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.handle} accessible={false} />
          <Text style={s.eyebrow} maxFontSizeMultiplier={fontScaleCap.heading}>What's new</Text>
          <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.display}>
            MileClear has a simpler look
          </Text>
          <TickLine title="The line at the top of Home" hint="Green means recording. Red means tap to fix." />
          <TickLine title="Sort trips on Home" hint="Your last trip has Business and Personal." />
          <TickLine title="Settings starts with a check-up" hint="Four ticks that say if anything needs you." />
          <Pressable
            onPress={close}
            style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Got it"
          >
            <Text style={s.primaryText} maxFontSizeMultiplier={fontScaleCap.heading}>Got it</Text>
          </Pressable>
          <Pressable onPress={tour} style={s.link} accessibilityRole="button" accessibilityLabel="Take the full tour">
            <Text style={s.linkText} maxFontSizeMultiplier={fontScaleCap.heading}>Take the full tour</Text>
          </Pressable>
        </View>
      </View>
    </AppModal>
  );
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
  eyebrow: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.amber,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fonts.bold, color: colors.text1, marginTop: 6, marginBottom: spacing.sm },
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
