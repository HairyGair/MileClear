// Home's one-line tax summary (the tax_readiness slot). Reads the same
// /tax/overview cache as the Tax tab. Renders nothing while loading, on error
// with no cache, and for personas that have no line (SPEC 4).

import { useCallback, useEffect } from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { formatPence } from "@mileclear/shared";
import { useTaxOverview } from "../../lib/tax/useTaxOverview";
import { useMarRelief } from "../../lib/mileageRelief/useMarRelief";
import { homeLineText, overviewOutOfStep, resolvePersona } from "../../lib/tax/persona";
import { useUser } from "../../lib/user/context";
import { useMode } from "../../lib/mode/context";
import { colors, fonts, fontScaleCap, shared, spacing } from "../../lib/theme";

export function TaxSummaryLine() {
  const router = useRouter();
  const { user, isCompanyDriver, isLoading: userLoading } = useUser();
  const { isPersonal } = useMode();
  const { data, refresh } = useTaxOverview();
  const { totalReliefPence } = useMarRelief(data?.relief ?? null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Same rule as the Tax tab: a work type or team change refetches past the caches.
  const outOfStep = overviewOutOfStep(
    data,
    user && !userLoading ? { workType: user.workType, isCompanyDriver } : null,
  );
  useEffect(() => {
    if (outOfStep) void refresh({ fresh: true });
  }, [outOfStep, data?.workType, data?.isCompanyDriver, user?.workType, isCompanyDriver, refresh]);

  const persona = resolvePersona({
    isPersonal,
    isCompanyDriver,
    workType: user?.workType ?? data?.workType,
  });
  const text = homeLineText(persona, data, totalReliefPence, formatPence);
  if (!text) return null;

  return (
    <Pressable
      style={styles.row}
      onPress={() => router.navigate("/(tabs)/tax" as never)}
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint="Opens the Tax tab"
    >
      <Ionicons name="calculator-outline" size={18} color={colors.amber} />
      <Text style={styles.text} numberOfLines={2} maxFontSizeMultiplier={fontScaleCap.body}>
        {text}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={colors.text3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    ...shared.card,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  text: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.text1,
  },
});
