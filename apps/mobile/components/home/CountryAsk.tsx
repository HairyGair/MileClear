// "Where do you drive?" (23 Oct 2026): asked once on Home for a new account
// whose phone region or sign-up is outside the UK, with that country picked
// and the UK one tap away. UK phones never see it. Through the prompt gate,
// like every other pop-up on Home.
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { countryName, isKnownCountryCode, isUk } from "@mileclear/shared";
import { AppModal } from "../AppModal";
import { getDatabase } from "../../lib/db/index";
import { apiRequest } from "../../lib/api/index";
import { requestPromptSlot } from "../../lib/promptGate/index";
import { useUser } from "../../lib/user/context";
import { currentCountry, deviceRegion, loadCountry } from "../../lib/country/country";
import { pickCountry } from "../../lib/country/pick";
import { COUNTRY_ASKED_KEY, countryAskDue, countryToSuggest } from "../../lib/country/rule";
import { colors, fonts, fontScaleCap, radii, spacing } from "../../lib/theme";

function track(type: string, metadata: Record<string, unknown>): void {
  apiRequest("/user/event", { method: "POST", body: JSON.stringify({ type, metadata }) }).catch(() => {});
}

export function useCountryAsk({ enabled }: { enabled: boolean }): { sheet: ReactElement } {
  const router = useRouter();
  const { user } = useUser();
  const [suggested, setSuggested] = useState<string | null>(null);
  const tried = useRef(false);

  useEffect(() => {
    // Behind the server's switch (countrySettingEnabled), off by default.
    if (!enabled || !user || user.countrySettingEnabled !== true || tried.current) return;
    tried.current = true;
    (async () => {
      await loadCountry();
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM tracking_state WHERE key = ?", [
        COUNTRY_ASKED_KEY,
      ]);
      const suggestion = countryToSuggest(deviceRegion(), user.signupCountry, isKnownCountryCode, isUk);
      const due = countryAskDue({
        suggestion,
        cached: { country: currentCountry(), pending: false },
        asked: row?.value === "1",
        accountCreatedAt: user.createdAt,
        now: Date.now(),
      });
      if (!due) return;
      // On false another pop-up has this app open: leave the flag alone so
      // the ask comes back on a later open.
      if (!(await requestPromptSlot("country"))) {
        tried.current = false;
        return;
      }
      await db.runAsync("INSERT OR REPLACE INTO tracking_state (key, value) VALUES (?, '1')", [COUNTRY_ASKED_KEY]);
      setSuggested(due);
      track("country_ask.shown", { suggested: due });
    })().catch(() => {});
  }, [enabled, user]);

  const close = useCallback(() => setSuggested(null), []);
  const choose = useCallback(
    async (code: string) => {
      track("country_ask.chose", { suggested, chose: code });
      setSuggested(null);
      await pickCountry(code);
    },
    [suggested]
  );
  const other = useCallback(() => {
    track("country_ask.other", { suggested });
    setSuggested(null);
    router.push("/settings/country" as never);
  }, [router, suggested]);

  const name = suggested ? countryName(suggested) : "";
  const sheet = (
    <AppModal visible={!!suggested} onRequestClose={close}>
      <View style={s.overlay}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.handle} accessible={false} />
          <Text style={s.title} accessibilityRole="header" maxFontSizeMultiplier={fontScaleCap.display}>
            Where do you drive?
          </Text>
          <Text style={s.body} maxFontSizeMultiplier={fontScaleCap.body}>
            Recording and your trips work everywhere. Tax figures, fuel prices and the other UK features are for UK
            drivers for now, so we only show them if you drive in the UK.
          </Text>
          <Pressable
            onPress={() => void choose(suggested!)}
            style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Text style={s.primaryText} maxFontSizeMultiplier={fontScaleCap.heading}>
              {name}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void choose("GB")}
            style={({ pressed }) => [s.secondary, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Text style={s.secondaryText} maxFontSizeMultiplier={fontScaleCap.heading}>
              United Kingdom
            </Text>
          </Pressable>
          <Pressable onPress={other} style={s.link} accessibilityRole="button">
            <Text style={s.linkText} maxFontSizeMultiplier={fontScaleCap.heading}>
              Another country
            </Text>
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
  primary: {
    minHeight: 56,
    borderRadius: radii.lg,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xxl,
  },
  primaryText: { fontSize: 17, fontFamily: fonts.bold, color: colors.bg },
  secondary: {
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  secondaryText: { fontSize: 16, fontFamily: fonts.semibold, color: colors.text1 },
  link: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  linkText: { fontSize: 15, fontFamily: fonts.medium, color: colors.text2 },
});
